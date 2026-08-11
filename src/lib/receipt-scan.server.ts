import { generateText } from "ai";
import { z } from "zod";
import { geminiModelId, getGeminiApiKey, getGeminiModel } from "@/lib/ai-gateway.server";
import {
  defaultCategoryForType,
  normalizeCategory,
  syncCategoryGroup,
} from "@/lib/categories";

export const RECEIPT_SCAN_MODEL = geminiModelId("flash");

const MAX_SCAN_BYTES = 25 * 1024 * 1024;
export const MAX_SCAN_FILES = 10;
export const MAX_SCAN_TOTAL_BYTES = MAX_SCAN_BYTES;

export type ReceiptScanFilePart = {
  bytes: Uint8Array;
  mimeType: string;
  fileName: string;
};

const ALLOWED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
  "application/pdf",
]);

const ConfidenceItem = z.object({
  field: z.string(),
  score: z.number(),
  note: z.string().nullable(),
});

export const ReceiptSuggestionSchema = z.object({
  entry_type: z.enum(["income", "expense"]),
  entry_date: z.string(),
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
  confidence: z.array(ConfidenceItem),
});

export type ReceiptSuggestion = z.infer<typeof ReceiptSuggestionSchema>;

export type NormalizedReceiptScan = {
  entry_type: "income" | "expense";
  entry_date: string;
  counterparty: string;
  description: string;
  category: string;
  category_group?: string;
  amount_gross: number;
  amount_net?: number;
  vat_rate: number;
  payment_status: "paid" | "unpaid" | "partial" | "cancelled";
  invoice_status: "pending" | "sent" | "received" | "not_required";
  before_company_founded: boolean;
  notes: string | null;
  confidence: number;
};

export type ReceiptScanContentInput = {
  bytes: Uint8Array;
  mimeType: string;
  fileName: string;
};

const SYSTEM_PROMPT = `Du er en regnskapsassistent for norske organisasjoner. Du analyserer kvitteringer/fakturaer og foreslår en finance_entry. Bruk norske MVA-satser (0, 12, 15, 25). amount_net = amount_gross - vat_amount. ISO-dato YYYY-MM-DD. Du skal IKKE bokføre — kun foreslå.

Kategorier (category og category_group SKAL være samme verdi, fra denne listen):
- "Salg" — inntekter
- "Varekost" — råvarer/ingredienser brukt i produksjon (matvarer, mozzarella, etc.)
- "Driftsutstyr" — kjøkkenutstyr og fysiske driftsmidler (riskoker, airfryer, frityrkoker, thermobokser)
- "Driftskostnader" — øvrige driftsutgifter
- "Administrasjon" — admin, kontor, gebyrer

Leverandørhint er FORSLAG, ikke absolutte regler — brukeren bekrefter:
- REMA 1000 / KIWI / matleverandører (f.eks. Smak av Italia) → foreslå "Varekost" når det ser ut som mat/råvarer
- Power / Biltema / Batteri Online → foreslå "Driftsutstyr" når det er kjøkken-/driftsutstyr; ellers "Driftskostnader"
- Restaurantbesøk (McDonald's, etc.) → "Driftskostnader" og beskriv formålet (f.eks. "test av konkurrentprodukt") hvis uklart
Sett lav confidence.score på category når leverandøren kan selge flere typer varer.

Svar KUN med ett JSON-objekt (ingen markdown, ingen forklaring) på dette skjemaet:
{
  "entry_type": "income" | "expense",
  "entry_date": "YYYY-MM-DD",
  "counterparty": string | null,
  "description": string,
  "category": "Salg" | "Varekost" | "Driftsutstyr" | "Driftskostnader" | "Administrasjon",
  "category_group": "Salg" | "Varekost" | "Driftsutstyr" | "Driftskostnader" | "Administrasjon",
  "amount_gross": number,
  "vat_rate": number,
  "vat_amount": number,
  "amount_net": number,
  "payment_status": "paid" | "unpaid" | "partial",
  "invoice_status": "none" | "draft" | "sent" | "overdue" | "paid",
  "pre_company_expense": boolean,
  "notes": string | null,
  "extracted_text": string,
  "confidence": [ { "field": string, "score": number, "note": string | null } ]
}
Bruk rene tall (uten tusenskilletegn). vat_rate som prosent (f.eks. 15 for 15%). Hvis et felt er ukjent, gjett konservativt og sett lav score i confidence.`;

export function extractJson(raw: string): unknown {
  let s = (raw ?? "").trim();
  s = s.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
  if (!s.startsWith("{") && !s.startsWith("[")) {
    const i = s.indexOf("{");
    const j = s.lastIndexOf("}");
    if (i !== -1 && j > i) s = s.slice(i, j + 1);
  }
  return JSON.parse(s);
}

function bytesToBase64(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

export function normalizeMimeType(mimeType: string, fileName: string): string {
  const mt = (mimeType || "").toLowerCase().split(";")[0].trim();
  if (mt && ALLOWED_MIME_TYPES.has(mt)) return mt;
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".pdf")) return "application/pdf";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".heic")) return "image/heic";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  return mt;
}

export class ScanValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ScanValidationError";
  }
}

export class ScanFailedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ScanFailedError";
  }
}

export function assertScannableFile(file: File): { mimeType: string } {
  if (file.size > MAX_SCAN_BYTES) {
    throw new ScanValidationError("File too large (max 25MB)");
  }
  const mimeType = normalizeMimeType(file.type, file.name || "receipt");
  if (!ALLOWED_MIME_TYPES.has(mimeType)) {
    throw new ScanValidationError(
      `Unsupported file type: ${mimeType || "unknown"}. Allowed: JPEG, PNG, WebP, HEIC, PDF`,
    );
  }
  return { mimeType };
}

export function vatRateToDecimal(vatRate: number): number {
  if (!Number.isFinite(vatRate)) return 0;
  if (vatRate > 1) return Math.round((vatRate / 100) * 10000) / 10000;
  return vatRate;
}

export function averageConfidence(
  items: Array<{ score: number }> | undefined,
): number {
  if (!items?.length) return 0.5;
  const sum = items.reduce((acc, i) => acc + (Number.isFinite(i.score) ? i.score : 0), 0);
  return Math.round((sum / items.length) * 100) / 100;
}

export function mapInvoiceStatusToPublic(
  status: ReceiptSuggestion["invoice_status"],
): NormalizedReceiptScan["invoice_status"] {
  switch (status) {
    case "none":
      return "not_required";
    case "draft":
      return "pending";
    case "sent":
      return "sent";
    case "overdue":
      return "pending";
    case "paid":
      return "received";
    default:
      return "received";
  }
}

export function toPublicReceiptScan(
  suggestion: ReceiptSuggestion,
): NormalizedReceiptScan {
  const entryType = suggestion.entry_type ?? "expense";
  const category =
    normalizeCategory(suggestion.category) ??
    normalizeCategory(suggestion.category_group) ??
    defaultCategoryForType(entryType);
  return {
    entry_type: entryType,
    entry_date: suggestion.entry_date,
    counterparty: suggestion.counterparty ?? "",
    description: suggestion.description,
    category,
    category_group: syncCategoryGroup(category) ?? undefined,
    amount_gross: suggestion.amount_gross,
    amount_net: suggestion.amount_net,
    vat_rate: vatRateToDecimal(suggestion.vat_rate),
    payment_status: suggestion.payment_status ?? "paid",
    invoice_status: mapInvoiceStatusToPublic(suggestion.invoice_status ?? "none"),
    before_company_founded: suggestion.pre_company_expense ?? false,
    notes: suggestion.notes,
    confidence: averageConfidence(suggestion.confidence),
  };
}

export function assertScannableFiles(
  files: Array<{ size: number; type: string; name: string }>,
): Array<{ mimeType: string }> {
  if (files.length === 0) throw new ScanValidationError("Ingen filer valgt");
  if (files.length > MAX_SCAN_FILES) {
    throw new ScanValidationError(`Maks ${MAX_SCAN_FILES} filer per utkast`);
  }
  let total = 0;
  const out: Array<{ mimeType: string }> = [];
  for (const f of files) {
    total += f.size;
    if (total > MAX_SCAN_TOTAL_BYTES) {
      throw new ScanValidationError("Total filstørrelse overstiger 25 MB");
    }
    out.push(assertScannableFile(f as File));
  }
  return out;
}

export async function scanReceiptContentFromParts(
  parts: ReceiptScanFilePart[],
): Promise<ReceiptSuggestion> {
  if (!getGeminiApiKey()) {
    throw new ScanFailedError("Missing GOOGLE_GENERATIVE_AI_API_KEY (or GEMINI_API_KEY)");
  }
  if (parts.length === 0) {
    throw new ScanValidationError("Ingen filer å skanne");
  }

  let total = 0;
  const normalized = parts.map((p) => {
    total += p.bytes.length;
    const mimeType = normalizeMimeType(p.mimeType, p.fileName);
    if (!ALLOWED_MIME_TYPES.has(mimeType)) {
      throw new ScanValidationError(`Unsupported file type: ${mimeType}`);
    }
    return { ...p, mimeType };
  });
  if (total > MAX_SCAN_TOTAL_BYTES) {
    throw new ScanValidationError("Total filstørrelse overstiger 25 MB");
  }

  const intro =
    parts.length === 1
      ? `Analyser vedlagt ${normalized[0].mimeType === "application/pdf" ? "PDF" : "bilde"} (filnavn: ${normalized[0].fileName}) og returner JSON-objektet.`
      : `Dette er én kvittering/faktura som består av ${parts.length} filer/sider. Les alle samlet og returner ETT bokføringsforslag som JSON. Filnavn i rekkefølge: ${normalized.map((p) => p.fileName).join(", ")}.`;

  const content: any[] = [{ type: "text", text: intro }];
  for (const p of normalized) {
    const base64 = bytesToBase64(p.bytes);
    if (p.mimeType === "application/pdf") {
      content.push({
        type: "file",
        data: `data:${p.mimeType};base64,${base64}`,
        mediaType: p.mimeType,
      });
    } else {
      content.push({
        type: "image",
        image: `data:${p.mimeType};base64,${base64}`,
      });
    }
  }

  let text: string;
  try {
    const result = await generateText({
      model: getGeminiModel("flash"),
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: content as any },
      ],
    });
    text = result.text;
  } catch (err: any) {
    throw new ScanFailedError(err?.message ?? "AI scan failed");
  }

  let parsed: unknown;
  try {
    parsed = extractJson(text);
  } catch {
    throw new ScanFailedError("AI returned invalid JSON");
  }

  const validated = ReceiptSuggestionSchema.safeParse(parsed);
  if (!validated.success) {
    throw new ScanFailedError(
      "AI returned invalid format: " +
        validated.error.issues.map((i) => `${i.path.join(".")} ${i.message}`).join("; "),
    );
  }

  const suggestion = validated.data;
  const entryType = suggestion.entry_type ?? "expense";
  const category =
    normalizeCategory(suggestion.category) ??
    normalizeCategory(suggestion.category_group) ??
    defaultCategoryForType(entryType);
  return {
    ...suggestion,
    category,
    category_group: syncCategoryGroup(category),
  };
}

export async function scanReceiptContent(
  input: ReceiptScanContentInput,
): Promise<ReceiptSuggestion> {
  return scanReceiptContentFromParts([
    { bytes: input.bytes, mimeType: input.mimeType, fileName: input.fileName },
  ]);
}

export async function scanReceiptFile(file: File): Promise<NormalizedReceiptScan> {
  const { mimeType } = assertScannableFile(file);
  const bytes = new Uint8Array(await file.arrayBuffer());
  const suggestion = await scanReceiptContent({
    bytes,
    mimeType,
    fileName: file.name || "receipt",
  });
  return toPublicReceiptScan(suggestion);
}
