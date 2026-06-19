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

const StartInput = z.object({
  orgId: z.string().uuid(),
  bankId: z.string().min(1),
  psuId: z.string().trim().min(1).max(64).optional(),
});

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
        raw_metadata: (data.psuId ? { psuId: data.psuId } : {}) as never,
      })
      .select("id")
      .single();
    if (insErr || !conn) throw new Error(insErr?.message ?? "Klarte ikkje opprette tilkobling");

    const appOrigin = getAppOrigin();
    const redirectUrl = `${appOrigin}/orgs/${data.orgId}/bank/callback?connectionId=${conn.id}`;
    console.log("[banking] startConnect appOrigin=", appOrigin, "redirectUrl=", redirectUrl);

    try {
      const init = await getProvider("neonomics").startConnect(
        { deviceId, psuIp: getPsuIpAddress(), psuId: data.psuId ?? null },
        data.bankId,
        redirectUrl,
      );
      await supabaseAdmin
        .from("bank_connections")
        .update({
          provider_connection_id: init.providerConnectionId,
          raw_metadata: { redirectUrl, ...(data.psuId ? { psuId: data.psuId } : {}) } as never,
        })
        .eq("id", conn.id);

      console.log("[banking] startConnect connectionId=", conn.id, "providerConnectionId=", init.providerConnectionId, "consentUrl=", init.consentUrl);
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
    const meta = (conn.raw_metadata ?? {}) as { psuId?: string };
    const psuId = meta.psuId ?? null;
    const result = await getProvider(conn.provider).completeConnect(
      { deviceId: conn.device_id as string, psuIp, psuId },
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

    console.log("[banking] completeConnect connectionId=", conn.id, "status=", result.status);
    const synced = await syncConnection(conn.id, psuIp);
    console.log("[banking] completeConnect synced accounts=", synced.accounts, "transactions=", synced.transactions);
    return { ok: true as const, ...synced };
  });

const DeleteInput = z.object({
  orgId: z.string().uuid(),
  connectionId: z.string().uuid(),
});

export const deleteBankConnectionFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => DeleteInput.parse(input))
  .handler(async ({ data, context }) => {
    const { requireBankAdmin } = await import("./banking/banking.utils.server");
    await requireBankAdmin(context.supabase, data.orgId, context.userId);
    const { supabaseAdmin } = await import("./../integrations/supabase/client.server");

    const { data: conn, error } = await supabaseAdmin
      .from("bank_connections")
      .select("id, status")
      .eq("id", data.connectionId)
      .eq("organization_id", data.orgId)
      .single();
    if (error || !conn) throw new Error("Bank-tilkobling ikkje funnen");
    if (conn.status !== "error" && conn.status !== "pending") {
      throw new Error("Berre tilkoblingar med status feil/venter kan slettast");
    }

    const { data: accs } = await supabaseAdmin
      .from("bank_accounts")
      .select("id")
      .eq("bank_connection_id", conn.id);
    const accIds = (accs ?? []).map((a) => a.id);
    if (accIds.length > 0) {
      await supabaseAdmin.from("bank_transactions").delete().in("bank_account_id", accIds);
      await supabaseAdmin.from("bank_accounts").delete().in("id", accIds);
    }
    const { error: delErr } = await supabaseAdmin
      .from("bank_connections")
      .delete()
      .eq("id", conn.id);
    if (delErr) throw new Error(delErr.message);
    return { ok: true as const };
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

export const diagnoseBanksFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => OrgInput.parse(input))
  .handler(async ({ data, context }) => {
    const { requireBankAdmin, getPsuIpAddress } = await import("./banking/banking.utils.server");
    await requireBankAdmin(context.supabase, data.orgId, context.userId);
    const { getOrCreateDeviceId } = await import("./banking/BankSyncService.server");
    const { listBanksRaw } = await import("./banking/providers/neonomics.provider.server");
    const { getNeonomicsConfig } = await import("./banking/neonomics.config.server");

    const deviceId = await getOrCreateDeviceId(data.orgId);
    const cfg = getNeonomicsConfig();
    const raw = await listBanksRaw({ deviceId, psuIp: getPsuIpAddress() }, "NO");
    return {
      env: {
        baseUrl: cfg.baseUrl,
        realm: cfg.realm,
        isSandboxDefault: !process.env.NEONOMICS_BASE_URL && !process.env.NEONOMICS_REALM,
      },
      count: raw.length,
      banks: raw.map((b) => ({
        id: b.id ?? b.bankId ?? null,
        bic: b.bic ?? null,
        name:
          b.bankDisplayName ?? b.name ?? b.fullName ?? b.bankName ?? b.bankOfficialName ?? b.shortName ?? null,
        status: b.status ?? null,
        supportedServices: b.supportedServices ?? null,
        personalIdentificationRequired: Boolean(b.personalIdentificationRequired),
      })),
    };
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
