import type { SupabaseClient } from "@supabase/supabase-js";

export async function storeInvoicePdf(
  supabase: SupabaseClient<any, any, any>,
  params: {
    organizationId: string;
    invoiceId: string;
    invoiceNumber: string;
    pdf: Uint8Array;
    uploadedBy?: string | null;
  },
): Promise<string> {
  const path = `${params.organizationId}/invoices/${params.invoiceId}/${params.invoiceNumber}.pdf`;
  const fileName = `${params.invoiceNumber}.pdf`;

  const { error: upErr } = await supabase.storage
    .from("finance-attachments")
    .upload(path, params.pdf, { contentType: "application/pdf", upsert: true });
  if (upErr) throw new Error(upErr.message);

  const { data: attachment, error: insErr } = await supabase
    .from("finance_attachments")
    .insert({
      organization_id: params.organizationId,
      entry_id: null,
      storage_path: path,
      file_name: fileName,
      mime_type: "application/pdf",
      size_bytes: params.pdf.length,
      uploaded_by: params.uploadedBy ?? null,
    })
    .select("id")
    .single();

  if (insErr || !attachment) {
    await supabase.storage.from("finance-attachments").remove([path]);
    throw new Error(insErr?.message ?? "Kunne ikke lagre vedlegg");
  }

  return (attachment as any).id as string;
}
