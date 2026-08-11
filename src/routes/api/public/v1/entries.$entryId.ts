import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  DocumentationStatusSchema,
  normalizeCategory,
  syncCategoryGroup,
} from "@/lib/categories";

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function authenticate(request: Request) {
  const token = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return { error: new Response("Unauthorized", { status: 401 }) };
  const hash = await sha256Hex(token);
  const { data: key, error } = await supabaseAdmin
    .from("api_keys")
    .select("id, revoked_at, api_clients(id, organization_id, allowed_scopes, revoked_at)")
    .eq("key_hash", hash)
    .maybeSingle();
  const client = key?.api_clients as any;
  if (error || !key || key.revoked_at || !client || client.revoked_at) {
    return { error: new Response("Invalid API key", { status: 401 }) };
  }
  await supabaseAdmin.from("api_clients").update({ last_used_at: new Date().toISOString() }).eq("id", client.id);
  return { client: client as { id: string; organization_id: string; allowed_scopes: string[] } };
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const EntryPatchInput = z
  .object({
    description: z.string().min(1).max(500).optional(),
    counterparty: z.string().max(200).nullable().optional(),
    category: z.string().max(100).nullable().optional(),
    category_group: z.string().max(100).nullable().optional(),
    notes: z.string().max(2000).nullable().optional(),
    pre_company_expense: z.boolean().optional(),
    payment_status: z.enum(["unpaid", "paid", "partial", "refunded"]).optional(),
    invoice_status: z.enum(["none", "draft", "sent", "overdue", "paid"]).optional(),
    paid_by: z.string().max(200).nullable().optional(),
    reimbursed: z.boolean().optional(),
    accountant_approved: z.boolean().optional(),
    documentation_status: DocumentationStatusSchema.optional(),
    entry_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    amount_gross: z.number().optional(),
    vat_rate: z.number().min(0).max(100).optional(),
    vat_amount: z.number().optional(),
    amount_net: z.number().optional(),
  })
  .strict();

export const Route = createFileRoute("/api/public/v1/entries/$entryId")({
  server: {
    handlers: {
      PATCH: async ({ request, params }) => {
        const auth = await authenticate(request);
        if ("error" in auth) return auth.error;
        if (!auth.client.allowed_scopes.includes("entries:write")) {
          return new Response("Forbidden", { status: 403 });
        }

        const entryId = params.entryId;
        if (!UUID_RE.test(entryId)) {
          return Response.json({ error: "Invalid entry_id" }, { status: 400 });
        }

        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return Response.json({ error: "Invalid JSON" }, { status: 400 });
        }
        const parsed = EntryPatchInput.safeParse(body);
        if (!parsed.success) {
          return Response.json({ error: parsed.error.flatten() }, { status: 400 });
        }
        const v = parsed.data;
        if (Object.keys(v).length === 0) {
          return Response.json({ error: "No fields to update" }, { status: 400 });
        }

        const { data: existing } = await supabaseAdmin
          .from("finance_entries")
          .select("id, organization_id, amount_gross, vat_rate")
          .eq("id", entryId)
          .maybeSingle();
        if (!existing || existing.organization_id !== auth.client.organization_id) {
          return Response.json({ error: "Entry not found" }, { status: 404 });
        }

        const patch: {
          description?: string;
          counterparty?: string | null;
          category?: string | null;
          category_group?: string | null;
          notes?: string | null;
          pre_company_expense?: boolean;
          payment_status?: "unpaid" | "paid" | "partial" | "refunded";
          invoice_status?: "none" | "draft" | "sent" | "overdue" | "paid";
          paid_by?: string | null;
          reimbursed?: boolean;
          accountant_approved?: boolean;
          documentation_status?: "unknown" | "missing" | "incomplete" | "complete";
          entry_date?: string;
          amount_gross?: number;
          vat_rate?: number;
          vat_amount?: number;
          amount_net?: number;
        } = {};

        if (v.description !== undefined) patch.description = v.description;
        if (v.counterparty !== undefined) patch.counterparty = v.counterparty;
        if (v.notes !== undefined) patch.notes = v.notes;
        if (v.pre_company_expense !== undefined) patch.pre_company_expense = v.pre_company_expense;
        if (v.payment_status !== undefined) patch.payment_status = v.payment_status;
        if (v.invoice_status !== undefined) patch.invoice_status = v.invoice_status;
        if (v.paid_by !== undefined) patch.paid_by = v.paid_by;
        if (v.reimbursed !== undefined) patch.reimbursed = v.reimbursed;
        if (v.accountant_approved !== undefined) patch.accountant_approved = v.accountant_approved;
        if (v.documentation_status !== undefined) patch.documentation_status = v.documentation_status;
        if (v.entry_date !== undefined) patch.entry_date = v.entry_date;
        if (v.amount_gross !== undefined) patch.amount_gross = v.amount_gross;
        if (v.vat_rate !== undefined) patch.vat_rate = v.vat_rate;
        if (v.vat_amount !== undefined) patch.vat_amount = v.vat_amount;
        if (v.amount_net !== undefined) patch.amount_net = v.amount_net;

        if (v.category !== undefined) {
          if (v.category === null) {
            patch.category = null;
            patch.category_group = null;
          } else {
            const cat = normalizeCategory(v.category);
            if (!cat) {
              return Response.json(
                { error: `Invalid category. Allowed: Varekost, Driftsutstyr, Driftskostnader, Administrasjon, Salg` },
                { status: 400 },
              );
            }
            patch.category = cat;
            patch.category_group = syncCategoryGroup(cat);
          }
        } else if (v.category_group !== undefined) {
          if (v.category_group === null) {
            patch.category = null;
            patch.category_group = null;
          } else {
            const cat = normalizeCategory(v.category_group);
            if (!cat) {
              return Response.json(
                { error: `Invalid category_group. Allowed: Varekost, Driftsutstyr, Driftskostnader, Administrasjon, Salg` },
                { status: 400 },
              );
            }
            patch.category = cat;
            patch.category_group = syncCategoryGroup(cat);
          }
        }

        if (v.amount_gross !== undefined || v.vat_rate !== undefined) {
          const gross = v.amount_gross ?? Number(existing.amount_gross);
          const rate = v.vat_rate ?? Number(existing.vat_rate);
          if (v.vat_amount === undefined) {
            patch.vat_amount = +(gross - gross / (1 + rate / 100)).toFixed(2);
          }
          if (v.amount_net === undefined) {
            const vatAmt = patch.vat_amount ?? v.vat_amount ?? 0;
            patch.amount_net = +(gross - vatAmt).toFixed(2);
          }
        }

        const { data, error } = await supabaseAdmin
          .from("finance_entries")
          .update(patch)
          .eq("id", entryId)
          .eq("organization_id", auth.client.organization_id)
          .select("*")
          .single();
        if (error) return Response.json({ error: error.message }, { status: 400 });
        return Response.json({ data });
      },

      DELETE: async ({ request, params }) => {
        const auth = await authenticate(request);
        if ("error" in auth) return auth.error;
        if (!auth.client.allowed_scopes.includes("entries:write")) {
          return new Response("Forbidden", { status: 403 });
        }

        const entryId = params.entryId;
        if (!UUID_RE.test(entryId)) {
          return Response.json({ error: "Invalid entry_id" }, { status: 400 });
        }

        const { data: entry } = await supabaseAdmin
          .from("finance_entries")
          .select("id, organization_id")
          .eq("id", entryId)
          .maybeSingle();
        if (!entry || entry.organization_id !== auth.client.organization_id) {
          return Response.json({ error: "Entry not found" }, { status: 404 });
        }

        // First: delete all linked attachments (storage + DB)
        const { data: attachments } = await supabaseAdmin
          .from("finance_attachments")
          .select("id, storage_path")
          .eq("entry_id", entryId)
          .eq("organization_id", auth.client.organization_id);

        const paths = (attachments ?? []).map((a) => a.storage_path).filter(Boolean);
        if (paths.length > 0) {
          await supabaseAdmin.storage.from("finance-attachments").remove(paths);
        }
        const attachmentIds = (attachments ?? []).map((a) => a.id);
        if (attachmentIds.length > 0) {
          await supabaseAdmin.from("finance_attachments").delete().in("id", attachmentIds);
        }

        // Then: delete the entry
        const { error: delErr } = await supabaseAdmin
          .from("finance_entries")
          .delete()
          .eq("id", entryId)
          .eq("organization_id", auth.client.organization_id);
        if (delErr) return Response.json({ error: delErr.message }, { status: 500 });

        return Response.json({
          data: { deleted: true, id: entryId, attachments_deleted: attachmentIds.length },
        });
      },
    },
  },
});
