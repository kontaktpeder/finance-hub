import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { InvoiceCreateSchema, InvoicePatchSchema } from "./invoices.validation";

const SendInput = z.object({
  organizationId: z.string().uuid(),
  invoiceId: z.string().uuid(),
});

async function requireEditor(supabase: any, organizationId: string, userId: string) {
  const { data: membership } = await supabase
    .from("organization_members")
    .select("role")
    .eq("organization_id", organizationId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!membership || !["owner", "admin", "editor"].includes((membership as any).role)) {
    throw new Error("Du har ikke tilgang.");
  }
}

export const sendInvoiceFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => SendInput.parse(input))
  .handler(async ({ data, context }) => {
    await requireEditor(context.supabase, data.organizationId, context.userId);
    const { sendInvoice } = await import("./invoices.service.server");
    return sendInvoice({
      organizationId: data.organizationId,
      invoiceId: data.invoiceId,
      userId: context.userId,
      sourceApp: "finance-core-ui",
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
    return { url: signed.signedUrl, fileName: `${(invoice as any).invoice_number ?? "faktura"}.pdf` };
  });

export const createInvoiceFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ organizationId: z.string().uuid(), invoice: InvoiceCreateSchema }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await requireEditor(context.supabase, data.organizationId, context.userId);
    const { createInvoiceWithLines } = await import("./invoices.service.server");
    const id = await createInvoiceWithLines(context.supabase, {
      organizationId: data.organizationId,
      userId: context.userId,
      ...data.invoice,
    });
    const { data: invoice } = await context.supabase
      .from("invoices")
      .select("*, invoice_lines(*)")
      .eq("id", id)
      .single();
    return invoice;
  });

export const updateDraftInvoiceFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      organizationId: z.string().uuid(),
      invoiceId: z.string().uuid(),
      patch: InvoicePatchSchema,
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await requireEditor(context.supabase, data.organizationId, context.userId);
    const { updateDraftInvoice } = await import("./invoices.service.server");
    return updateDraftInvoice(context.supabase, {
      organizationId: data.organizationId,
      invoiceId: data.invoiceId,
      patch: data.patch,
    });
  });

export const markInvoicePaidFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ organizationId: z.string().uuid(), invoiceId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await requireEditor(context.supabase, data.organizationId, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { markInvoicePaid } = await import("./invoices.service.server");
    return markInvoicePaid(supabaseAdmin, {
      organizationId: data.organizationId,
      invoiceId: data.invoiceId,
      sourceApp: "finance-core-ui",
      createdBy: context.userId,
    });
  });
