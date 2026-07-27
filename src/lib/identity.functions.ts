import { createClient } from "@supabase/supabase-js";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { getAuthSupabaseConfig } from "@/integrations/supabase/shared-auth";

function emailFromAccessToken(accessToken: string): string | null {
  try {
    const payload = JSON.parse(
      Buffer.from(accessToken.split(".")[1] ?? "", "base64url").toString("utf8"),
    ) as { email?: unknown };
    return typeof payload.email === "string" ? payload.email.trim().toLowerCase() : null;
  } catch {
    return null;
  }
}

async function findUserIdsByEmail(admin: any, email: string): Promise<string[]> {
  const normalized = email.trim().toLowerCase();
  const ids = new Set<string>();

  const { data: linkData } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email: normalized,
  });
  if (linkData?.user?.id) ids.add(linkData.user.id as string);

  for (let page = 1; page <= 5; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) break;
    for (const u of data.users ?? []) {
      if ((u.email ?? "").toLowerCase() === normalized && u.id) ids.add(u.id as string);
    }
    if ((data.users?.length ?? 0) < 200) break;
  }
  return [...ids];
}

async function remapMemberships(admin: any, fromUserId: string, toUserId: string): Promise<number> {
  if (fromUserId === toUserId) return 0;
  const { data: rows, error } = await admin
    .from("organization_members")
    .select("id, organization_id")
    .eq("user_id", fromUserId);
  if (error) throw new Error(error.message);
  let remapped = 0;
  for (const row of rows ?? []) {
    const { data: clash } = await admin
      .from("organization_members")
      .select("id")
      .eq("organization_id", row.organization_id)
      .eq("user_id", toUserId)
      .maybeSingle();
    if (clash) {
      await admin.from("organization_members").delete().eq("id", row.id);
    } else {
      const { error: upErr } = await admin
        .from("organization_members")
        .update({ user_id: toUserId })
        .eq("id", row.id);
      if (upErr) throw new Error(upErr.message);
      remapped += 1;
    }
  }
  return remapped;
}

/**
 * Ensure auth.users contains Nexus user id. If the email is already taken by a
 * legacy local UUID, remap memberships, delete the legacy user, recreate with Nexus id.
 */
async function ensureShadowAndRemap(
  admin: any,
  userId: string,
  email: string | null,
): Promise<{ remapped: number; shadowCreated: boolean; email: string | null }> {
  const { data: existing } = await admin.auth.admin.getUserById(userId);
  if (existing.user) {
    const resolvedEmail =
      email?.trim().toLowerCase() || existing.user.email?.trim().toLowerCase() || null;
    let remapped = 0;
    if (resolvedEmail) {
      for (const oldId of await findUserIdsByEmail(admin, resolvedEmail)) {
        remapped += await remapMemberships(admin, oldId, userId);
      }
    }
    return { remapped, shadowCreated: false, email: resolvedEmail };
  }

  if (!email) {
    throw new Error("Kan ikke opprette shadow-bruker uten e-post.");
  }
  const normalized = email.trim().toLowerCase();

  const { error: createErr } = await admin.auth.admin.createUser({
    id: userId,
    email: normalized,
    email_confirm: true,
  });

  if (!createErr) {
    let remapped = 0;
    for (const oldId of await findUserIdsByEmail(admin, normalized)) {
      remapped += await remapMemberships(admin, oldId, userId);
    }
    return { remapped, shadowCreated: true, email: normalized };
  }

  // Email already registered under another UUID — migrate dogfood identity.
  if (!/already|exists|registered/i.test(createErr.message)) {
    throw new Error(createErr.message);
  }

  const legacyIds = (await findUserIdsByEmail(admin, normalized)).filter((id) => id !== userId);
  let remapped = 0;
  for (const oldId of legacyIds) {
    remapped += await remapMemberships(admin, oldId, userId);
    const { error: delErr } = await admin.auth.admin.deleteUser(oldId);
    if (delErr) throw new Error(`Kunne ikke erstatte lokal bruker: ${delErr.message}`);
  }

  const { error: retryErr } = await admin.auth.admin.createUser({
    id: userId,
    email: normalized,
    email_confirm: true,
  });
  if (retryErr) throw new Error(retryErr.message);

  return { remapped, shadowCreated: true, email: normalized };
}

async function mintModuleSession(email: string): Promise<{
  access_token: string;
  refresh_token: string;
}> {
  const url = process.env.SUPABASE_URL;
  const anon = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!url || !anon) throw new Error("SUPABASE_URL / PUBLISHABLE_KEY mangler");

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: linkData, error: linkErr } = await supabaseAdmin.auth.admin.generateLink({
    type: "magiclink",
    email: email.trim().toLowerCase(),
  });
  if (linkErr) throw new Error(linkErr.message);
  const tokenHash = (linkData as { properties?: { hashed_token?: string } })?.properties
    ?.hashed_token;
  if (!tokenHash) throw new Error("Kunne ikke lage modul-sesjon (mangler hashed_token)");

  const userClient = createClient(url, anon, {
    auth: { persistSession: false, autoRefreshToken: false, storage: undefined },
  });
  const { data, error } = await userClient.auth.verifyOtp({
    token_hash: tokenHash,
    type: "email",
  });
  if (error || !data.session?.access_token || !data.session.refresh_token) {
    throw new Error(error?.message ?? "Kunne ikke verifisere modul-sesjon");
  }
  return {
    access_token: data.session.access_token,
    refresh_token: data.session.refresh_token,
  };
}

/**
 * Lovable Cloud–safe SSO (no shared JWT secret):
 * Nexus handoff → verify → shadow user (same UUID) → Finance-local session.
 */
export const completeNexusSsoLogin = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => {
    const code =
      typeof (input as { code?: unknown })?.code === "string"
        ? (input as { code: string }).code.trim()
        : "";
    if (!code) throw new Error("Mangler SSO-kode");
    return { code };
  })
  .handler(async ({ data }) => {
    const nexusApp = (
      process.env.NEXUS_APP_URL ||
      process.env.VITE_NEXUS_APP_URL ||
      "https://foundation-verse-core.lovable.app"
    ).replace(/\/$/, "");
    if (!nexusApp) throw new Error("NEXUS_APP_URL er ikke satt på server.");

    const res = await fetch(`${nexusApp}/api/sso/exchange`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: data.code }),
    });
    const body = (await res.json().catch(() => ({}))) as {
      error?: string;
      access_token?: string;
      user_id?: string;
    };
    if (!res.ok || !body.access_token) {
      throw new Error(body.error || `SSO-utveksling feilet (HTTP ${res.status})`);
    }

    const authCfg = getAuthSupabaseConfig();
    if (!authCfg) {
      throw new Error("AUTH_SUPABASE_URL / KEY mangler på server (trengs for Nexus-token).");
    }
    const nexusAuth = createClient(authCfg.url, authCfg.key, {
      auth: { persistSession: false, autoRefreshToken: false, storage: undefined },
    });
    const { data: claimsData, error: claimsErr } = await nexusAuth.auth.getClaims(
      body.access_token,
    );
    if (claimsErr || !claimsData?.claims?.sub) {
      throw new Error(claimsErr?.message || "Ugyldig Nexus-token");
    }

    const userId = claimsData.claims.sub as string;
    const email =
      (typeof claimsData.claims.email === "string" && claimsData.claims.email) ||
      emailFromAccessToken(body.access_token);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const ensured = await ensureShadowAndRemap(supabaseAdmin, userId, email);
    if (!ensured.email) {
      throw new Error("Mangler e-post for å lage lokal sesjon");
    }

    const session = await mintModuleSession(ensured.email);
    // Guard: session must be the Nexus UUID, not a leftover local account.
    const sessionSub = JSON.parse(
      Buffer.from(session.access_token.split(".")[1] ?? "", "base64url").toString("utf8"),
    ) as { sub?: string };
    if (sessionSub.sub && sessionSub.sub !== userId) {
      throw new Error(
        `Sesjon fikk feil bruker-id (${sessionSub.sub} ≠ ${userId}). Prøv igjen etter migrering.`,
      );
    }

    return {
      access_token: session.access_token,
      refresh_token: session.refresh_token,
      user_id: userId,
      email: ensured.email,
      remapped: ensured.remapped,
      shadowCreated: ensured.shadowCreated,
    };
  });

export const exchangeNexusSsoCode = completeNexusSsoLogin;

const EnsureSchema = z.object({
  email: z.string().email().optional(),
});

export const ensureModuleIdentity = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => EnsureSchema.parse(input ?? {}))
  .handler(async ({ data, context }) => {
    const userId = context.userId as string;
    const email =
      data.email ||
      (typeof context.claims?.email === "string" && context.claims.email) ||
      null;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const ensured = await ensureShadowAndRemap(supabaseAdmin, userId, email);
    return { ok: true as const, ...ensured, userId };
  });
