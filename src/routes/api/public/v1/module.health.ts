import { createFileRoute } from "@tanstack/react-router";
import { MODULE_CONTRACT_VERSION, financeModuleInfo, withContract } from "@/lib/module-contract.server";

export const Route = createFileRoute("/api/public/v1/module/health")({
  server: {
    handlers: {
      GET: async () =>
        Response.json(
          withContract({
            status: "ok",
            module_slug: financeModuleInfo.module_slug,
            module_version: financeModuleInfo.module_version,
            time: new Date().toISOString(),
          }),
        ),
      OPTIONS: async () => new Response(null, { status: 204 }),
    },
  },
});

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _keep = MODULE_CONTRACT_VERSION;
