import { createFileRoute } from "@tanstack/react-router";
import { authenticateApiKey, requireScope } from "@/lib/api-auth.server";

export const Route = createFileRoute("/api/public/v1/invoices/$invoiceId/pdf")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const auth = await authenticateApiKey(request);
        if ("error" in auth) return auth.error;
        const scopeErr = requireScope(auth.client, "invoices:read");
        if (scopeErr) return scopeErr;

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: invoice } = await supabaseAdmin
          .from("invoices")
          .select("id, invoice_number, pdf_attachment_id, finance_attachments:pdf_attachment_id(storage_path)")
          .eq("id", params.invoiceId)
          .eq("organization_id", auth.client.organization_id)
          .maybeSingle();
        const path = (invoice as any)?.finance_attachments?.storage_path as string | undefined;
        if (!invoice || !path) return new Response("Not found", { status: 404 });

        const { data: file, error } = await supabaseAdmin.storage
          .from("finance-attachments")
          .download(path);
        if (error || !file) return new Response("PDF not available", { status: 404 });

        return new Response(file, {
          headers: {
            "Content-Type": "application/pdf",
            "Content-Disposition": `inline; filename="${(invoice as any).invoice_number}.pdf"`,
          },
        });
      },
    },
  },
});
