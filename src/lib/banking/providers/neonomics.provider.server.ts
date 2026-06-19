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
  const res = await fetch(cfg.tokenUrl, {
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
    "Content-Type": "application/json",
    ...(ctx.psuId ? { "x-psu-id": ctx.psuId } : {}),
    ...(ctx.psuIp ? { "x-psu-ip-address": ctx.psuIp } : {}),
    ...(init.sessionId ? { "x-session-id": init.sessionId } : {}),
    ...(init.bankId ? { "x-bank-id": init.bankId } : {}),
    ...(init.redirectUrl ? { "x-redirect-url": init.redirectUrl } : {}),
    ...((init.headers as Record<string, string>) || {}),
  };
  const url = path.startsWith("http") ? path : `${cfg.baseUrl}${path}`;
  return fetch(url, { ...init, headers });
}

type NeoBank = {
  id?: string;
  bankId?: string;
  bic?: string;
  name?: string;
  bankDisplayName?: string;
  bankOfficialName?: string;
  bankName?: string;
  fullName?: string;
  shortName?: string;
  countryCode?: string;
  status?: string;
  supportedServices?: string[];
  personalIdentificationRequired?: boolean;
  logo?: string | null;
  logoUrl?: string | null;
  image?: { url?: string } | null;
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
  // Neonomics /session ventar bank-id frå /banks (base64 composite-id), ikkje BIC.
  return {
    bankId: String(b.id ?? b.bankId ?? ""),
    name: String(
      b.bankDisplayName ?? b.name ?? b.fullName ?? b.bankName ?? b.bankOfficialName ?? b.shortName ?? b.bic ?? "",
    ),
    bic: b.bic ?? null,
    country: b.countryCode ?? "NO",
    logoUrl: b.image?.url ?? b.logo ?? b.logoUrl ?? null,
    requiresPsuId: Boolean(b.personalIdentificationRequired),
  };
}

function isSbankenBank(
  bic: string | null | undefined,
  name: string | null | undefined,
): boolean {
  return /SBAK/i.test(bic ?? "") || /sbanken/i.test(name ?? "");
}

function effectiveRequiresPsuId(
  personalIdentificationRequired: boolean,
  bic: string | null | undefined,
  name: string | null | undefined,
  isSandbox: boolean,
): boolean {
  if (isSandbox && isSbankenBank(bic, name)) return false;
  return personalIdentificationRequired;
}

async function resolveBankResource(
  ctx: BankProviderContext,
  requestedBankId: string,
): Promise<{
  resourceBankId: string;
  personalIdentificationRequired: boolean;
  bic: string | null;
  name: string | null;
}> {
  const res = await neoFetch(ctx, "/ics/v3/banks?countryCode=NO");
  if (!res.ok) {
    return {
      resourceBankId: requestedBankId,
      personalIdentificationRequired: false,
      bic: null,
      name: null,
    };
  }

  const json = (await res.json().catch(() => [])) as NeoBank[] | { data?: NeoBank[] };
  const banks = Array.isArray(json) ? json : json.data ?? [];
  const match = banks.find(
    (b) => b.id === requestedBankId || b.bankId === requestedBankId || b.bic === requestedBankId,
  );
  return {
    resourceBankId: String(match?.id ?? match?.bankId ?? requestedBankId),
    personalIdentificationRequired: Boolean(match?.personalIdentificationRequired),
    bic: match?.bic ?? null,
    name:
      match?.bankDisplayName ??
      match?.name ??
      match?.fullName ??
      match?.bankName ??
      match?.bankOfficialName ??
      match?.shortName ??
      null,
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

export async function listBanksRaw(
  ctx: BankProviderContext,
  country = "NO",
): Promise<NeoBank[]> {
  const res = await neoFetch(ctx, `/ics/v3/banks?countryCode=${encodeURIComponent(country)}`);
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`Neonomics listBanksRaw ${res.status}: ${t.slice(0, 300)}`);
  }
  const json = (await res.json()) as NeoBank[] | { data?: NeoBank[] };
  return Array.isArray(json) ? json : json.data ?? [];
}

export const neonomicsProvider: BankProvider = {
  name: "neonomics",

  async listBanks(ctx, country = "NO"): Promise<BankInfo[]> {
    const res = await neoFetch(ctx, `/ics/v3/banks?countryCode=${encodeURIComponent(country)}`);
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      throw new Error(`Neonomics listBanks ${res.status}: ${t.slice(0, 300)}`);
    }
    const json = (await res.json()) as NeoBank[] | { data?: NeoBank[] };
    const arr = Array.isArray(json) ? json : json.data ?? [];
    return arr
      .filter((b) => !b.status || b.status === "AVAILABLE")
      .filter((b) => !b.supportedServices || b.supportedServices.includes("accounts"))
      .map(mapBank)
      .filter((b) => b.bankId);
  },

  async startConnect(ctx, bankId, redirectUrl): Promise<BankConnectionInit> {
    const { resourceBankId, personalIdentificationRequired } = await resolveBankResource(ctx, bankId);
    if (personalIdentificationRequired && !ctx.psuId) {
      throw new Error(
        "Denne banken krev PSU-id (fødselsnummer). Skriv inn PSU-id i feltet og prøv igjen.",
      );
    }

    // 1) Opprett session
    const sessRes = await neoFetch(ctx, "/ics/v3/session", {
      method: "POST",
      body: JSON.stringify({ bankId: resourceBankId }),
    });
    if (!sessRes.ok) {
      const t = await sessRes.text().catch(() => "");
      throw new Error(
        `Neonomics session ${sessRes.status}: ${t.slice(0, 400)} ` +
          `(deviceId=${ctx.deviceId.slice(0, 8)}…, bankId=${resourceBankId})`,
      );
    }
    const sess = (await sessRes.json()) as { sessionId?: string; id?: string };
    const sessionId = String(sess.sessionId ?? sess.id ?? "");
    if (!sessionId) throw new Error("Neonomics: manglar sessionId");
    console.log("[neonomics] startConnect sessionId=", sessionId, "bankId=", resourceBankId, "psuId=", ctx.psuId ? "set" : "none");

    // 2) Trig consent — GET /accounts skal returnere 1426 utan consent, med links til SCA-URL
    const accRes = await neoFetch(ctx, "/ics/v3/accounts", {
      sessionId,
      redirectUrl,
    });
    if (accRes.status === 200) {
      console.log("[neonomics] startConnect already consented sessionId=", sessionId);
      return { providerConnectionId: sessionId, consentUrl: null };
    }
    const body = await accRes.json().catch(() => ({} as Record<string, unknown>));
    console.log("[neonomics] /accounts 1426 body=", JSON.stringify(body).slice(0, 800));
    const links = (body as { links?: { href?: string; rel?: string }[] }).links ?? [];
    const consentHref =
      links.find((l) => l.rel === "consent")?.href ??
      links.find((l) => l.href?.startsWith("http"))?.href ??
      null;
    if (!consentHref) {
      throw new Error(
        `Neonomics consent-href mangler (status ${accRes.status}): ${JSON.stringify(body).slice(0, 300)}`,
      );
    }

    const cfg = getNeonomicsConfig();
    const isSandbox = cfg.baseUrl.includes("sandbox") || cfg.baseUrl.includes("development");
    // Sbanken sandbox bank id (base64 of "Sbanken.v1SBAKNOBB")
    const isSbankenSandbox = isSandbox && /sbank/i.test(resourceBankId);

    const token = await getAppToken();
    const psuIpForConsent = ctx.psuIp ?? (isSandbox ? "127.0.0.1" : null);

    const consentHeaders: Record<string, string> = {
      Authorization: `Bearer ${token}`,
      "x-device-id": ctx.deviceId,
      Accept: "application/json",
    };
    if (psuIpForConsent) consentHeaders["x-psu-ip-address"] = psuIpForConsent;
    // Sbanken sandbox: omit x-session-id (already in path), x-redirect-url, x-psu-id
    if (!isSbankenSandbox) {
      consentHeaders["x-session-id"] = sessionId;
      if (redirectUrl) consentHeaders["x-redirect-url"] = redirectUrl;
      if (personalIdentificationRequired && ctx.psuId) {
        consentHeaders["x-psu-id"] = ctx.psuId;
      }
    }

    console.log("[neonomics] consent request audit", {
      selectedBank: resourceBankId,
      sessionId,
      method: "GET",
      url: consentHref,
      isSbankenSandbox,
      headers: {
        Authorization: consentHeaders.Authorization ? "yes" : "no",
        Accept: consentHeaders.Accept ? "yes" : "no",
        "x-device-id": consentHeaders["x-device-id"] ? "yes" : "no",
        "x-psu-ip-address": consentHeaders["x-psu-ip-address"] ? "yes" : "no",
        "x-session-id": consentHeaders["x-session-id"] ? "yes" : "no",
        "x-redirect-url": consentHeaders["x-redirect-url"] ? "yes" : "no",
        "x-psu-id": consentHeaders["x-psu-id"] ? "yes" : "no",
      },
      headerValues: {
        "x-device-id": consentHeaders["x-device-id"]?.slice(0, 8) + "…",
        "x-psu-ip-address": consentHeaders["x-psu-ip-address"] ?? null,
        "x-session-id": consentHeaders["x-session-id"] ?? null,
        "x-redirect-url": consentHeaders["x-redirect-url"] ?? null,
      },
    });

    const scaRes = await fetch(consentHref, {
      method: "GET",
      redirect: "manual",
      headers: consentHeaders,
    });
    const loc = scaRes.headers.get("location");
    const scaText = await scaRes.text().catch(() => "");
    console.log(
      "[neonomics] consent response status=",
      scaRes.status,
      "body=",
      scaText.slice(0, 800),
      "location=",
      loc,
    );

    if (loc) {
      console.log("[neonomics] consent SCA URL=", loc);
      return { providerConnectionId: sessionId, consentUrl: loc };
    }
    let scaBody: Record<string, unknown> = {};
    try { scaBody = JSON.parse(scaText) as Record<string, unknown>; } catch { /* noop */ }
    const scaLinks = (scaBody as { links?: { href?: string; rel?: string }[] }).links ?? [];
    const scaUrl =
      (scaBody as { url?: string }).url ??
      (scaBody as { redirectUrl?: string }).redirectUrl ??
      (scaBody as { scaUrl?: string }).scaUrl ??
      scaLinks.find((l) => l.href?.startsWith("http") && !l.href.includes("/ics/v3/"))?.href ??
      null;
    if (!scaUrl) {
      throw new Error(
        `Neonomics SCA-URL mangler (status ${scaRes.status}): ${scaText.slice(0, 300)}`,
      );
    }
    console.log("[neonomics] consent SCA URL=", scaUrl);
    return { providerConnectionId: sessionId, consentUrl: scaUrl };
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
