import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const InputSchema = z.object({
  organizationId: z.string().uuid(),
  name: z.string().min(1).max(100),
  scopes: z.array(z.enum([
    "entries:read",
    "entries:write",
    "attachments:write",
    "reports:read",
    "invoices:read",
    "invoices:write",
  ])).min(1),
});

function randomToken(bytes = 24): string {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  // base64url
  let s = "";
  for (const b of buf) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export const createApiKey = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => InputSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Verify user is admin/owner of org via RLS-respecting client
    const { data: membership, error: mErr } = await supabase
      .from("organization_members")
      .select("role")
      .eq("organization_id", data.organizationId)
      .eq("user_id", userId)
      .maybeSingle();
    if (mErr || !membership || !["owner", "admin"].includes(membership.role)) {
      throw new Error("Du har ikke tilgang til å opprette API-nøkler for denne organisasjonen.");
    }

    const { data: client, error: cErr } = await supabaseAdmin
      .from("api_clients")
      .insert({
        organization_id: data.organizationId,
        name: data.name,
        allowed_scopes: data.scopes,
        created_by: userId,
      })
      .select("id")
      .single();
    if (cErr) throw new Error(cErr.message);

    const secret = randomToken(24);
    const prefix = secret.slice(0, 8);
    const token = `fc_live_${prefix}_${secret.slice(8)}`;
    const hash = await sha256Hex(token);

    const { error: kErr } = await supabaseAdmin.from("api_keys").insert({
      api_client_id: client.id,
      key_prefix: prefix,
      key_hash: hash,
    });
    if (kErr) throw new Error(kErr.message);

    return { token, prefix };
  });
