import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { authenticateApiKey, requireScope } from "@/lib/api-auth.server";
import {
  jsonError,
  moduleAppBaseUrl,
  orgHomeDeepLink,
  withContract,
} from "@/lib/module-contract.server";

export const Route = createFileRoute("/api/public/v1/module/organization")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const auth = await authenticateApiKey(request);
        if ("error" in auth) return auth.error;
        const scopeErr = requireScope(auth.client, "platform:read");
        if (scopeErr) return scopeErr;

        const { data: org, error } = await supabaseAdmin
          .from("organizations")
          .select("id, name, kind, org_number, country, created_at")
          .eq("id", auth.client.organization_id)
          .maybeSingle();

        if (error) return jsonError(500, "db_error", error.message);
        if (!org) return jsonError(404, "organization_not_found", "Organization not found");

        const base = moduleAppBaseUrl(request);
        return Response.json(
          withContract({
            organization: {
              id: org.id,
              name: org.name,
              kind: org.kind,
              org_number: org.org_number,
              country: org.country,
              created_at: org.created_at,
            },
            deep_links: {
              org_home: orgHomeDeepLink(base, org.id),
            },
          }),
        );
      },
      OPTIONS: async () => new Response(null, { status: 204 }),
    },
  },
});
