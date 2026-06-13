import { createFileRoute } from "@tanstack/react-router";
import { authenticateApiKey, requireScope } from "@/lib/api-auth.server";
import { InvoiceCreateSchema } from "@/lib/invoices.validation";
import { createInvoiceWithLines } from "@/lib/invoices.service.server";

export const Route = createFileRoute("/api/public/v1/invoices")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const auth = await authenticateApiKey(request);
        if ("error" in auth) return auth.error;
        const scopeErr = requireScope(auth.client, "invoices:read");
        if (scopeErr) return scopeErr;

        const url = new URL(request.url);
        const limit = Math.min(Number(url.searchParams.get("limit") ?? 100), 500);
        const status = url.searchParams.get("status");

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        let q = supabaseAdmin
          .from("invoices")
          .select("*")
          .eq("organization_id", auth.client.organization_id)
          .order("created_at", { ascending: false })
          .limit(limit);
        if (status) q = q.eq("status", status as any);
        const { data, error } = await q;
        if (error) return Response.json({ error: error.message }, { status: 500 });
        return Response.json({ data });
      },

      POST: async ({ request }) => {
        const auth = await authenticateApiKey(request);
        if ("error" in auth) return auth.error;
        const scopeErr = requireScope(auth.client, "invoices:write");
        if (scopeErr) return scopeErr;

        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return Response.json({ error: "invalid_request", message: "Invalid JSON" }, { status: 400 });
        }
        const parsed = InvoiceCreateSchema.safeParse(body);
        if (!parsed.success) {
          return Response.json(
            { error: "invalid_request", message: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") },
            { status: 400 },
          );
        }

        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const id = await createInvoiceWithLines(supabaseAdmin, {
            organizationId: auth.client.organization_id,
            ...parsed.data,
          });
          const { data: invoice } = await supabaseAdmin
            .from("invoices")
            .select("*, invoice_lines(*)")
            .eq("id", id)
            .single();
          return Response.json({ data: invoice }, { status: 201 });
        } catch (err: any) {
          return Response.json({ error: "create_failed", message: err?.message }, { status: 500 });
        }
      },
    },
  },
});
