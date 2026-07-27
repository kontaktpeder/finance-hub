const DEFAULT_NEXUS_APP = "https://foundation-verse-core.lovable.app";
const DEFAULT_AUTH_URL = "https://cjkebodisgqejrpvanna.supabase.co";
const DEFAULT_AUTH_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNqa2Vib2Rpc2dxZWpycHZhbm5hIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI5MDY1NjgsImV4cCI6MjA5ODQ4MjU2OH0.7Gl1Pe6Ql6LujNzmHWeHUagEvKLHMtx_5wpc3Cda67U";

function readEnv(...keys: string[]): string {
  for (const key of keys) {
    const fromImport =
      typeof import.meta !== "undefined" && import.meta.env
        ? String((import.meta.env as Record<string, unknown>)[key] ?? "")
        : "";
    const fromProcess =
      typeof process !== "undefined" && process.env
        ? String(process.env[key] ?? "")
        : "";
    const value = (fromImport || fromProcess).trim();
    if (value) return value;
  }
  return "";
}

/** SSO redirect to Nexus is enabled when NEXUS_APP_URL is set (or production default). */
export function isSharedAuthEnabled(): boolean {
  return Boolean(getNexusAppUrl());
}

export function isSsoRedirectEnabled(): boolean {
  return isSharedAuthEnabled();
}

export function getAuthSupabaseConfig(): { url: string; key: string } | null {
  const url =
    readEnv("VITE_AUTH_SUPABASE_URL", "AUTH_SUPABASE_URL") || DEFAULT_AUTH_URL;
  const key =
    readEnv("VITE_AUTH_SUPABASE_PUBLISHABLE_KEY", "AUTH_SUPABASE_PUBLISHABLE_KEY") ||
    DEFAULT_AUTH_KEY;
  if (!url || !key) return null;
  return { url, key };
}

export function getNexusAppUrl(): string {
  return (
    readEnv("VITE_NEXUS_APP_URL", "NEXUS_APP_URL") || DEFAULT_NEXUS_APP
  ).replace(/\/$/, "");
}
