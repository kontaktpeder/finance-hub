import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { authenticateApiKey, requireScope } from "@/lib/api-auth.server";
import { jsonLedgerError, correctEntry } from "@/lib/ledger.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const Body = z.object({
  reason: z.string().min(3).max(2000),
  description: z.string().min(1).max(500),
  category: z.string().max(100).nullable().optional(),
  counterparty: z.string().max(200).nullable().optional(),
  amount_gross: z.number(),
  vat_rate: z.number().min(0).max(100),
  vat_amount: z.number().optional(),
  amount_net: z.number().optional(),
  posting_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export const Route = createFileRoute("/api/public/v1/entries/$entryId/correct")({
  server: {
    handlers: {
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
          const result = await correctEntry(supabaseAdmin, {
            organizationId: auth.client.organization_id,
            entryId: params.entryId,
            reason: parsed.data.reason,
            actorId: null,
            description: parsed.data.description,
            category: parsed.data.category,
            counterparty: parsed.data.counterparty,
            amount_gross: parsed.data.amount_gross,
            vat_rate: parsed.data.vat_rate,
            vat_amount: parsed.data.vat_amount,
            amount_net: parsed.data.amount_net,
            postingDate: parsed.data.posting_date,
            createdVia: "api-correct",
          });
          return Response.json({ data: result });
        } catch (err) {
          return jsonLedgerError(err);
        }
      },
    },
  },
});
