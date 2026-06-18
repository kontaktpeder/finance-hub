// Neonomics-provider — STUB. Sandbox-kall blir lagt på i neste runde
// når NEONOMICS_CLIENT_ID/SECRET er sett som secrets.
// Docs: https://docs.neonomics.io
import type {
  BankAccount,
  BankConnectionInit,
  BankConnectionStatus,
  BankInfo,
  BankProvider,
  BankProviderContext,
  BankTransaction,
} from "../types";

function notImplemented(method: string): never {
  throw new Error(
    `Neonomics-provider: ${method} ikkje implementert enno. Set NEONOMICS_CLIENT_ID/SECRET og fullfør Sprint 1.`,
  );
}

export const neonomicsProvider: BankProvider = {
  name: "neonomics",

  async listBanks(_ctx: BankProviderContext, _country = "NO"): Promise<BankInfo[]> {
    notImplemented("listBanks");
  },

  async startConnect(
    _ctx: BankProviderContext,
    _bankId: string,
    _redirectUrl: string,
  ): Promise<BankConnectionInit> {
    notImplemented("startConnect");
  },

  async completeConnect(
    _ctx: BankProviderContext,
    _providerConnectionId: string,
  ): Promise<{ status: BankConnectionStatus; consentExpiresAt: string | null }> {
    notImplemented("completeConnect");
  },

  async listAccounts(
    _ctx: BankProviderContext,
    _providerConnectionId: string,
  ): Promise<BankAccount[]> {
    notImplemented("listAccounts");
  },

  async listTransactions(
    _ctx: BankProviderContext,
    _providerConnectionId: string,
    _providerAccountId: string,
    _dateFrom: string,
    _dateTo: string,
  ): Promise<BankTransaction[]> {
    notImplemented("listTransactions");
  },
};
