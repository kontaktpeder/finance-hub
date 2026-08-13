import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { authenticateApiKey, requireScope } from "@/lib/api-auth.server";
import { jsonLedgerError, lockPeriod, unlockPeriod } from "@/lib/ledger.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const LockBody = z.object({
  year: z.number().int().min(2000).max(2100),
  month: z.number().int().min(1).max(12),
  reason: z.string().max(2000).optional(),
});

const UnlockBody = z.object({
  year: z.number().int().min(2000).max(2100),
  month: z.number().int().min(1).max(12),
  reason: z.string().min(3).max(2000),
});

export const Route = createFileRoute("/api/public/v1/periods")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const auth = await authenticateApiKey(request);
        if ("error" in auth) return auth.error;
        const forbidden = requireScope(auth.client, "reports:read");
        if (forbidden) return forbidden;
        const { data, error } = await supabaseAdmin
          .from("finance_period_locks")
          .select("period_year, period_month, locked_at, reason")
          .eq("organization_id", auth.client.organization_id)
          .order("period_year", { ascending: false })
          .order("period_month", { ascending: false });
        if (error) return Response.json({ error: error.message }, { status: 500 });
        return Response.json({ data: data ?? [] });
      },
      POST: async ({ request }) => {
        const auth = await authenticateApiKey(request);
        if ("error" in auth) return auth.error;
        const forbidden = requireScope(auth.client, "entries:write");
        if (forbidden) return forbidden;
        let json: unknown;
        try {
          json = await request.json();
        } catch {
          return Response.json({ error: "Invalid JSON" }, { status: 400 });
        }
        const parsed = LockBody.safeParse(json);
        if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 400 });
        try {
          const result = await lockPeriod(supabaseAdmin, {
            organizationId: auth.client.organization_id,
            year: parsed.data.year,
            month: parsed.data.month,
            actorId: null,
            reason: parsed.data.reason,
          });
          return Response.json({ data: result }, { status: 201 });
        } catch (err) {
          return jsonLedgerError(err);
        }
      },
      DELETE: async ({ request }) => {
        const auth = await authenticateApiKey(request);
        if ("error" in auth) return auth.error;
        const forbidden = requireScope(auth.client, "entries:write");
        if (forbidden) return forbidden;
        let json: unknown;
        try {
          json = await request.json();
        } catch {
          return Response.json({ error: "Invalid JSON" }, { status: 400 });
        }
        const parsed = UnlockBody.safeParse(json);
        if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 400 });
        try {
          const result = await unlockPeriod(supabaseAdmin, {
            organizationId: auth.client.organization_id,
            year: parsed.data.year,
            month: parsed.data.month,
            actorId: null,
            reason: parsed.data.reason,
          });
          return Response.json({ data: result });
        } catch (err) {
          return jsonLedgerError(err);
        }
      },
    },
  },
});
