import { createFileRoute } from "@tanstack/react-router";
import { authenticateApiKey, requireScope } from "@/lib/api-auth.server";
import { InvoicePatchSchema, MarkPaidSchema } from "@/lib/invoices.validation";
import { updateDraftInvoice, markInvoicePaid } from "@/lib/invoices.service.server";
import { slugSourceApp } from "@/lib/invoices.accounting.server";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const Route = createFileRoute("/api/public/v1/invoices/$invoiceId")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const auth = await authenticateApiKey(request);
        if ("error" in auth) return auth.error;
        const scopeErr = requireScope(auth.client, "invoices:read");
        if (scopeErr) return scopeErr;
        if (!UUID_RE.test(params.invoiceId)) {
          return Response.json({ error: "invalid_request", message: "invalid invoice id" }, { status: 400 });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data, error } = await supabaseAdmin
          .from("invoices")
          .select("*, invoice_lines(*)")
          .eq("id", params.invoiceId)
          .eq("organization_id", auth.client.organization_id)
          .maybeSingle();

        if (error) return Response.json({ error: error.message }, { status: 500 });
        if (!data) return Response.json({ error: "not_found" }, { status: 404 });

        const lines = ((data as any).invoice_lines ?? []).sort(
          (a: any, b: any) => (a.sort_order ?? 0) - (b.sort_order ?? 0),
        );
        return Response.json({ data: { ...data, invoice_lines: lines } });
      },

      PATCH: async ({ request, params }) => {
        const auth = await authenticateApiKey(request);
        if ("error" in auth) return auth.error;
        const scopeErr = requireScope(auth.client, "invoices:write");
        if (scopeErr) return scopeErr;
        if (!UUID_RE.test(params.invoiceId)) {
          return Response.json({ error: "invalid_request", message: "invalid invoice id" }, { status: 400 });
        }

        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return Response.json({ error: "invalid_request", message: "Invalid JSON" }, { status: 400 });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        try {
          if (typeof body === "object" && body !== null && "status" in body) {
            const parsed = MarkPaidSchema.safeParse(body);
            if (!parsed.success) {
              return Response.json({ error: "invalid_request", message: "Only status=paid is allowed" }, { status: 400 });
            }
            const invoice = await markInvoicePaid(supabaseAdmin, {
              organizationId: auth.client.organization_id,
              invoiceId: params.invoiceId,
            });
            return Response.json({ data: invoice });
          }

          const parsed = InvoicePatchSchema.safeParse(body);
          if (!parsed.success) {
            return Response.json(
              { error: "invalid_request", message: parsed.error.issues.map((i) => i.message).join("; ") },
              { status: 400 },
            );
          }
          const invoice = await updateDraftInvoice(supabaseAdmin, {
            organizationId: auth.client.organization_id,
            invoiceId: params.invoiceId,
            patch: parsed.data,
          });
          return Response.json({ data: invoice });
        } catch (err: any) {
          const msg = err?.message ?? "Update failed";
          const status = /ikke funnet/i.test(msg) ? 404 : 400;
          return Response.json({ error: "update_failed", message: msg }, { status });
        }
      },
    },
  },
});
