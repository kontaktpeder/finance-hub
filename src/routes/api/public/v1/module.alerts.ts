import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { authenticateApiKey, requireScope } from "@/lib/api-auth.server";
import { jsonError, moduleAppBaseUrl, withContract } from "@/lib/module-contract.server";
import { runFinanceConfidence } from "@/lib/confidence/confidence.service.server";
import { confidenceToAlerts } from "@/lib/confidence/confidence-to-alerts.server";

export const Route = createFileRoute("/api/public/v1/module/alerts")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const auth = await authenticateApiKey(request);
        if ("error" in auth) return auth.error;
        const scopeErr = requireScope(auth.client, "platform:read");
        if (scopeErr) return scopeErr;

        try {
          const base = moduleAppBaseUrl(request);
          const summary = await runFinanceConfidence({
            supabase: supabaseAdmin,
            organizationId: auth.client.organization_id,
            actionBase: base,
          });
          const alerts = confidenceToAlerts(summary, base, auth.client.organization_id);
          return Response.json(withContract({ alerts }));
        } catch (e) {
          const msg = e instanceof Error ? e.message : "Failed to compute alerts";
          return jsonError(500, "alerts_error", msg);
        }
      },
      OPTIONS: async () => new Response(null, { status: 204 }),
    },
  },
});
