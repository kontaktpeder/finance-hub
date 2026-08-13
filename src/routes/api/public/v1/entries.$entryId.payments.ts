import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { authenticateApiKey, requireScope } from "@/lib/api-auth.server";
import { jsonLedgerError, recordPayment } from "@/lib/ledger.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const Body = z.object({
  amount: z.number().positive(),
  paid_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  kind: z.enum(["payment", "refund", "credit_note"]).optional(),
  paid_by: z.string().max(200).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
});

export const Route = createFileRoute("/api/public/v1/entries/$entryId/payments")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const auth = await authenticateApiKey(request);
        if ("error" in auth) return auth.error;
        const forbidden = requireScope(auth.client, "entries:read");
        if (forbidden) return forbidden;
        if (!UUID_RE.test(params.entryId)) {
          return Response.json({ error: "Invalid entry_id" }, { status: 400 });
        }
        const { data: entry } = await supabaseAdmin
          .from("finance_entries")
          .select("id, organization_id")
          .eq("id", params.entryId)
          .maybeSingle();
        if (!entry || entry.organization_id !== auth.client.organization_id) {
          return Response.json({ error: "Entry not found" }, { status: 404 });
        }
        const { data, error } = await supabaseAdmin
          .from("finance_payments")
          .select("*")
          .eq("entry_id", params.entryId)
          .order("paid_on", { ascending: true });
        if (error) return Response.json({ error: error.message }, { status: 500 });
        return Response.json({ data: data ?? [] });
      },
      POST: async ({ request, params }) => {
        const auth = await authenticateApiKey(request);
        if ("error" in auth) return auth.error;
        const forbidden = requireScope(auth.client, "entries:write");
        if (forbidden) return forbidden;
        if (!UUID_RE.test(params.entryId)) {
          return Response.json({ error: "Invalid entry_id" }, { status: 400 });
        }
        let json: unknown;
        try {
          json = await request.json();
        } catch {
          return Response.json({ error: "Invalid JSON" }, { status: 400 });
        }
        const parsed = Body.safeParse(json);
        if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 400 });
        try {
          const result = await recordPayment(supabaseAdmin, {
            organizationId: auth.client.organization_id,
            entryId: params.entryId,
            amount: parsed.data.amount,
            paidOn: parsed.data.paid_on,
            kind: parsed.data.kind,
            paidBy: parsed.data.paid_by,
            notes: parsed.data.notes,
            actorId: null,
          });
          return Response.json({ data: result }, { status: 201 });
        } catch (err) {
          return jsonLedgerError(err);
        }
      },
    },
  },
});
