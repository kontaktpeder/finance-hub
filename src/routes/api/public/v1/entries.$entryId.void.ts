import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { authenticateApiKey, requireScope } from "@/lib/api-auth.server";
import { jsonLedgerError, voidEntry } from "@/lib/ledger.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const Body = z.object({
  reason: z.string().min(3).max(2000),
  private_expense: z.boolean().optional(),
  posting_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export const Route = createFileRoute("/api/public/v1/entries/$entryId/void")({
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
          const result = await voidEntry(supabaseAdmin, {
            organizationId: auth.client.organization_id,
            entryId: params.entryId,
            reason: parsed.data.reason,
            actorId: null,
            privateExpense: parsed.data.private_expense,
            postingDate: parsed.data.posting_date,
            createdVia: "api-void",
          });
          return Response.json({ data: result });
        } catch (err) {
          return jsonLedgerError(err);
        }
      },
    },
  },
});
