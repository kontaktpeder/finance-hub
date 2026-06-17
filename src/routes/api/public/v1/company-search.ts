import { createFileRoute } from "@tanstack/react-router";
import { authenticateApiKey } from "@/lib/api-auth.server";

export const Route = createFileRoute("/api/public/v1/company-search")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const auth = await authenticateApiKey(request);
        if ("error" in auth) return auth.error;

        const url = new URL(request.url);
        const q = (url.searchParams.get("q") ?? "").trim();
        if (!q) {
          return Response.json({ error: "invalid_request", message: "missing q" }, { status: 400 });
        }

        const { searchCompanies, BrregUnavailableError } = await import("@/lib/brreg.server");
        try {
          const companies = await searchCompanies(q);
          return Response.json({ data: companies });
        } catch (err: any) {
          if (err instanceof BrregUnavailableError) {
            return Response.json(
              { error: "brreg_unavailable", message: err.message },
              { status: 503 },
            );
          }
          return Response.json({ error: "lookup_failed", message: err?.message }, { status: 500 });
        }
      },
    },
  },
});
