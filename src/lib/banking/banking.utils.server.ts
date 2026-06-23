// Hjelpere brukt av bank-server-funksjonar og provider.
import { getRequest, getRequestHeader } from "@tanstack/react-start/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

export function getPsuIpAddress(): string | null {
  try {
    const fwd = getRequestHeader("x-forwarded-for");
    if (fwd) return fwd.split(",")[0]!.trim();
    const real = getRequestHeader("x-real-ip");
    if (real) return real.trim();
  } catch {}
  return null;
}

/** Normaliserer norsk fødselsnummer til 11 siffer. Returnerer null om ugyldig. */
export function normalizePsuId(value?: string | null): string | null {
  const digits = (value ?? "").replace(/\D/g, "");
  return digits.length === 11 ? digits : null;
}

/** Maskerer PSU-id for logging: viser kun siste 4 siffer. */
export function maskPsuId(value?: string | null): string {
  const n = normalizePsuId(value);
  if (!n) return value ? "invalid" : "none";
  return "*******" + n.slice(-4);
}

export function getAppOrigin(): string {
  try {
    const req = getRequest();
    if (req?.url) {
      const u = new URL(req.url);
      const host = getRequestHeader("x-forwarded-host") || u.host;
      const proto = getRequestHeader("x-forwarded-proto") || u.protocol.replace(":", "");
      return `${proto}://${host}`;
    }
  } catch {}
  return process.env.APP_ORIGIN || "http://localhost:8080";
}

export function isoDateOnly(d: Date | string): string {
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toISOString().slice(0, 10);
}

export function daysAgoISO(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return isoDateOnly(d);
}

/** Sjekkar at brukar er owner/admin i orgen. Kastar ved manglande tilgang. */
export async function requireBankAdmin(
  supabase: SupabaseClient<Database>,
  orgId: string,
  userId: string,
): Promise<void> {
  const { data, error } = await supabase
    .from("organization_members")
    .select("role")
    .eq("organization_id", orgId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(`Kunne ikkje sjekke rolle: ${error.message}`);
  if (!data || (data.role !== "owner" && data.role !== "admin")) {
    throw new Error("Forbidden: krev owner/admin for bank-tilkobling");
  }
}
