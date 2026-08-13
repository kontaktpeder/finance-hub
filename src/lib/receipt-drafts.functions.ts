import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  RECEIPT_SCAN_MODEL,
  scanReceiptContentFromParts,
  type ReceiptScanFilePart,
  type ReceiptSuggestion,
} from "@/lib/receipt-scan.server";
import {
  DocumentationStatusSchema,
  defaultCategoryForType,
  normalizeCategory,
  syncCategoryGroup,
} from "@/lib/categories";

export type { ReceiptSuggestion };

const ScanFileMeta = z.object({
  storagePath: z.string().min(1),
  fileName: z.string().min(1),
  mimeType: z.string().min(1),
  sizeBytes: z.number().int().nonnegative(),
});

const ScanInput = z
  .object({
    organizationId: z.string().uuid(),
    bookId: z.string().uuid(),
    storagePath: z.string().min(1).optional(),
    fileName: z.string().min(1).optional(),
    mimeType: z.string().min(1).optional(),
    sizeBytes: z.number().int().nonnegative().optional(),
    files: z.array(ScanFileMeta).optional(),
  })
  .refine(
    (d) => (d.files && d.files.length > 0) || !!d.storagePath,
    { message: "Mangler filer" },
  );

export const scanReceiptDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => ScanInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const fileMetas = data.files?.length
      ? data.files
      : data.storagePath
        ? [
            {
              storagePath: data.storagePath,
              fileName: data.fileName ?? "kvittering",
              mimeType: data.mimeType ?? "application/octet-stream",
              sizeBytes: data.sizeBytes ?? 0,
            },
          ]
        : [];

    if (fileMetas.length === 0) throw new Error("Ingen filer å skanne.");

    // Verify membership / role
    const { data: membership } = await supabase
      .from("organization_members")
      .select("role")
      .eq("organization_id", data.organizationId)
      .eq("user_id", userId)
      .maybeSingle();
    if (!membership || !["owner", "admin", "editor"].includes(membership.role)) {
      throw new Error("Du har ikke tilgang til å skanne kvitteringer for denne organisasjonen.");
    }

    // Create draft up front
    const { data: draft, error: dErr } = await supabase
      .from("finance_receipt_drafts")
      .insert({
        organization_id: data.organizationId,
        book_id: data.bookId,
        uploaded_by: userId,
        status: "draft",
        ai_model: RECEIPT_SCAN_MODEL,
      })
      .select("id")
      .single();
    if (dErr) throw new Error(dErr.message);

    const createdAttachmentIds: string[] = [];
    const scanParts: ReceiptScanFilePart[] = [];

    try {
      for (let i = 0; i < fileMetas.length; i++) {
        const meta = fileMetas[i];
        const { data: blob, error: dlErr } = await supabase.storage
          .from("finance-attachments")
          .download(meta.storagePath);
        if (dlErr || !blob) throw new Error(dlErr?.message ?? `Kunne ikke laste ned ${meta.fileName}`);

        const arrayBuf = await blob.arrayBuffer();
        const bytes = new Uint8Array(arrayBuf);

        const { data: attachment, error: aErr } = await supabase
          .from("finance_attachments")
          .insert({
            organization_id: data.organizationId,
            entry_id: null,
            receipt_draft_id: draft.id,
            page_index: i,
            storage_path: meta.storagePath,
            file_name: meta.fileName,
            mime_type: meta.mimeType,
            size_bytes: meta.sizeBytes,
            uploaded_by: userId,
          } as any)
          .select("id")
          .single();
        if (aErr) throw new Error(aErr.message);

        createdAttachmentIds.push(attachment.id);
        scanParts.push({ bytes, mimeType: meta.mimeType, fileName: meta.fileName });
      }

      // Backwards-compat: set attachment_id to first one
      await supabase
        .from("finance_receipt_drafts")
        .update({ attachment_id: createdAttachmentIds[0] })
        .eq("id", draft.id);
    } catch (err: any) {
      // Rollback: delete created attachments + storage files + draft
      if (createdAttachmentIds.length > 0) {
        await supabase.from("finance_attachments").delete().in("id", createdAttachmentIds);
      }
      const paths = fileMetas.map((m) => m.storagePath);
      if (paths.length > 0) {
        await supabase.storage.from("finance-attachments").remove(paths);
      }
      await supabase.from("finance_receipt_drafts").delete().eq("id", draft.id);
      throw new Error(err?.message ?? "Klarte ikke forberede utkast");
    }

    try {
      const output = await scanReceiptContentFromParts(scanParts);

      await supabase
        .from("finance_receipt_drafts")
        .update({
          ai_suggestion: output as any,
          extracted_text: output.extracted_text ?? null,
          status: "draft",
        })
        .eq("id", draft.id);

      return {
        draftId: draft.id,
        attachmentIds: createdAttachmentIds,
        attachmentCount: createdAttachmentIds.length,
        suggestion: output,
      };
    } catch (err: any) {
      const msg = err?.message ?? "AI-skanning feilet";
      await supabase
        .from("finance_receipt_drafts")
        .update({ status: "rejected", error: msg })
        .eq("id", draft.id);
      throw new Error(msg);
    }
  });

const ConvertInput = z.object({
  organizationId: z.string().uuid(),
  draftId: z.string().uuid(),
  bookId: z.string().uuid(),
  entry: z.object({
    entry_type: z.enum(["income", "expense"]),
    entry_date: z.string(),
    counterparty: z.string().nullable().optional(),
    description: z.string().min(1),
    category: z.string().nullable().optional(),
    category_group: z.string().nullable().optional(),
    amount_gross: z.number(),
    vat_rate: z.number(),
    vat_amount: z.number(),
    amount_net: z.number(),
    payment_status: z.enum(["paid", "unpaid", "partial"]),
    invoice_status: z.enum(["none", "draft", "sent", "overdue", "paid"]),
    pre_company_expense: z.boolean(),
    paid_by: z.string().nullable().optional(),
    reimbursed: z.boolean().optional(),
    accountant_approved: z.boolean().optional(),
    documentation_status: DocumentationStatusSchema.optional(),
    notes: z.string().nullable().optional(),
  }),
});

export const convertDraftToEntry = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => ConvertInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: draft, error: dfErr } = await supabase
      .from("finance_receipt_drafts")
      .select("id, organization_id, attachment_id, status")
      .eq("id", data.draftId)
      .single();
    if (dfErr || !draft) throw new Error("Utkast finnes ikke.");
    if (draft.organization_id !== data.organizationId) throw new Error("Feil organisasjon.");
    if (draft.status === "converted") throw new Error("Utkastet er allerede konvertert.");

    const e = data.entry;
    const category =
      normalizeCategory(e.category) ??
      normalizeCategory(e.category_group) ??
      defaultCategoryForType(e.entry_type);
    const { data: entry, error: eErr } = await supabase
      .from("finance_entries")
      .insert({
        organization_id: data.organizationId,
        book_id: data.bookId,
        entry_type: e.entry_type,
        entry_date: e.entry_date,
        description: e.description,
        counterparty: e.counterparty ?? null,
        category,
        category_group: syncCategoryGroup(category),
        amount_gross: e.amount_gross,
        vat_rate: e.vat_rate,
        vat_amount: e.vat_amount,
        amount_net: e.amount_net,
        payment_status: e.payment_status,
        invoice_status: e.invoice_status,
        pre_company_expense: e.pre_company_expense,
        paid_by: e.pre_company_expense ? (e.paid_by ?? null) : null,
        reimbursed: e.pre_company_expense ? (e.reimbursed ?? false) : false,
        accountant_approved: e.accountant_approved ?? false,
        documentation_status: e.documentation_status ?? "unknown",
        notes: e.notes ?? null,
        created_by: userId,
        created_via: "ai-scan",
      })
      .select("id")
      .single();
    if (eErr) throw new Error(eErr.message);

    // Primary: link all draft attachments via receipt_draft_id
    const { data: linked } = await supabase
      .from("finance_attachments")
      .update({ entry_id: entry.id })
      .eq("receipt_draft_id", draft.id)
      .select("id");

    // Fallback for legacy drafts without receipt_draft_id
    if ((!linked || linked.length === 0) && draft.attachment_id) {
      await supabase
        .from("finance_attachments")
        .update({ entry_id: entry.id })
        .eq("id", draft.attachment_id);
    }

    await supabase
      .from("finance_receipt_drafts")
      .update({ status: "converted", converted_entry_id: entry.id })
      .eq("id", draft.id);

    return { entryId: entry.id, attachmentCount: linked?.length ?? (draft.attachment_id ? 1 : 0) };
  });

const DeleteDraftInput = z.object({
  organizationId: z.string().uuid(),
  draftId: z.string().uuid(),
});

export const deleteReceiptDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => DeleteDraftInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: membership } = await supabase
      .from("organization_members")
      .select("role")
      .eq("organization_id", data.organizationId)
      .eq("user_id", userId)
      .maybeSingle();
    if (!membership || !["owner", "admin", "editor"].includes((membership as any).role)) {
      throw new Error("Du har ikke tilgang.");
    }

    const { data: draft, error } = await supabase
      .from("finance_receipt_drafts")
      .select("id, organization_id, status, converted_entry_id")
      .eq("id", data.draftId)
      .maybeSingle();
    if (error || !draft) throw new Error("Utkastet finnes ikke.");
    if (draft.organization_id !== data.organizationId) throw new Error("Feil organisasjon.");
    if (draft.status === "converted" || draft.converted_entry_id) {
      throw new Error("Bokførte utkast kan ikke slettes. Annuller posten i stedet.");
    }

    const { data: atts } = await supabase
      .from("finance_attachments")
      .select("id, storage_path")
      .eq("receipt_draft_id", draft.id);
    const paths = (atts ?? []).map((a: { storage_path: string }) => a.storage_path).filter(Boolean);
    if (paths.length) {
      await supabase.storage.from("finance-attachments").remove(paths);
    }
    if ((atts ?? []).length) {
      await supabase.from("finance_attachments").delete().in(
        "id",
        (atts ?? []).map((a: { id: string }) => a.id),
      );
    }
    const { error: delErr } = await supabase
      .from("finance_receipt_drafts")
      .delete()
      .eq("id", draft.id);
    if (delErr) throw new Error(delErr.message);
    return { deleted: true, id: draft.id };
  });
