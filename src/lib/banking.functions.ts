// Server-funksjonar for bank-domenet.
// Sprint 1: koble bank, hent kontoar, list transaksjonar. Ingen bokføring.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const OrgInput = z.object({ orgId: z.string().uuid() });

export const getBankStatusFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => OrgInput.parse(input))
  .handler(async ({ data, context }) => {
    const { isNeonomicsConfigured } = await import("./banking/neonomics.config.server");
    const { data: conns, error } = await context.supabase
      .from("bank_connections")
      .select("id, bank_id, bank_name, status, consent_expires_at, last_sync_at, last_sync_error, created_at")
      .eq("organization_id", data.orgId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return {
      configured: isNeonomicsConfigured(),
      connections: conns ?? [],
    };
  });

export const listBanksFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => OrgInput.parse(input))
  .handler(async ({ data, context }) => {
    const { requireBankAdmin, getPsuIpAddress } = await import("./banking/banking.utils.server");
    await requireBankAdmin(context.supabase, data.orgId, context.userId);
    const { getProvider } = await import("./banking/providers/index.server");
    const { supabaseAdmin } = await import("./../integrations/supabase/client.server");
    const { getOrCreateDeviceId } = await import("./banking/BankSyncService.server");

    // Sikre at vi har ein device_id å bruke (lagrast på første consent)
    const deviceId = await getOrCreateDeviceId(data.orgId);
    void supabaseAdmin; // kun lasta for å sikre at admin-bundle ikkje lekkar

    const banks = await getProvider("neonomics").listBanks(
      { deviceId, psuIp: getPsuIpAddress() },
      "NO",
    );
    return { banks };
  });

const StartInput = z.object({ orgId: z.string().uuid(), bankId: z.string().min(1) });

export const startBankConnectFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => StartInput.parse(input))
  .handler(async ({ data, context }) => {
    const { requireBankAdmin, getPsuIpAddress, getAppOrigin } = await import(
      "./banking/banking.utils.server"
    );
    await requireBankAdmin(context.supabase, data.orgId, context.userId);

    const { supabaseAdmin } = await import("./../integrations/supabase/client.server");
    const { getOrCreateDeviceId } = await import("./banking/BankSyncService.server");
    const { getProvider } = await import("./banking/providers/index.server");

    const deviceId = await getOrCreateDeviceId(data.orgId);

    // Opprett pending bank_connection FØR vi treffer provider — så vi har id til callback
    const { data: conn, error: insErr } = await supabaseAdmin
      .from("bank_connections")
      .insert({
        organization_id: data.orgId,
        provider: "neonomics",
        device_id: deviceId,
        bank_id: data.bankId,
        status: "pending",
        created_by: context.userId,
      })
      .select("id")
      .single();
    if (insErr || !conn) throw new Error(insErr?.message ?? "Klarte ikkje opprette tilkobling");

    const redirectUrl = `${getAppOrigin()}/orgs/${data.orgId}/bank/callback?connectionId=${conn.id}`;

    try {
      const init = await getProvider("neonomics").startConnect(
        { deviceId, psuIp: getPsuIpAddress() },
        data.bankId,
        redirectUrl,
      );
      await supabaseAdmin
        .from("bank_connections")
        .update({
          provider_connection_id: init.providerConnectionId,
          raw_metadata: { redirectUrl } as never,
        })
        .eq("id", conn.id);

      return {
        connectionId: conn.id,
        consentUrl: init.consentUrl,
        providerConnectionId: init.providerConnectionId,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await supabaseAdmin
        .from("bank_connections")
        .update({ status: "error", last_sync_error: msg })
        .eq("id", conn.id);
      throw err;
    }
  });

const CompleteInput = z.object({
  orgId: z.string().uuid(),
  connectionId: z.string().uuid(),
});

export const completeBankConnectFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => CompleteInput.parse(input))
  .handler(async ({ data, context }) => {
    const { requireBankAdmin, getPsuIpAddress } = await import("./banking/banking.utils.server");
    await requireBankAdmin(context.supabase, data.orgId, context.userId);

    const { supabaseAdmin } = await import("./../integrations/supabase/client.server");
    const { getProvider } = await import("./banking/providers/index.server");
    const { syncConnection } = await import("./banking/BankSyncService.server");

    const { data: conn, error } = await supabaseAdmin
      .from("bank_connections")
      .select("*")
      .eq("id", data.connectionId)
      .eq("organization_id", data.orgId)
      .single();
    if (error || !conn) throw new Error("Bank-tilkobling ikkje funnen");
    if (!conn.provider_connection_id) throw new Error("Manglar provider_connection_id");

    const psuIp = getPsuIpAddress();
    const result = await getProvider(conn.provider).completeConnect(
      { deviceId: conn.device_id as string, psuIp },
      conn.provider_connection_id,
    );

    await supabaseAdmin
      .from("bank_connections")
      .update({
        status: result.status,
        consent_expires_at: result.consentExpiresAt,
        last_sync_error: null,
      })
      .eq("id", conn.id);

    const synced = await syncConnection(conn.id, psuIp);
    return { ok: true as const, ...synced };
  });

export const syncBankFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => OrgInput.parse(input))
  .handler(async ({ data, context }) => {
    const { requireBankAdmin, getPsuIpAddress } = await import("./banking/banking.utils.server");
    await requireBankAdmin(context.supabase, data.orgId, context.userId);

    const { supabaseAdmin } = await import("./../integrations/supabase/client.server");
    const { syncConnection } = await import("./banking/BankSyncService.server");

    const { data: conns, error } = await supabaseAdmin
      .from("bank_connections")
      .select("id")
      .eq("organization_id", data.orgId)
      .eq("status", "active");
    if (error) throw new Error(error.message);

    const psuIp = getPsuIpAddress();
    let accounts = 0;
    let transactions = 0;
    for (const c of conns ?? []) {
      try {
        const r = await syncConnection(c.id, psuIp);
        accounts += r.accounts;
        transactions += r.transactions;
      } catch {
        // feil er lagra på connection — fortset med dei andre
      }
    }
    return { ok: true as const, accounts, transactions, count: conns?.length ?? 0 };
  });

const TxInput = z.object({ orgId: z.string().uuid(), days: z.number().int().min(1).max(365).default(90) });

export const listBankTransactionsFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => TxInput.parse(input))
  .handler(async ({ data, context }) => {
    const since = new Date();
    since.setUTCDate(since.getUTCDate() - data.days);
    const { data: txs, error } = await context.supabase
      .from("bank_transactions")
      .select(
        "id, bank_account_id, transaction_date, booking_date, amount, currency, description, counterparty, is_income, finance_entry_id, status",
      )
      .eq("organization_id", data.orgId)
      .gte("transaction_date", since.toISOString().slice(0, 10))
      .order("transaction_date", { ascending: false })
      .limit(500);
    if (error) throw new Error(error.message);

    const { data: accs } = await context.supabase
      .from("bank_accounts")
      .select("id, account_name, account_number, currency, raw_metadata, bank_connection_id")
      .eq("organization_id", data.orgId);

    return { transactions: txs ?? [], accounts: accs ?? [] };
  });
