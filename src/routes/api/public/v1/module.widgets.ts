import { createFileRoute } from "@tanstack/react-router";
import { authenticateApiKey, requireScope } from "@/lib/api-auth.server";
import {
  financeModuleWidgets,
  jsonError,
  withContract,
} from "@/lib/module-contract.server";
import { computeWidget } from "@/lib/module-widgets.server";

export const Route = createFileRoute("/api/public/v1/module/widgets")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const auth = await authenticateApiKey(request);
        if ("error" in auth) return auth.error;
        const scopeErr = requireScope(auth.client, "platform:read");
        if (scopeErr) return scopeErr;

        const url = new URL(request.url);
        const idsParam = url.searchParams.get("ids") ?? "";
        const requested = idsParam
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);

        const knownIds = new Set(financeModuleWidgets.map((w) => w.id));
        const ids = (requested.length ? requested : Array.from(knownIds)).filter((id) =>
          knownIds.has(id),
        );

        try {
          const results = await Promise.all(
            ids.map(async (id) => await computeWidget(id, auth.client.organization_id)),
          );
          const widgets = results.filter((w): w is NonNullable<typeof w> => w !== null);
          return Response.json(withContract({ widgets }));
        } catch (e: any) {
          return jsonError(500, "widget_error", e?.message ?? "Failed to compute widgets");
        }
      },
      OPTIONS: async () => new Response(null, { status: 204 }),
    },
  },
});
