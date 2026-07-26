import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const OrgIdSchema = z.object({ organizationId: z.string().uuid() });

const InviteSchema = z.object({
  organizationId: z.string().uuid(),
  email: z.string().email().max(320),
  role: z.enum(["admin", "editor"]).default("editor"),
});

async function assertAdmin(
  supabase: any,
  userId: string,
  organizationId: string,
): Promise<void> {
  const { data: membership, error } = await supabase
    .from("organization_members")
    .select("role")
    .eq("organization_id", organizationId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error || !membership || !["owner", "admin"].includes(membership.role)) {
    throw new Error("Du har ikke tilgang til å administrere medlemmer.");
  }
}

async function findUserIdByEmail(
  admin: any,
  email: string,
): Promise<string | null> {
  const normalized = email.trim().toLowerCase();
  // Prefer invite/generateLink which returns user when they already exist.
  const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email: normalized,
  });
  if (!linkErr && linkData?.user?.id) return linkData.user.id as string;

  // Fallback: scan first pages (small orgs / dogfood).
  for (let page = 1; page <= 5; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) break;
    const hit = data.users.find(
      (u: { email?: string | null }) => (u.email ?? "").toLowerCase() === normalized,
    );
    if (hit?.id) return hit.id as string;
    if ((data.users?.length ?? 0) < 200) break;
  }
  return null;
}

export const listOrganizationMembers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => OrgIdSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    // Any member can list
    const { data: me, error: meErr } = await supabase
      .from("organization_members")
      .select("role")
      .eq("organization_id", data.organizationId)
      .eq("user_id", userId)
      .maybeSingle();
    if (meErr || !me) throw new Error("Ingen tilgang til denne organisasjonen.");

    const { data: rows, error } = await supabase
      .from("organization_members")
      .select("id, user_id, role, created_at")
      .eq("organization_id", data.organizationId)
      .order("created_at");
    if (error) throw new Error(error.message);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const withEmail = await Promise.all(
      (rows ?? []).map(async (m) => {
        const { data: userData } = await supabaseAdmin.auth.admin.getUserById(m.user_id);
        return {
          id: m.id as string,
          userId: m.user_id as string,
          role: m.role as string,
          createdAt: m.created_at as string,
          email: userData.user?.email ?? null,
        };
      }),
    );
    return { members: withEmail, canInvite: ["owner", "admin"].includes(me.role) };
  });

export const inviteOrganizationMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => InviteSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId, data.organizationId);

    const email = data.email.trim().toLowerCase();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const appUrl = (process.env.PUBLIC_APP_URL ?? "").replace(/\/$/, "");
    const redirectTo = appUrl ? `${appUrl}/auth` : undefined;

    let targetUserId: string | null = null;
    let invited = false;

    const { data: inviteData, error: inviteErr } =
      await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
        redirectTo,
        data: { invited_organization_id: data.organizationId },
      });

    if (!inviteErr && inviteData.user?.id) {
      targetUserId = inviteData.user.id;
      invited = true;
    } else {
      targetUserId = await findUserIdByEmail(supabaseAdmin, email);
      if (!targetUserId) {
        throw new Error(
          inviteErr?.message ??
            "Kunne ikke invitere brukeren. Sjekk at e-post er gyldig og at Auth har e-post aktivert.",
        );
      }
    }

    const { data: existing } = await supabaseAdmin
      .from("organization_members")
      .select("id")
      .eq("organization_id", data.organizationId)
      .eq("user_id", targetUserId)
      .maybeSingle();
    if (existing) {
      return { ok: true as const, invited: false, alreadyMember: true as const };
    }

    const { error: insertErr } = await supabaseAdmin.from("organization_members").insert({
      organization_id: data.organizationId,
      user_id: targetUserId,
      role: data.role,
    });
    if (insertErr) throw new Error(insertErr.message);

    return { ok: true as const, invited, alreadyMember: false as const };
  });
