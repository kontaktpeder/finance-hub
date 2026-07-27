/** SSO redirect to Nexus is enabled when NEXUS_APP_URL is set. */
export function isSharedAuthEnabled(): boolean {
  return Boolean(getNexusAppUrl());
}

/** Alias — Nexus redirect / Identity Core UX. */
export function isSsoRedirectEnabled(): boolean {
  return isSharedAuthEnabled();
}

export function getAuthSupabaseConfig(): { url: string; key: string } | null {
  const url = String(
    (typeof import.meta !== "undefined" && import.meta.env?.VITE_AUTH_SUPABASE_URL) ||
      (typeof process !== "undefined" && process.env?.AUTH_SUPABASE_URL) ||
      (typeof process !== "undefined" && process.env?.VITE_AUTH_SUPABASE_URL) ||
      "",
  ).trim();
  const key = String(
    (typeof import.meta !== "undefined" && import.meta.env?.VITE_AUTH_SUPABASE_PUBLISHABLE_KEY) ||
      (typeof process !== "undefined" && process.env?.AUTH_SUPABASE_PUBLISHABLE_KEY) ||
      (typeof process !== "undefined" && process.env?.VITE_AUTH_SUPABASE_PUBLISHABLE_KEY) ||
      "",
  ).trim();
  if (!url || !key) return null;
  return { url, key };
}

export function getNexusAppUrl(): string {
  return String(
    (typeof import.meta !== "undefined" && import.meta.env?.VITE_NEXUS_APP_URL) ||
      (typeof process !== "undefined" && process.env?.NEXUS_APP_URL) ||
      (typeof process !== "undefined" && process.env?.VITE_NEXUS_APP_URL) ||
      "",
  )
    .trim()
    .replace(/\/$/, "");
}
