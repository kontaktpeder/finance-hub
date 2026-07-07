import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { authenticateApiKey, requireScope } from "@/lib/api-auth.server";
import { jsonError, moduleAppBaseUrl, withContract } from "@/lib/module-contract.server";
import { runFinanceConfidence } from "@/lib/confidence/confidence.service.server";

export const Route = createFileRoute("/api/public/v1/module/confidence")({
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
          return Response.json(withContract({ ...summary }));
        } catch (e) {
          const msg = e instanceof Error ? e.message : "Failed to compute confidence";
          return jsonError(500, "confidence_error", msg);
        }
      },
      OPTIONS: async () => new Response(null, { status: 204 }),
    },
  },
});
