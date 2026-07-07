// v0 Finance Confidence checks. Pure logic; each check returns a ConfidenceIssue or null.
// Uses a supplied Supabase client so both admin (module endpoints) and RLS
// (server functions) call sites can share the same code.
import type { ConfidenceIssue } from "./confidence.types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Sb = any;

const DRAFT_STALE_DAYS = 14;

export type CheckCtx = {
  supabase: Sb;
  organizationId: string;
  actionBase: string; // e.g. "" for relative UI, or "https://.../" for API
};

function url(ctx: CheckCtx, path: string): string {
  return `${ctx.actionBase}${path}`;
}

// Check 1: expense entries without any attachment.
export async function checkMissingAttachment(ctx: CheckCtx): Promise<ConfidenceIssue | null> {
  const { data: expenses, error } = await ctx.supabase
    .from("finance_entries")
    .select("id")
    .eq("organization_id", ctx.organizationId)
    .eq("entry_type", "expense");
  if (error) throw new Error(error.message);
  const ids = (expenses ?? []).map((e: { id: string }) => e.id);
  if (ids.length === 0) return null;

  const { data: atts, error: aErr } = await ctx.supabase
    .from("finance_attachments")
    .select("entry_id")
    .eq("organization_id", ctx.organizationId)
    .in("entry_id", ids);
  if (aErr) throw new Error(aErr.message);
  const withAtt = new Set((atts ?? []).map((a: { entry_id: string }) => a.entry_id));
  const missing = ids.filter((id: string) => !withAtt.has(id));
  if (missing.length === 0) return null;

  return {
    id: "missing_attachment",
    type: "missing_attachment",
    severity: "warning",
    title: `${missing.length} utgiftsposter mangler bilag`,
    description: "Utgifter bør kunne dokumenteres med kvittering eller faktura.",
    count: missing.length,
    action_url: url(ctx, `/orgs/${ctx.organizationId}/entries?issue=missing_attachment`),
  };
}

// Check 2: bank transactions not linked to a finance_entry — only if there is an active connection.
export async function checkUnbookedBankTransaction(
  ctx: CheckCtx,
): Promise<ConfidenceIssue | null> {
  const { data: conns, error: cErr } = await ctx.supabase
    .from("bank_connections")
    .select("id")
    .eq("organization_id", ctx.organizationId)
    .eq("status", "active")
    .limit(1);
  if (cErr) throw new Error(cErr.message);
  if (!conns || conns.length === 0) return null;

  const { count, error } = await ctx.supabase
    .from("bank_transactions")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", ctx.organizationId)
    .is("finance_entry_id", null);
  if (error) throw new Error(error.message);
  const n = count ?? 0;
  if (n === 0) return null;

  return {
    id: "unbooked_bank_transaction",
    type: "unbooked_bank_transaction",
    severity: "critical",
    title: `${n} banktransaksjoner er ikke behandlet`,
    description: "Bank og regnskap er ikke koblet.",
    count: n,
    action_url: url(ctx, `/orgs/${ctx.organizationId}/bank`),
  };
}

// Check 3: sent/paid invoices missing finance_entry or pdf_attachment link.
export async function checkInvoiceMissingAccountingLink(
  ctx: CheckCtx,
): Promise<ConfidenceIssue | null> {
  const { data, error } = await ctx.supabase
    .from("invoices")
    .select("id, finance_entry_id, pdf_attachment_id, status")
    .eq("organization_id", ctx.organizationId)
    .in("status", ["sent", "paid"]);
  if (error) throw new Error(error.message);
  const bad = (data ?? []).filter(
    (i: { finance_entry_id: string | null; pdf_attachment_id: string | null }) =>
      !i.finance_entry_id || !i.pdf_attachment_id,
  );
  if (bad.length === 0) return null;
  return {
    id: "invoice_missing_accounting_link",
    type: "invoice_missing_accounting_link",
    severity: "critical",
    title: `${bad.length} sendte fakturaer mangler regnskap eller PDF`,
    description: "Faktura skal ha tilknyttet regnskapspost og PDF.",
    count: bad.length,
    action_url: url(ctx, `/orgs/${ctx.organizationId}/invoices`),
  };
}

// Check 4: invoice drafts older than DRAFT_STALE_DAYS.
export async function checkStaleInvoiceDraft(ctx: CheckCtx): Promise<ConfidenceIssue | null> {
  const cutoff = new Date(Date.now() - DRAFT_STALE_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const { count, error } = await ctx.supabase
    .from("invoices")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", ctx.organizationId)
    .eq("status", "draft")
    .lt("updated_at", cutoff);
  if (error) throw new Error(error.message);
  const n = count ?? 0;
  if (n === 0) return null;
  return {
    id: "stale_invoice_draft",
    type: "stale_invoice_draft",
    severity: "warning",
    title: `${n} fakturautkast har ligget lenge`,
    description: `Utkast eldre enn ${DRAFT_STALE_DAYS} dager.`,
    count: n,
    action_url: url(ctx, `/orgs/${ctx.organizationId}/invoices`),
  };
}

// Check 5: income entries not backed by an invoice and without any attachment.
export async function checkIncomeWithoutDocumentation(
  ctx: CheckCtx,
): Promise<ConfidenceIssue | null> {
  const { data: incomes, error } = await ctx.supabase
    .from("finance_entries")
    .select("id, source_type, source_ref")
    .eq("organization_id", ctx.organizationId)
    .eq("entry_type", "income");
  if (error) throw new Error(error.message);
  const candidates = (incomes ?? []).filter(
    (e: { source_type: string | null; source_ref: string | null }) =>
      !(e.source_type === "invoice" && e.source_ref),
  );
  const ids = candidates.map((e: { id: string }) => e.id);
  if (ids.length === 0) return null;

  const { data: atts, error: aErr } = await ctx.supabase
    .from("finance_attachments")
    .select("entry_id")
    .eq("organization_id", ctx.organizationId)
    .in("entry_id", ids);
  if (aErr) throw new Error(aErr.message);
  const withAtt = new Set((atts ?? []).map((a: { entry_id: string }) => a.entry_id));
  const missing = ids.filter((id: string) => !withAtt.has(id));
  if (missing.length === 0) return null;

  return {
    id: "income_without_documentation",
    type: "income_without_documentation",
    severity: "warning",
    title: `${missing.length} inntekter mangler dokumentasjon`,
    description: "Inntekter uten faktura bør ha bilag.",
    count: missing.length,
    action_url: url(ctx, `/orgs/${ctx.organizationId}/entries`),
  };
}

// Check 6: duplicate (source_app, source_ref) pairs within an org.
export async function checkDuplicateSourceRef(ctx: CheckCtx): Promise<ConfidenceIssue | null> {
  const { data, error } = await ctx.supabase
    .from("finance_entries")
    .select("source_app, source_ref")
    .eq("organization_id", ctx.organizationId)
    .not("source_app", "is", null)
    .not("source_ref", "is", null);
  if (error) throw new Error(error.message);
  const counts = new Map<string, number>();
  for (const row of (data ?? []) as { source_app: string; source_ref: string }[]) {
    const key = `${row.source_app}::${row.source_ref}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  let dupPairs = 0;
  for (const c of counts.values()) if (c > 1) dupPairs += 1;
  if (dupPairs === 0) return null;

  return {
    id: "duplicate_source_ref",
    type: "duplicate_source_ref",
    severity: "critical",
    title: `${dupPairs} mulige duplikatposter`,
    description: "Samme source_ref er brukt flere ganger.",
    count: dupPairs,
    action_url: url(ctx, `/orgs/${ctx.organizationId}/entries`),
  };
}

export const ALL_CHECKS = [
  checkMissingAttachment,
  checkUnbookedBankTransaction,
  checkInvoiceMissingAccountingLink,
  checkStaleInvoiceDraft,
  checkIncomeWithoutDocumentation,
  checkDuplicateSourceRef,
] as const;
