import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const EntryInput = z.object({
  book_id: z.string().uuid().optional(),
  entry_type: z.enum(["income", "expense"]),
  entry_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  description: z.string().min(1).max(500),
  counterparty: z.string().max(200).optional(),
  category: z.string().max(100).optional(),
  category_group: z.string().max(100).optional(),
  amount_gross: z.number(),
  vat_rate: z.number().min(0).max(100).optional(),
  vat_amount: z.number().optional(),
  amount_net: z.number().optional(),
  currency: z.string().max(8).optional(),
  payment_status: z.enum(["unpaid", "paid", "partial", "refunded"]).optional(),
  invoice_status: z.enum(["none", "draft", "sent", "overdue", "paid"]).optional(),
  due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  pre_company_expense: z.boolean().optional(),
  notes: z.string().max(2000).optional(),
  source_app: z.string().max(64).optional(),
  source_type: z.string().max(64).optional(),
  source_ref: z.string().max(200).optional(),
  external_url: z.string().url().optional(),
});

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function authenticate(request: Request) {
  const header = request.headers.get("authorization") || "";
  const token = header.replace(/^Bearer\s+/i, "").trim();
  if (!token) return { error: new Response("Unauthorized", { status: 401 }) };
  const hash = await sha256Hex(token);
  const { data: key, error } = await supabaseAdmin
    .from("api_keys")
    .select("id, api_client_id, revoked_at, api_clients(id, organization_id, allowed_scopes, revoked_at)")
    .eq("key_hash", hash)
    .maybeSingle();
  if (error || !key || key.revoked_at || !key.api_clients || (key.api_clients as any).revoked_at) {
    return { error: new Response("Invalid API key", { status: 401 }) };
  }
  await supabaseAdmin.from("api_clients").update({ last_used_at: new Date().toISOString() }).eq("id", (key.api_clients as any).id);
  return {
    client: key.api_clients as any as { id: string; organization_id: string; allowed_scopes: string[] },
  };
}

function hasScope(client: { allowed_scopes: string[] }, scope: string) {
  return client.allowed_scopes.includes(scope);
}

export const Route = createFileRoute("/api/public/v1/entries")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const auth = await authenticate(request);
        if ("error" in auth) return auth.error;
        if (!hasScope(auth.client, "entries:read")) return new Response("Forbidden", { status: 403 });
        const url = new URL(request.url);
        const limit = Math.min(Number(url.searchParams.get("limit") ?? 100), 500);
        const { data, error } = await supabaseAdmin
          .from("finance_entries")
          .select("*")
          .eq("organization_id", auth.client.organization_id)
          .order("entry_date", { ascending: false })
          .limit(limit);
        if (error) return Response.json({ error: error.message }, { status: 500 });

        const ids = (data ?? []).map((e) => e.id);
        const counts: Record<string, number> = {};
        if (ids.length > 0) {
          const { data: atts } = await supabaseAdmin
            .from("finance_attachments")
            .select("entry_id")
            .eq("organization_id", auth.client.organization_id)
            .in("entry_id", ids);
          for (const a of atts ?? []) {
            if (a.entry_id) counts[a.entry_id] = (counts[a.entry_id] ?? 0) + 1;
          }
        }
        const enriched = (data ?? []).map((e) => ({
          ...e,
          attachment_count: counts[e.id] ?? 0,
          has_attachment: (counts[e.id] ?? 0) > 0,
        }));
        return Response.json({ data: enriched });
      },
      POST: async ({ request }) => {
        const auth = await authenticate(request);
        if ("error" in auth) return auth.error;
        if (!hasScope(auth.client, "entries:write")) return new Response("Forbidden", { status: 403 });
        const body = await request.json().catch(() => null);
        const parsed = EntryInput.safeParse(body);
        if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 400 });
        const v = parsed.data;

        // Idempotency: same (org, source_app, source_ref) → return existing row
        if (v.source_app && v.source_ref) {
          const { data: existing } = await supabaseAdmin
            .from("finance_entries")
            .select("*")
            .eq("organization_id", auth.client.organization_id)
            .eq("source_app", v.source_app)
            .eq("source_ref", v.source_ref)
            .maybeSingle();
          if (existing) return Response.json({ data: existing, duplicate: true }, { status: 200 });
        }



        let bookId = v.book_id;
        if (!bookId) {
          const { data: book } = await supabaseAdmin
            .from("finance_books")
            .select("id")
            .eq("organization_id", auth.client.organization_id)
            .eq("is_default", true)
            .maybeSingle();
          if (!book) return Response.json({ error: "No default book" }, { status: 400 });
          bookId = book.id;
        }

        const gross = v.amount_gross;
        const rate = v.vat_rate ?? 0;
        const vatAmount = v.vat_amount ?? +(gross - gross / (1 + rate / 100)).toFixed(2);
        const net = v.amount_net ?? +(gross - vatAmount).toFixed(2);

        const { data, error } = await supabaseAdmin
          .from("finance_entries")
          .insert({
            organization_id: auth.client.organization_id,
            book_id: bookId,
            entry_type: v.entry_type,
            entry_date: v.entry_date ?? new Date().toISOString().slice(0, 10),
            description: v.description,
            counterparty: v.counterparty ?? null,
            category: v.category ?? null,
            category_group: v.category_group ?? null,
            amount_gross: gross,
            vat_rate: rate,
            vat_amount: vatAmount,
            amount_net: net,
            currency: v.currency ?? "NOK",
            payment_status: v.payment_status ?? "unpaid",
            invoice_status: v.invoice_status ?? "none",
            due_date: v.due_date ?? null,
            pre_company_expense: v.pre_company_expense ?? false,
            notes: v.notes ?? null,
            source_app: v.source_app ?? null,
            source_type: v.source_type ?? null,
            source_ref: v.source_ref ?? null,
            external_url: v.external_url ?? null,
            created_via: "api",
            api_client_id: auth.client.id,
          })
          .select("*")
          .single();
        if (error) return Response.json({ error: error.message }, { status: 400 });
        return Response.json({ data }, { status: 201 });
      },
    },
  },
});
