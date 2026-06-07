import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { generateText, Output } from "ai";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { createLovableAiGatewayProvider } from "@/lib/ai-gateway.server";

const ScanInput = z.object({
  organizationId: z.string().uuid(),
  bookId: z.string().uuid(),
  storagePath: z.string().min(1),
  fileName: z.string().min(1),
  mimeType: z.string().min(1),
  sizeBytes: z.number().int().nonnegative(),
});

const SuggestionSchema = z.object({
  entry_type: z.enum(["income", "expense"]),
  entry_date: z.string().describe("ISO date YYYY-MM-DD"),
  counterparty: z.string().nullable(),
  description: z.string(),
  category: z.string().nullable(),
  category_group: z.string().nullable(),
  amount_gross: z.number(),
  vat_rate: z.number(),
  vat_amount: z.number(),
  amount_net: z.number(),
  payment_status: z.enum(["paid", "unpaid", "partial"]),
  invoice_status: z.enum(["none", "draft", "sent", "overdue", "paid"]),
  pre_company_expense: z.boolean(),
  notes: z.string().nullable(),
  extracted_text: z.string(),
  confidence: z.record(z.string(), z.number()),
  field_notes: z.record(z.string(), z.string()),
});

export type ReceiptSuggestion = z.infer<typeof SuggestionSchema>;

const MODEL = "google/gemini-2.5-flash";

export const scanReceiptDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => ScanInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("Missing LOVABLE_API_KEY");

    // Verify membership / role via RLS-respecting client
    const { data: membership } = await supabase
      .from("organization_members")
      .select("role")
      .eq("organization_id", data.organizationId)
      .eq("user_id", userId)
      .maybeSingle();
    if (!membership || !["owner", "admin", "editor"].includes(membership.role)) {
      throw new Error("Du har ikke tilgang til å skanne kvitteringer for denne organisasjonen.");
    }

    // Download file from storage and convert to base64 data url
    const { data: blob, error: dlErr } = await supabase.storage
      .from("finance-attachments")
      .download(data.storagePath);
    if (dlErr || !blob) throw new Error(dlErr?.message ?? "Kunne ikke laste ned filen.");

    const arrayBuf = await blob.arrayBuffer();
    const bytes = new Uint8Array(arrayBuf);
    let bin = "";
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    const base64 = btoa(bin);

    const isPdf = data.mimeType === "application/pdf";

    // Create attachment row (entry_id null until converted)
    const { data: attachment, error: aErr } = await supabase
      .from("finance_attachments")
      .insert({
        organization_id: data.organizationId,
        entry_id: null,
        storage_path: data.storagePath,
        file_name: data.fileName,
        mime_type: data.mimeType,
        size_bytes: data.sizeBytes,
        uploaded_by: userId,
      })
      .select("id")
      .single();
    if (aErr) throw new Error(aErr.message);

    // Create draft row up front so we always have a record
    const { data: draft, error: dErr } = await supabase
      .from("finance_receipt_drafts")
      .insert({
        organization_id: data.organizationId,
        book_id: data.bookId,
        uploaded_by: userId,
        attachment_id: attachment.id,
        status: "draft",
        ai_model: MODEL,
      })
      .select("id")
      .single();
    if (dErr) throw new Error(dErr.message);

    try {
      const gateway = createLovableAiGatewayProvider(apiKey);
      const system = `Du er en regnskapsassistent for norske organisasjoner. Du analyserer kvitteringer og fakturaer og foreslår en regnskapspost. Returner ALLTID gyldig data i schema. Bruk norske MVA-satser (0, 12, 15, 25). Beregn amount_net = amount_gross - vat_amount. Bruk ISO-dato YYYY-MM-DD. Sett confidence 0-1 per felt. Du skal IKKE bokføre — kun foreslå. Hvis et felt er usikkert, sett lav confidence og forklar i field_notes.`;

      const userPrompt = `Analyser vedlagt ${isPdf ? "PDF" : "bilde"} (filnavn: ${data.fileName}) og foreslå en finance_entry. Inkluder full ekstrahert tekst i extracted_text.`;

      const { experimental_output: output, text } = await generateText({
        model: gateway(MODEL),
        experimental_output: Output.object({ schema: SuggestionSchema }),
        messages: [
          { role: "system", content: system },
          {
            role: "user",
            content: [
              { type: "text", text: userPrompt },
              isPdf
                ? { type: "file", data: `data:${data.mimeType};base64,${base64}`, mediaType: data.mimeType }
                : { type: "image", image: `data:${data.mimeType};base64,${base64}` },
            ] as any,
          },
        ],
      });

      await supabase
        .from("finance_receipt_drafts")
        .update({
          ai_suggestion: output as any,
          extracted_text: output.extracted_text ?? text ?? null,
          status: "draft",
        })
        .eq("id", draft.id);

      return { draftId: draft.id, attachmentId: attachment.id, suggestion: output };
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
    invoice_status: z.enum(["none", "invoiced", "received"]),
    pre_company_expense: z.boolean(),
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
    const { data: entry, error: eErr } = await supabase
      .from("finance_entries")
      .insert({
        organization_id: data.organizationId,
        book_id: data.bookId,
        entry_type: e.entry_type,
        entry_date: e.entry_date,
        description: e.description,
        counterparty: e.counterparty ?? null,
        category: e.category ?? null,
        category_group: e.category_group ?? null,
        amount_gross: e.amount_gross,
        vat_rate: e.vat_rate,
        vat_amount: e.vat_amount,
        amount_net: e.amount_net,
        payment_status: e.payment_status,
        invoice_status: e.invoice_status,
        pre_company_expense: e.pre_company_expense,
        notes: e.notes ?? null,
        created_by: userId,
        created_via: "ai-scan",
      })
      .select("id")
      .single();
    if (eErr) throw new Error(eErr.message);

    if (draft.attachment_id) {
      await supabase
        .from("finance_attachments")
        .update({ entry_id: entry.id })
        .eq("id", draft.attachment_id);
    }

    await supabase
      .from("finance_receipt_drafts")
      .update({ status: "converted", converted_entry_id: entry.id })
      .eq("id", draft.id);

    return { entryId: entry.id };
  });
