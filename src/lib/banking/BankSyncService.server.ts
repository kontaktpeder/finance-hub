// Service som synkar kontoar og transaksjonar frå provider til Lovable Cloud.
// VIKTIG: bank_transactions blir ALDRI automatisk konvertert til finance_entry.
// finance_entry_id er alltid null etter sync — brukar må bokføre eksplisitt.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { getProvider } from "./providers/index.server";
import { daysAgoISO, isoDateOnly } from "./banking.utils.server";
import type { BankProviderContext } from "./types";

export async function getOrCreateDeviceId(orgId: string): Promise<string> {
  const { data } = await supabaseAdmin
    .from("bank_connections")
    .select("device_id")
    .eq("organization_id", orgId)
    .limit(1)
    .maybeSingle();
  if (data?.device_id) return data.device_id as string;
  return crypto.randomUUID();
}

async function loadConnection(connectionId: string) {
  const { data, error } = await supabaseAdmin
    .from("bank_connections")
    .select("*")
    .eq("id", connectionId)
    .single();
  if (error || !data) throw new Error(`Bank-tilkobling ikkje funnen: ${connectionId}`);
  return data;
}

function psuIdFromConn(conn: { raw_metadata?: unknown }): string | null {
  const m = (conn.raw_metadata ?? {}) as { psuId?: string };
  return m.psuId ?? null;
}

export async function syncAccounts(connectionId: string, psuIp?: string | null): Promise<number> {
  const conn = await loadConnection(connectionId);
  if (!conn.provider_connection_id) throw new Error("Manglar provider_connection_id");
  const provider = getProvider(conn.provider);
  const ctx: BankProviderContext = {
    deviceId: conn.device_id as string,
    psuIp: psuIp ?? null,
    psuId: psuIdFromConn(conn),
  };

  const accounts = await provider.listAccounts(ctx, conn.provider_connection_id);
  console.log("[banking] syncAccounts connectionId=", connectionId, "count=", accounts.length);
  let count = 0;
  for (const a of accounts) {
    const { error } = await supabaseAdmin
      .from("bank_accounts")
      .upsert(
        {
          organization_id: conn.organization_id,
          bank_connection_id: conn.id,
          provider_account_id: a.providerAccountId,
          account_name: a.accountName,
          account_number: a.accountNumber,
          currency: a.currency,
          raw_metadata: (a.rawMetadata ?? {}) as never,
        },
        { onConflict: "bank_connection_id,provider_account_id" },
      );
    if (error) throw new Error(`Upsert konto feila: ${error.message}`);
    count++;
  }
  return count;
}

export async function syncTransactions(
  connectionId: string,
  days = 90,
  psuIp?: string | null,
): Promise<number> {
  const conn = await loadConnection(connectionId);
  if (!conn.provider_connection_id) throw new Error("Manglar provider_connection_id");
  const provider = getProvider(conn.provider);
  const ctx: BankProviderContext = {
    deviceId: conn.device_id as string,
    psuIp: psuIp ?? null,
    psuId: psuIdFromConn(conn),
  };

  const { data: accounts, error: accErr } = await supabaseAdmin
    .from("bank_accounts")
    .select("id, provider_account_id")
    .eq("bank_connection_id", connectionId);
  if (accErr) throw new Error(`Henting av kontoar feila: ${accErr.message}`);

  const dateFrom = daysAgoISO(days);
  const dateTo = isoDateOnly(new Date());

  let total = 0;
  for (const acc of accounts ?? []) {
    const txs = await provider.listTransactions(
      ctx,
      conn.provider_connection_id,
      acc.provider_account_id as string,
      dateFrom,
      dateTo,
    );
    if (txs.length === 0) continue;

    const rows = txs.map((t) => ({
      organization_id: conn.organization_id,
      bank_account_id: acc.id,
      provider_transaction_id: t.providerTransactionId,
      transaction_date: t.transactionDate,
      booking_date: t.bookingDate,
      amount: t.amount,
      currency: t.currency,
      description: t.description,
      counterparty: t.counterparty,
      is_income: t.isIncome,
      // finance_entry_id BLIR ALDRI sett her — bokføring er eksplisitt brukar-handling.
      raw_payload: (t.rawPayload ?? {}) as never,
    }));

    // Batch upsert
    const { error: insErr } = await supabaseAdmin
      .from("bank_transactions")
      .upsert(rows, { onConflict: "bank_account_id,provider_transaction_id", ignoreDuplicates: false });
    if (insErr) throw new Error(`Upsert transaksjonar feila: ${insErr.message}`);
    total += rows.length;
    console.log("[banking] syncTransactions account=", acc.id, "rows=", rows.length);
  }
  console.log("[banking] syncTransactions connectionId=", connectionId, "total=", total);
  return total;
}

export async function syncConnection(
  connectionId: string,
  psuIp?: string | null,
): Promise<{ accounts: number; transactions: number }> {
  try {
    const accounts = await syncAccounts(connectionId, psuIp);
    const transactions = await syncTransactions(connectionId, 90, psuIp);
    await supabaseAdmin
      .from("bank_connections")
      .update({ last_sync_at: new Date().toISOString(), last_sync_error: null })
      .eq("id", connectionId);
    return { accounts, transactions };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await supabaseAdmin
      .from("bank_connections")
      .update({ last_sync_error: msg, status: "error" })
      .eq("id", connectionId);
    throw err;
  }
}
