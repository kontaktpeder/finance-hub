// Neonomics konfigurasjon. Berre lest inni server-handlers.
// Sandbox: https://sandbox.neonomics.io
// Prod:    https://api.neonomics.io
export type NeonomicsConfig = {
  clientId: string;
  clientSecret: string;
  baseUrl: string;
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
  return {
    clientId,
    clientSecret,
    baseUrl: (process.env.NEONOMICS_BASE_URL || "https://sandbox.neonomics.io").replace(/\/+$/, ""),
  };
}
