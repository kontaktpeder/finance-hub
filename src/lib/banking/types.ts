// Provider-agnostisk type-lag for Open Banking.
// Konkrete providerar (Neonomics, GoCardless, Tink, Aiia) implementerer BankProvider.

export type BankConnectionStatus = "pending" | "active" | "expired" | "error" | "revoked";

export type BankInfo = {
  bankId: string;
  name: string;
  country?: string;
  logoUrl?: string | null;
  /** True om banken krev kryptert PSU-id/fødselsnummer før consent kan startast. */
  requiresPsuId?: boolean;
};

export type BankConnectionInit = {
  /** Provider-side session/connection id som må sendast vidare ved completeConnect. */
  providerConnectionId: string;
  /** SCA / consent-URL som brukaren må sendast til. Null om provider ikkje krev redirect. */
  consentUrl: string | null;
};

export type BankAccount = {
  providerAccountId: string;
  accountName: string | null;
  accountNumber: string | null;
  currency: string;
  rawMetadata?: Record<string, unknown>;
};

export type BankTransaction = {
  providerTransactionId: string;
  transactionDate: string; // YYYY-MM-DD
  bookingDate: string | null;
  amount: number; // signert; negativ = utgift
  currency: string;
  description: string | null;
  counterparty: string | null;
  isIncome: boolean;
  rawPayload?: Record<string, unknown>;
};

export type BankProviderContext = {
  /** Stabil per organisasjon. Lagrast i bank_connections.device_id. */
  deviceId: string;
  /** Kryptert PSU-id for banker som krev personidentifikasjon. Skal ikkje vere lik deviceId. */
  psuId?: string | null;
  /** PSU IP-adresse (PSD2-krav for nokre providerar). */
  psuIp?: string | null;
};

export interface BankProvider {
  readonly name: string;

  /** Liste over støtta bankar for landet. */
  listBanks(ctx: BankProviderContext, country?: string): Promise<BankInfo[]>;

  /** Start consent-flyt for ein bank. Returnerer provider-id + consent-URL. */
  startConnect(ctx: BankProviderContext, bankId: string, redirectUrl: string): Promise<BankConnectionInit>;

  /** Fullfør consent etter SCA-callback. Returnerer endeleg status. */
  completeConnect(
    ctx: BankProviderContext,
    providerConnectionId: string,
  ): Promise<{ status: BankConnectionStatus; consentExpiresAt: string | null }>;

  /** Hent kontoar for ein aktiv connection. */
  listAccounts(ctx: BankProviderContext, providerConnectionId: string): Promise<BankAccount[]>;

  /** Hent transaksjonar for ein konto. dateFrom inkluderande, dateTo eksklusiv. */
  listTransactions(
    ctx: BankProviderContext,
    providerConnectionId: string,
    providerAccountId: string,
    dateFrom: string,
    dateTo: string,
  ): Promise<BankTransaction[]>;
}
