import { buildSellerSnapshot } from "./invoices.seller.server";
import { renderInvoicePdf } from "./invoices.pdf.server";
import { storeInvoicePdf } from "./invoices.storage.server";

export async function sendInvoice(params: {
  organizationId: string;
  invoiceId: string;
  userId?: string | null;
}) {
  const { organizationId, invoiceId, userId } = params;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const { data: invoice, error } = await supabaseAdmin
    .from("invoices")
    .select("*, invoice_lines(*)")
    .eq("id", invoiceId)
    .eq("organization_id", organizationId)
    .single();

  if (error || !invoice) throw new Error("Faktura ikke funnet");
  if ((invoice as any).status !== "draft") throw new Error("Kun utkast kan sendes");
  const lines = ((invoice as any).invoice_lines ?? []) as any[];
  if (lines.length === 0) throw new Error("Faktura må ha minst én linje");

  const sellerSnapshot = await buildSellerSnapshot(supabaseAdmin as any, organizationId);
  if (!sellerSnapshot.name || !sellerSnapshot.address || !sellerSnapshot.bank_account) {
    throw new Error("Selgerinformasjon er ufullstendig. Fyll ut adresse og kontonummer under Innstillinger.");
  }

  const { data: sent, error: updErr } = await supabaseAdmin
    .from("invoices")
    .update({
      status: "sent",
      seller_snapshot: sellerSnapshot as any,
    })
    .eq("id", invoiceId)
    .eq("organization_id", organizationId)
    .eq("status", "draft")
    .select("*, invoice_lines(*)")
    .single();

  if (updErr || !sent || !(sent as any).invoice_number) {
    throw new Error(updErr?.message ?? "Kunne ikke sende faktura");
  }
  const sentAny = sent as any;

  const sortedLines = (sentAny.invoice_lines ?? [])
    .slice()
    .sort((a: any, b: any) => (a.sort_order ?? 0) - (b.sort_order ?? 0));

  const pdf = await renderInvoicePdf({
    invoice_number: sentAny.invoice_number,
    issue_date: sentAny.issue_date,
    due_date: sentAny.due_date,
    customer_name: sentAny.customer_name,
    customer_org_number: sentAny.customer_org_number,
    customer_email: sentAny.customer_email,
    customer_address: sentAny.customer_address,
    seller_snapshot: sentAny.seller_snapshot,
    lines: sortedLines.map((l: any) => ({
      description: l.description,
      quantity: Number(l.quantity),
      unit_price: Number(l.unit_price),
      vat_rate: Number(l.vat_rate),
      line_net: Number(l.line_net),
      line_vat: Number(l.line_vat),
      line_total: Number(l.line_total),
    })),
    subtotal: Number(sentAny.subtotal),
    vat_amount: Number(sentAny.vat_amount),
    total: Number(sentAny.total),
  });

  const attachmentId = await storeInvoicePdf(supabaseAdmin as any, {
    organizationId,
    invoiceId,
    invoiceNumber: sentAny.invoice_number,
    pdf,
    uploadedBy: userId ?? null,
  });

  const { data: linked, error: linkErr } = await supabaseAdmin
    .from("invoices")
    .update({ pdf_attachment_id: attachmentId })
    .eq("id", invoiceId)
    .select("*, invoice_lines(*)")
    .single();
  if (linkErr) throw new Error(linkErr.message);

  return linked;
}

export async function createInvoiceWithLines(
  supabase: any,
  params: {
    organizationId: string;
    userId?: string | null;
    issue_date?: string;
    due_date?: string | null;
    customer_name: string;
    customer_org_number?: string | null;
    customer_email?: string | null;
    customer_address?: string | null;
    lines: Array<{
      description: string;
      quantity: number;
      unit_price: number;
      vat_rate: number;
    }>;
  },
) {
  const { calcLine, calcInvoiceTotals } = await import("./invoices.calc");
  const totals = calcInvoiceTotals(params.lines);

  const { data: invoice, error } = await supabase
    .from("invoices")
    .insert({
      organization_id: params.organizationId,
      issue_date: params.issue_date ?? new Date().toISOString().slice(0, 10),
      due_date: params.due_date ?? null,
      customer_name: params.customer_name,
      customer_org_number: params.customer_org_number ?? null,
      customer_email: params.customer_email ?? null,
      customer_address: params.customer_address ?? null,
      subtotal: totals.subtotal,
      vat_amount: totals.vat_amount,
      total: totals.total,
      created_by: params.userId ?? null,
    })
    .select("id")
    .single();
  if (error || !invoice) throw new Error(error?.message ?? "Kunne ikke opprette faktura");

  const linesPayload = params.lines.map((l, i) => {
    const c = calcLine(l);
    return {
      invoice_id: (invoice as any).id,
      sort_order: i,
      description: l.description,
      quantity: l.quantity,
      unit_price: l.unit_price,
      vat_rate: l.vat_rate,
      ...c,
    };
  });
  const { error: linesErr } = await supabase.from("invoice_lines").insert(linesPayload);
  if (linesErr) {
    await supabase.from("invoices").delete().eq("id", (invoice as any).id);
    throw new Error(linesErr.message);
  }

  return (invoice as any).id as string;
}

export async function replaceInvoiceLines(
  supabase: any,
  invoiceId: string,
  lines: Array<{ description: string; quantity: number; unit_price: number; vat_rate: number }>,
) {
  const { calcLine, calcInvoiceTotals } = await import("./invoices.calc");
  const { error: delErr } = await supabase.from("invoice_lines").delete().eq("invoice_id", invoiceId);
  if (delErr) throw new Error(delErr.message);

  const payload = lines.map((l, i) => ({
    invoice_id: invoiceId,
    sort_order: i,
    description: l.description,
    quantity: l.quantity,
    unit_price: l.unit_price,
    vat_rate: l.vat_rate,
    ...calcLine(l),
  }));
  const { error: insErr } = await supabase.from("invoice_lines").insert(payload);
  if (insErr) throw new Error(insErr.message);

  const totals = calcInvoiceTotals(lines);
  const { error: updErr } = await supabase
    .from("invoices")
    .update({
      subtotal: totals.subtotal,
      vat_amount: totals.vat_amount,
      total: totals.total,
    })
    .eq("id", invoiceId);
  if (updErr) throw new Error(updErr.message);
}
