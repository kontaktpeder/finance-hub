// Server-only: auto-create / update finance_entries when an invoice is sent or paid.

export function slugSourceApp(name: string): string {
  return (name || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 64) || "external";
}

function todayDate(): string {
  return new Date().toISOString().slice(0, 10);
}

async function getDefaultBookId(supabase: any, organizationId: string): Promise<string> {
  const { data: book, error } = await supabase
    .from("finance_books")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("is_default", true)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!book) {
    throw new Error(
      "Ingen standard regnskapsbok funnet for organisasjonen. Opprett en bok merket som standard først.",
    );
  }
  return (book as any).id as string;
}

async function linkInvoicePdfToEntry(
  supabase: any,
  params: { organizationId: string; invoiceId: string; entryId: string; pdfAttachmentId?: string | null },
): Promise<void> {
  let attachmentId = params.pdfAttachmentId ?? null;
  if (!attachmentId) {
    const { data: inv, error } = await supabase
      .from("invoices")
      .select("pdf_attachment_id")
      .eq("id", params.invoiceId)
      .eq("organization_id", params.organizationId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    attachmentId = (inv as any)?.pdf_attachment_id ?? null;
  }
  if (!attachmentId) return;
  const { error: attachmentErr } = await supabase
    .from("finance_attachments")
    .update({ entry_id: params.entryId })
    .eq("id", attachmentId)
    .eq("organization_id", params.organizationId);
  if (attachmentErr) throw new Error(attachmentErr.message);
}

export async function createFinanceEntryForInvoice(params: {
  supabase: any;
  invoiceId: string;
  organizationId: string;
  sourceApp?: string | null;
  apiClientId?: string | null;
  createdBy?: string | null;
}): Promise<string> {
  const { supabase, invoiceId, organizationId } = params;
  const sourceApp = params.sourceApp ?? "finance-core";

  const { data: invoice, error: invErr } = await supabase
    .from("invoices")
    .select(
      "id, organization_id, status, invoice_number, issue_date, due_date, total, subtotal, vat_amount, customer_name, finance_entry_id, paid_at, pdf_attachment_id",
    )
    .eq("id", invoiceId)
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (invErr) throw new Error(invErr.message);
  if (!invoice) throw new Error("Faktura ikke funnet");

  const inv = invoice as any;
  if (inv.finance_entry_id) {
    await linkInvoicePdfToEntry(supabase, {
      organizationId,
      invoiceId,
      entryId: inv.finance_entry_id as string,
      pdfAttachmentId: inv.pdf_attachment_id,
    });
    return inv.finance_entry_id as string;
  }
  if (inv.status !== "sent" && inv.status !== "paid") {
    throw new Error("Regnskapspost kan kun opprettes for sendt eller betalt faktura");
  }
  if (!inv.invoice_number) {
    throw new Error("Faktura mangler fakturanummer");
  }

  // Idempotency: look for existing entry with same (org, source_app, source_type, source_ref)
  const { data: existing } = await supabase
    .from("finance_entries")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("source_app", sourceApp)
    .eq("source_type", "invoice")
    .eq("source_ref", inv.invoice_number)
    .maybeSingle();
  if (existing) {
    const existingId = (existing as any).id as string;
    await supabase.from("invoices").update({ finance_entry_id: existingId }).eq("id", invoiceId);
    await linkInvoicePdfToEntry(supabase, {
      organizationId,
      invoiceId,
      entryId: existingId,
      pdfAttachmentId: inv.pdf_attachment_id,
    });
    return existingId;
  }

  const bookId = await getDefaultBookId(supabase, organizationId);

  // Try to reuse invoice_number as voucher_number for clarity in UI.
  // Faktura- og bilagssekvenser kan divergere ved kollisjon: hvis bilagsnummeret
  // allerede er brukt i boken (f.eks. av en utgift), faller vi tilbake til at
  // trigger assign_voucher_number tildeler neste ledige bilagsnummer.
  let preferredVoucher: string | null = null;
  {
    const { data: clash } = await supabase
      .from("finance_entries")
      .select("id")
      .eq("book_id", bookId)
      .eq("voucher_number", inv.invoice_number)
      .limit(1)
      .maybeSingle();
    if (!clash) {
      preferredVoucher = inv.invoice_number;
    } else {
      console.warn(
        `[invoices.accounting] voucher_number ${inv.invoice_number} already used in book ${bookId}; falling back to auto-assigned voucher`,
      );
    }
  }

  const isPaid = inv.status === "paid";

  const payload = {
    organization_id: organizationId,
    book_id: bookId,
    entry_type: "income",
    entry_date: inv.issue_date,
    amount_gross: inv.total,
    amount_net: inv.subtotal,
    vat_amount: inv.vat_amount,
    vat_rate: 0,
    counterparty: inv.customer_name,
    description: `Faktura ${inv.invoice_number}`,
    category: "Salg",
    category_group: "Inntekter",
    payment_status: isPaid ? "paid" : "unpaid",
    invoice_status: isPaid ? "paid" : "sent",
    due_date: inv.due_date ?? null,
    paid_at: isPaid ? todayDate() : null,
    source_app: sourceApp,
    source_type: "invoice",
    source_ref: inv.invoice_number,
    created_via: "invoice-send",
    api_client_id: params.apiClientId ?? null,
    created_by: params.createdBy ?? null,
    ...(preferredVoucher ? { voucher_number: preferredVoucher } : {}),
  };

  const { data: inserted, error: insErr } = await supabase
    .from("finance_entries")
    .insert(payload)
    .select("id")
    .single();

  if (insErr) {
    // 23505 unique violation → another writer beat us; refetch and link.
    if ((insErr as any).code === "23505") {
      const { data: race } = await supabase
        .from("finance_entries")
        .select("id")
        .eq("organization_id", organizationId)
        .eq("source_app", sourceApp)
        .eq("source_type", "invoice")
        .eq("source_ref", inv.invoice_number)
        .maybeSingle();
      if (race) {
        const raceId = (race as any).id as string;
        await supabase.from("invoices").update({ finance_entry_id: raceId }).eq("id", invoiceId);
        await linkInvoicePdfToEntry(supabase, {
          organizationId,
          invoiceId,
          entryId: raceId,
          pdfAttachmentId: inv.pdf_attachment_id,
        });
        return raceId;
      }
    }
    throw new Error(insErr.message);
  }

  const entryId = (inserted as any).id as string;
  const { error: linkErr } = await supabase
    .from("invoices")
    .update({ finance_entry_id: entryId })
    .eq("id", invoiceId);
  if (linkErr) throw new Error(linkErr.message);
  await linkInvoicePdfToEntry(supabase, {
    organizationId,
    invoiceId,
    entryId,
    pdfAttachmentId: inv.pdf_attachment_id,
  });
  return entryId;
}

export async function markFinanceEntryPaidForInvoice(params: {
  supabase: any;
  invoice: any;
  sourceApp?: string | null;
  apiClientId?: string | null;
  createdBy?: string | null;
}): Promise<void> {
  const { supabase, invoice } = params;
  let entryId: string | null = invoice.finance_entry_id ?? null;

  if (!entryId) {
    entryId = await createFinanceEntryForInvoice({
      supabase,
      invoiceId: invoice.id,
      organizationId: invoice.organization_id,
      sourceApp: params.sourceApp,
      apiClientId: params.apiClientId,
      createdBy: params.createdBy,
    });
  }

  const { error } = await supabase
    .from("finance_entries")
    .update({
      payment_status: "paid",
      invoice_status: "paid",
      paid_at: todayDate(),
    })
    .eq("id", entryId);
  if (error) throw new Error(error.message);
}
