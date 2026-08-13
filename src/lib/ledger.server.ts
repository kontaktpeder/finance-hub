import {
  defaultCategoryForType,
  normalizeCategory,
  syncCategoryGroup,
  type Category,
} from "@/lib/categories";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Sb = any;

export class LedgerError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "LedgerError";
    this.code = code;
  }
}

export type PostingKind = "original" | "reversal" | "correction";
export type BookingStatus = "active" | "voided" | "corrected";
export type PaymentKind = "payment" | "refund" | "credit_note";

const ENTRY_SELECT =
  "id, organization_id, book_id, entry_type, voucher_number, entry_date, description, counterparty, category, category_group, amount_gross, amount_net, vat_amount, vat_rate, currency, payment_status, invoice_status, paid_at, paid_by, notes, pre_company_expense, posting_kind, booking_status, reverses_entry_id, reversed_by_entry_id, correction_of_entry_id, void_reason, voided_at, voided_by, private_expense, created_by, created_via";

function todayDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function ym(date: string): { year: number; month: number } {
  const [y, m] = date.split("-").map(Number);
  return { year: y, month: m };
}

function firstOfMonth(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")}-01`;
}

function addMonth(year: number, month: number): { year: number; month: number } {
  if (month === 12) return { year: year + 1, month: 1 };
  return { year, month: month + 1 };
}

export async function nextOpenPeriodDate(
  supabase: Sb,
  organizationId: string,
  preferredDate: string,
): Promise<string> {
  let { year, month } = ym(preferredDate);
  for (let i = 0; i < 120; i++) {
    const { data } = await supabase
      .from("finance_period_locks")
      .select("id")
      .eq("organization_id", organizationId)
      .eq("period_year", year)
      .eq("period_month", month)
      .maybeSingle();
    if (!data) {
      const pref = ym(preferredDate);
      if (year === pref.year && month === pref.month) return preferredDate;
      return firstOfMonth(year, month);
    }
    ({ year, month } = addMonth(year, month));
  }
  throw new LedgerError("no_open_period", "Fant ingen åpen periode å bokføre i.");
}

export async function periodIsLocked(
  supabase: Sb,
  organizationId: string,
  date: string,
): Promise<boolean> {
  const { year, month } = ym(date);
  const { data } = await supabase
    .from("finance_period_locks")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("period_year", year)
    .eq("period_month", month)
    .maybeSingle();
  return !!data;
}

async function loadEntry(supabase: Sb, organizationId: string, entryId: string) {
  const { data, error } = await supabase
    .from("finance_entries")
    .select(ENTRY_SELECT)
    .eq("id", entryId)
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (error) throw new LedgerError("db", error.message);
  if (!data) throw new LedgerError("not_found", "Posten finnes ikke.");
  return data as Record<string, any>;
}

async function insertAudit(
  supabase: Sb,
  row: {
    organization_id: string;
    entry_id: string;
    action: string;
    field_name?: string | null;
    old_value?: string | null;
    new_value?: string | null;
    reason?: string | null;
    actor_id?: string | null;
  },
) {
  await supabase.from("finance_entry_audit").insert({
    organization_id: row.organization_id,
    entry_id: row.entry_id,
    action: row.action,
    field_name: row.field_name ?? null,
    old_value: row.old_value ?? null,
    new_value: row.new_value ?? null,
    reason: row.reason ?? null,
    actor_id: row.actor_id ?? null,
  });
}

async function copyAttachments(
  supabase: Sb,
  organizationId: string,
  fromEntryId: string,
  toEntryId: string,
) {
  const { data: atts, error } = await supabase
    .from("finance_attachments")
    .select("storage_path, file_name, mime_type, size_bytes, uploaded_by, page_index, receipt_draft_id")
    .eq("organization_id", organizationId)
    .eq("entry_id", fromEntryId);
  if (error) throw new LedgerError("db", error.message);
  if (!atts?.length) return 0;
  const copies = atts.map((a: Record<string, unknown>) => ({
    organization_id: organizationId,
    entry_id: toEntryId,
    storage_path: a.storage_path,
    file_name: a.file_name,
    mime_type: a.mime_type ?? null,
    size_bytes: a.size_bytes ?? null,
    uploaded_by: a.uploaded_by ?? null,
    page_index: a.page_index ?? null,
    receipt_draft_id: null,
  }));
  const { error: insErr } = await supabase.from("finance_attachments").insert(copies);
  if (insErr) throw new LedgerError("db", insErr.message);
  return copies.length;
}

async function resolvePostingDate(
  supabase: Sb,
  organizationId: string,
  preferredDate: string,
  opts?: { exceptionId?: string | null },
): Promise<{ date: string; exceptionId: string | null }> {
  if (opts?.exceptionId) return { date: preferredDate, exceptionId: opts.exceptionId };
  const locked = await periodIsLocked(supabase, organizationId, preferredDate);
  if (!locked) return { date: preferredDate, exceptionId: null };
  const open = await nextOpenPeriodDate(supabase, organizationId, preferredDate);
  return { date: open, exceptionId: null };
}

export async function voidEntry(
  supabase: Sb,
  params: {
    organizationId: string;
    entryId: string;
    reason: string;
    actorId: string | null;
    privateExpense?: boolean;
    postingDate?: string;
    periodLockExceptionId?: string | null;
    createdVia?: string;
  },
) {
  const reason = params.reason.trim();
  if (reason.length < 3) {
    throw new LedgerError("reason_required", "Begrunnelse er påkrevd ved annullering.");
  }
  const original = await loadEntry(supabase, params.organizationId, params.entryId);
  if (original.posting_kind !== "original") {
    throw new LedgerError("not_original", "Bare originalposter kan annulleres.");
  }
  if (original.booking_status !== "active") {
    throw new LedgerError("already_closed", "Posten er allerede annullert eller korrigert.");
  }

  const preferred = params.postingDate || todayDate();
  const posting = await resolvePostingDate(supabase, params.organizationId, preferred, {
    exceptionId: params.periodLockExceptionId,
  });

  const voucher = original.voucher_number ?? original.id.slice(0, 8);
  const { data: reversal, error: insErr } = await supabase
    .from("finance_entries")
    .insert({
      organization_id: original.organization_id,
      book_id: original.book_id,
      entry_type: original.entry_type,
      entry_date: posting.date,
      description: `Annullering av ${voucher}: ${reason}`,
      counterparty: original.counterparty,
      category: original.category,
      category_group: original.category_group,
      amount_gross: -Number(original.amount_gross),
      amount_net: -Number(original.amount_net),
      vat_amount: -Number(original.vat_amount),
      vat_rate: original.vat_rate,
      currency: original.currency ?? "NOK",
      payment_status: "paid",
      invoice_status: "none",
      paid_at: posting.date,
      notes: original.notes,
      pre_company_expense: original.pre_company_expense,
      private_expense: params.privateExpense ?? original.private_expense ?? false,
      posting_kind: "reversal",
      booking_status: "active",
      reverses_entry_id: original.id,
      void_reason: reason,
      created_by: params.actorId,
      created_via: params.createdVia ?? "void",
      period_lock_exception_id: posting.exceptionId,
    })
    .select("id, voucher_number, entry_date")
    .single();
  if (insErr) throw new LedgerError("db", insErr.message);

  await copyAttachments(supabase, params.organizationId, original.id, reversal.id);

  const { error: updErr } = await supabase
    .from("finance_entries")
    .update({
      booking_status: "voided",
      reversed_by_entry_id: reversal.id,
      void_reason: reason,
      voided_at: new Date().toISOString(),
      voided_by: params.actorId,
      private_expense: params.privateExpense ? true : original.private_expense,
    })
    .eq("id", original.id)
    .eq("organization_id", params.organizationId);
  if (updErr) throw new LedgerError("db", updErr.message);

  await insertAudit(supabase, {
    organization_id: params.organizationId,
    entry_id: original.id,
    action: params.privateExpense ? "private" : "void",
    reason,
    new_value: reversal.id,
    actor_id: params.actorId,
  });

  return { originalId: original.id, reversal, postedOn: posting.date };
}

export async function correctEntry(
  supabase: Sb,
  params: {
    organizationId: string;
    entryId: string;
    reason: string;
    actorId: string | null;
    description: string;
    category?: string | null;
    counterparty?: string | null;
    amount_gross: number;
    vat_rate: number;
    vat_amount?: number;
    amount_net?: number;
    postingDate?: string;
    periodLockExceptionId?: string | null;
    createdVia?: string;
  },
) {
  const reason = params.reason.trim();
  if (reason.length < 3) {
    throw new LedgerError("reason_required", "Begrunnelse er påkrevd ved korrigering.");
  }
  if (!Number.isFinite(params.amount_gross)) {
    throw new LedgerError("invalid_amount", "Ugyldig beløp.");
  }
  const original = await loadEntry(supabase, params.organizationId, params.entryId);
  if (original.posting_kind !== "original") {
    throw new LedgerError("not_original", "Bare originalposter kan korrigeres.");
  }
  if (original.booking_status !== "active") {
    throw new LedgerError("already_closed", "Posten er allerede annullert eller korrigert.");
  }

  const voided = await voidEntry(supabase, {
    organizationId: params.organizationId,
    entryId: params.entryId,
    reason: `Korrigering: ${reason}`,
    actorId: params.actorId,
    postingDate: params.postingDate,
    periodLockExceptionId: params.periodLockExceptionId,
    createdVia: params.createdVia ?? "correct",
  });

  // voidEntry marked original as voided; mark as corrected instead.
  await supabase
    .from("finance_entries")
    .update({ booking_status: "corrected" })
    .eq("id", original.id);

  const rate = params.vat_rate ?? Number(original.vat_rate) ?? 0;
  const gross = params.amount_gross;
  const vatAmount =
    params.vat_amount ?? +(gross - gross / (1 + rate / 100)).toFixed(2);
  const net = params.amount_net ?? +(gross - vatAmount).toFixed(2);
  const category =
    normalizeCategory(params.category) ??
    normalizeCategory(original.category) ??
    defaultCategoryForType(original.entry_type);

  const preferred = params.postingDate || todayDate();
  const posting = await resolvePostingDate(supabase, params.organizationId, preferred, {
    exceptionId: params.periodLockExceptionId,
  });

  const { data: correction, error: cErr } = await supabase
    .from("finance_entries")
    .insert({
      organization_id: original.organization_id,
      book_id: original.book_id,
      entry_type: original.entry_type,
      entry_date: posting.date,
      description: params.description.trim(),
      counterparty: params.counterparty ?? original.counterparty,
      category,
      category_group: syncCategoryGroup(category as Category),
      amount_gross: gross,
      amount_net: net,
      vat_amount: vatAmount,
      vat_rate: rate,
      currency: original.currency ?? "NOK",
      payment_status: "unpaid",
      invoice_status: original.invoice_status ?? "none",
      notes: original.notes,
      pre_company_expense: original.pre_company_expense,
      private_expense: original.private_expense,
      posting_kind: "correction",
      booking_status: "active",
      correction_of_entry_id: original.id,
      created_by: params.actorId,
      created_via: params.createdVia ?? "correct",
      period_lock_exception_id: posting.exceptionId,
    })
    .select("id, voucher_number, entry_date")
    .single();
  if (cErr) throw new LedgerError("db", cErr.message);

  await copyAttachments(supabase, params.organizationId, original.id, correction.id);

  await insertAudit(supabase, {
    organization_id: params.organizationId,
    entry_id: original.id,
    action: "correct",
    reason,
    new_value: correction.id,
    actor_id: params.actorId,
  });

  return {
    originalId: original.id,
    reversal: voided.reversal,
    correction,
    postedOn: posting.date,
  };
}

export async function recordPayment(
  supabase: Sb,
  params: {
    organizationId: string;
    entryId: string;
    amount: number;
    paidOn: string;
    kind?: PaymentKind;
    paidBy?: string | null;
    notes?: string | null;
    actorId: string | null;
    bankTransactionId?: string | null;
  },
) {
  if (!Number.isFinite(params.amount) || params.amount <= 0) {
    throw new LedgerError("invalid_amount", "Beløpet må være større enn 0.");
  }
  const entry = await loadEntry(supabase, params.organizationId, params.entryId);
  if (entry.posting_kind !== "original" || entry.booking_status !== "active") {
    throw new LedgerError(
      "not_payable",
      "Betaling kan bare registreres på aktive originalposter.",
    );
  }
  const kind: PaymentKind = params.kind ?? "payment";
  const { data, error } = await supabase
    .from("finance_payments")
    .insert({
      organization_id: params.organizationId,
      entry_id: params.entryId,
      kind,
      amount: params.amount,
      paid_on: params.paidOn,
      paid_by: params.paidBy ?? null,
      notes: params.notes ?? null,
      bank_transaction_id: params.bankTransactionId ?? null,
      created_by: params.actorId,
    })
    .select("*")
    .single();
  if (error) throw new LedgerError("db", error.message);

  await insertAudit(supabase, {
    organization_id: params.organizationId,
    entry_id: params.entryId,
    action: "payment",
    reason: kind,
    new_value: String(params.amount),
    actor_id: params.actorId,
  });

  const refreshed = await loadEntry(supabase, params.organizationId, params.entryId);
  return { payment: data, entry: refreshed };
}

export async function lockPeriod(
  supabase: Sb,
  params: {
    organizationId: string;
    year: number;
    month: number;
    actorId: string | null;
    reason?: string | null;
  },
) {
  const { error } = await supabase.from("finance_period_locks").insert({
    organization_id: params.organizationId,
    period_year: params.year,
    period_month: params.month,
    locked_by: params.actorId,
    reason: params.reason ?? null,
  });
  if (error) {
    if (error.code === "23505") {
      throw new LedgerError("already_locked", "Perioden er allerede låst.");
    }
    throw new LedgerError("db", error.message);
  }
  await supabase.from("finance_admin_exceptions").insert({
    organization_id: params.organizationId,
    action: "period_lock",
    reason: params.reason || `Låst ${params.year}-${String(params.month).padStart(2, "0")}`,
    period_year: params.year,
    period_month: params.month,
    actor_id: params.actorId,
  });
  return { locked: true, year: params.year, month: params.month };
}

export async function unlockPeriod(
  supabase: Sb,
  params: {
    organizationId: string;
    year: number;
    month: number;
    actorId: string | null;
    reason: string;
  },
) {
  const reason = params.reason.trim();
  if (reason.length < 3) {
    throw new LedgerError(
      "reason_required",
      "Admin-unntak for opplåsing krever begrunnelse.",
    );
  }
  const { data: existing } = await supabase
    .from("finance_period_locks")
    .select("id")
    .eq("organization_id", params.organizationId)
    .eq("period_year", params.year)
    .eq("period_month", params.month)
    .maybeSingle();
  if (!existing) throw new LedgerError("not_locked", "Perioden er ikke låst.");

  const { error: exErr, data: exception } = await supabase
    .from("finance_admin_exceptions")
    .insert({
      organization_id: params.organizationId,
      action: "period_unlock",
      reason,
      period_year: params.year,
      period_month: params.month,
      actor_id: params.actorId,
    })
    .select("id")
    .single();
  if (exErr) throw new LedgerError("db", exErr.message);

  const { error } = await supabase
    .from("finance_period_locks")
    .delete()
    .eq("id", existing.id);
  if (error) throw new LedgerError("db", error.message);

  return { unlocked: true, exceptionId: exception.id, year: params.year, month: params.month };
}

export function jsonLedgerError(err: unknown): Response {
  if (err instanceof LedgerError) {
    const status =
      err.code === "not_found" ? 404 : err.code === "db" ? 400 : 400;
    return Response.json({ error: err.code, message: err.message }, { status });
  }
  const message = err instanceof Error ? err.message : "Ukjent feil";
  return Response.json({ error: "internal", message }, { status: 500 });
}
