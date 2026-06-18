// Neonomics-implementasjon av BankProvider.
// Docs: https://docs.neonomics.io  (ICS v3)
import type {
  BankAccount,
  BankConnectionInit,
  BankConnectionStatus,
  BankInfo,
  BankProvider,
  BankProviderContext,
  BankTransaction,
} from "../types";
import { getNeonomicsConfig } from "../neonomics.config.server";

let cachedAppToken: { token: string; exp: number } | null = null;

async function getAppToken(): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (cachedAppToken && cachedAppToken.exp - 60 > now) return cachedAppToken.token;
  const cfg = getNeonomicsConfig();
  const basic = btoa(`${cfg.clientId}:${cfg.clientSecret}`);
  const res = await fetch(`${cfg.baseUrl}/auth/realms/sandbox/protocol/openid-connect/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`Neonomics token-feil ${res.status}: ${txt.slice(0, 200)}`);
  }
  const json = (await res.json()) as { access_token: string; expires_in: number };
  cachedAppToken = { token: json.access_token, exp: now + json.expires_in };
  return json.access_token;
}

async function neoFetch(
  ctx: BankProviderContext,
  path: string,
  init: RequestInit & { sessionId?: string; bankId?: string; redirectUrl?: string } = {},
): Promise<Response> {
  const cfg = getNeonomicsConfig();
  const token = await getAppToken();
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    "x-device-id": ctx.deviceId,
    "x-psu-id": ctx.deviceId, // PSU-identifikator (kan vere lik device for ENK/privat)
    "Content-Type": "application/json",
    ...(ctx.psuIp ? { "x-psu-ip-address": ctx.psuIp } : {}),
    ...(init.sessionId ? { "x-session-id": init.sessionId } : {}),
    ...(init.bankId ? { "x-bank-id": init.bankId } : {}),
    ...(init.redirectUrl ? { "x-redirect-url": init.redirectUrl } : {}),
    ...((init.headers as Record<string, string>) || {}),
  };
  return fetch(`${cfg.baseUrl}${path}`, { ...init, headers });
}

type NeoBank = {
  id?: string;
  bankId?: string;
  name?: string;
  countryCode?: string;
  logo?: string | null;
  logoUrl?: string | null;
};
type NeoAccount = {
  id?: string;
  accountId?: string;
  name?: string;
  accountName?: string;
  iban?: string;
  bban?: string;
  accountNumber?: string;
  currency?: string;
  balances?: unknown;
};
type NeoTx = {
  id?: string;
  transactionId?: string;
  internalTransactionId?: string;
  transactionDate?: string;
  bookingDate?: string;
  valueDate?: string;
  amount?: number | string | { value?: number | string };
  currency?: string;
  remittanceInformation?: string | { unstructured?: string };
  remittanceInformationUnstructured?: string;
  description?: string;
  creditorName?: string;
  debtorName?: string;
};

function mapBank(b: NeoBank): BankInfo {
  return {
    bankId: String(b.id ?? b.bankId ?? ""),
    name: String(b.name ?? ""),
    country: b.countryCode ?? "NO",
    logoUrl: b.logo ?? b.logoUrl ?? null,
  };
}

function mapAccount(a: NeoAccount): BankAccount {
  return {
    providerAccountId: String(a.id ?? a.accountId ?? ""),
    accountName: a.accountName ?? a.name ?? null,
    accountNumber: a.iban ?? a.bban ?? a.accountNumber ?? null,
    currency: a.currency ?? "NOK",
    rawMetadata: a as unknown as Record<string, unknown>,
  };
}

function mapTx(t: NeoTx): BankTransaction {
  const rawAmount =
    typeof t.amount === "object" && t.amount !== null ? t.amount.value : t.amount;
  const amt = typeof rawAmount === "string" ? parseFloat(rawAmount) : Number(rawAmount ?? 0);
  const desc =
    typeof t.remittanceInformation === "object"
      ? t.remittanceInformation?.unstructured ?? null
      : t.remittanceInformation ?? t.remittanceInformationUnstructured ?? t.description ?? null;
  const counterparty = t.creditorName ?? t.debtorName ?? null;
  const txDate = t.transactionDate ?? t.bookingDate ?? t.valueDate ?? new Date().toISOString();
  return {
    providerTransactionId: String(
      t.id ?? t.transactionId ?? t.internalTransactionId ?? `${txDate}-${amt}-${desc ?? ""}`,
    ),
    transactionDate: txDate.slice(0, 10),
    bookingDate: t.bookingDate ? t.bookingDate.slice(0, 10) : null,
    amount: amt,
    currency: t.currency ?? "NOK",
    description: desc,
    counterparty,
    isIncome: amt > 0,
    rawPayload: t as unknown as Record<string, unknown>,
  };
}

export const neonomicsProvider: BankProvider = {
  name: "neonomics",

  async listBanks(ctx, country = "NO"): Promise<BankInfo[]> {
    const res = await neoFetch(ctx, `/ics/v3/banks?countryCode=${encodeURIComponent(country)}`);
    if (!res.ok) throw new Error(`Neonomics listBanks ${res.status}`);
    const json = (await res.json()) as NeoBank[] | { data?: NeoBank[] };
    const arr = Array.isArray(json) ? json : json.data ?? [];
    return arr.map(mapBank).filter((b) => b.bankId);
  },

  async startConnect(ctx, bankId, redirectUrl): Promise<BankConnectionInit> {
    // 1) Opprett session
    const sessRes = await neoFetch(ctx, "/ics/v3/session", {
      method: "POST",
      bankId,
      body: JSON.stringify({}),
    });
    if (!sessRes.ok) throw new Error(`Neonomics session ${sessRes.status}`);
    const sess = (await sessRes.json()) as { sessionId?: string; id?: string };
    const sessionId = String(sess.sessionId ?? sess.id ?? "");
    if (!sessionId) throw new Error("Neonomics: manglar sessionId");

    // 2) Trig consent — GET /accounts skal returnere 1426 utan consent
    const accRes = await neoFetch(ctx, "/ics/v3/accounts", {
      sessionId,
      bankId,
      redirectUrl,
    });
    if (accRes.status === 200) {
      // Allereie consented
      return { providerConnectionId: sessionId, consentUrl: null };
    }
    const body = await accRes.json().catch(() => ({} as Record<string, unknown>));
    const links = (body as { links?: { href?: string }[] }).links;
    const href = links?.[0]?.href;
    if (!href) {
      throw new Error(
        `Neonomics consent-href mangler (status ${accRes.status}): ${JSON.stringify(body).slice(0, 200)}`,
      );
    }
    return { providerConnectionId: sessionId, consentUrl: href };
  },

  async completeConnect(ctx, providerConnectionId) {
    const res = await neoFetch(ctx, "/ics/v3/accounts", { sessionId: providerConnectionId });
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      throw new Error(`Neonomics completeConnect ${res.status}: ${txt.slice(0, 200)}`);
    }
    // Neonomics-consent varer typisk 90 dagar
    const exp = new Date();
    exp.setUTCDate(exp.getUTCDate() + 90);
    const status: BankConnectionStatus = "active";
    return { status, consentExpiresAt: exp.toISOString() };
  },

  async listAccounts(ctx, providerConnectionId): Promise<BankAccount[]> {
    const res = await neoFetch(ctx, "/ics/v3/accounts", { sessionId: providerConnectionId });
    if (!res.ok) throw new Error(`Neonomics listAccounts ${res.status}`);
    const json = (await res.json()) as NeoAccount[] | { accounts?: NeoAccount[]; data?: NeoAccount[] };
    const arr = Array.isArray(json) ? json : json.accounts ?? json.data ?? [];
    return arr.map(mapAccount).filter((a) => a.providerAccountId);
  },

  async listTransactions(ctx, providerConnectionId, providerAccountId, dateFrom, dateTo) {
    const qs = `?dateFrom=${dateFrom}&dateTo=${dateTo}`;
    const res = await neoFetch(
      ctx,
      `/ics/v3/accounts/${encodeURIComponent(providerAccountId)}/transactions${qs}`,
      { sessionId: providerConnectionId },
    );
    if (!res.ok) throw new Error(`Neonomics listTransactions ${res.status}`);
    const json = (await res.json()) as
      | NeoTx[]
      | { transactions?: { booked?: NeoTx[]; pending?: NeoTx[] } | NeoTx[]; data?: NeoTx[] };
    let arr: NeoTx[] = [];
    if (Array.isArray(json)) arr = json;
    else if (Array.isArray(json.data)) arr = json.data;
    else if (Array.isArray(json.transactions)) arr = json.transactions;
    else if (json.transactions && typeof json.transactions === "object") {
      arr = [
        ...(json.transactions.booked ?? []),
        ...(json.transactions.pending ?? []),
      ];
    }
    return arr.map(mapTx);
  },
};
