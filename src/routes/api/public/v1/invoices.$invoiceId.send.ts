import { createFileRoute } from "@tanstack/react-router";
import { authenticateApiKey, requireScope } from "@/lib/api-auth.server";
import { sendInvoice } from "@/lib/invoices.service.server";
import { slugSourceApp } from "@/lib/invoices.accounting.server";

export const Route = createFileRoute("/api/public/v1/invoices/$invoiceId/send")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const auth = await authenticateApiKey(request);
        if ("error" in auth) return auth.error;
        const scopeErr = requireScope(auth.client, "invoices:write");
        if (scopeErr) return scopeErr;

        const invoiceId = params.invoiceId;
        if (!/^[0-9a-f-]{36}$/i.test(invoiceId)) {
          return Response.json({ error: "invalid_request", message: "invalid invoice id" }, { status: 400 });
        }

        let body: any = {};
        try {
          const text = await request.text();
          if (text) body = JSON.parse(text);
        } catch {
          return Response.json({ error: "invalid_request", message: "Invalid JSON" }, { status: 400 });
        }

        const sourceApp =
          (typeof body?.source_app === "string" && body.source_app.trim()) ||
          slugSourceApp(auth.client.name);

        try {
          const invoice = await sendInvoice({
            organizationId: auth.client.organization_id,
            invoiceId,
            sourceApp,
            apiClientId: auth.client.id,
          });
          return Response.json({ data: invoice });
        } catch (err: any) {
          const msg = err?.message ?? "Send failed";
          const status = /ikke funnet/i.test(msg) ? 404 : 400;
          return Response.json({ error: "send_failed", message: msg }, { status });
        }
      },
    },
  },
});
