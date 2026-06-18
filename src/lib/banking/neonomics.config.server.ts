// Neonomics konfigurasjon. Berre lest inni server-handlers.
// Sandbox: baseUrl=https://sandbox.neonomics.io, realm=sandbox
// Prod:    baseUrl=https://api.neonomics.io,     realm=<oppgitt av Neonomics, t.d. "production">
export type NeonomicsConfig = {
  clientId: string;
  clientSecret: string;
  baseUrl: string;
  realm: string;
  tokenUrl: string;
};

export function isNeonomicsConfigured(): boolean {
  return Boolean(process.env.NEONOMICS_CLIENT_ID && process.env.NEONOMICS_CLIENT_SECRET);
}

export function getNeonomicsConfig(): NeonomicsConfig {
  const clientId = process.env.NEONOMICS_CLIENT_ID;
  const clientSecret = process.env.NEONOMICS_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error(
      "Neonomics ikkje konfigurert. Sett NEONOMICS_CLIENT_ID og NEONOMICS_CLIENT_SECRET.",
    );
  }
  const baseUrl = (process.env.NEONOMICS_BASE_URL || "https://sandbox.neonomics.io").replace(/\/+$/, "");
  const realm = process.env.NEONOMICS_REALM || "sandbox";
  return {
    clientId,
    clientSecret,
    baseUrl,
    realm,
    tokenUrl: `${baseUrl}/auth/realms/${encodeURIComponent(realm)}/protocol/openid-connect/token`,
  };
}

