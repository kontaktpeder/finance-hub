import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const SendInput = z.object({
  organizationId: z.string().uuid(),
  invoiceId: z.string().uuid(),
});

export const sendInvoiceFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => SendInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: membership } = await supabase
      .from("organization_members")
      .select("role")
      .eq("organization_id", data.organizationId)
      .eq("user_id", userId)
      .maybeSingle();
    if (!membership || !["owner", "admin", "editor"].includes((membership as any).role)) {
      throw new Error("Du har ikke tilgang til å sende fakturaer for denne organisasjonen.");
    }
    const { sendInvoice } = await import("./invoices.service.server");
    return sendInvoice({
      organizationId: data.organizationId,
      invoiceId: data.invoiceId,
      userId,
    });
  });

const DownloadInput = z.object({
  organizationId: z.string().uuid(),
  invoiceId: z.string().uuid(),
});

export const getInvoicePdfUrlFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => DownloadInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: invoice, error } = await supabase
      .from("invoices")
      .select("id, organization_id, invoice_number, pdf_attachment_id, finance_attachments:pdf_attachment_id(storage_path)")
      .eq("id", data.invoiceId)
      .eq("organization_id", data.organizationId)
      .maybeSingle();
    if (error || !invoice) throw new Error("Faktura ikke funnet");
    const path = (invoice as any).finance_attachments?.storage_path as string | undefined;
    if (!path) throw new Error("PDF er ikke generert ennå");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: signed, error: sErr } = await supabaseAdmin.storage
      .from("finance-attachments")
      .createSignedUrl(path, 600);
    if (sErr || !signed) throw new Error(sErr?.message ?? "Kunne ikke lage nedlastings-URL");
    return { url: signed.signedUrl, fileName: `${(invoice as any).invoice_number}.pdf` };
  });
