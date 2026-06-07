import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function authenticate(request: Request) {
  const token = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return { error: new Response("Unauthorized", { status: 401 }) };
  const hash = await sha256Hex(token);
  const { data: key, error } = await supabaseAdmin
    .from("api_keys")
    .select("id, revoked_at, api_clients(id, organization_id, allowed_scopes, revoked_at)")
    .eq("key_hash", hash)
    .maybeSingle();
  const client = key?.api_clients as any;
  if (error || !key || key.revoked_at || !client || client.revoked_at) {
    return { error: new Response("Invalid API key", { status: 401 }) };
  }
  await supabaseAdmin.from("api_clients").update({ last_used_at: new Date().toISOString() }).eq("id", client.id);
  return { client: client as { id: string; organization_id: string; allowed_scopes: string[] } };
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const Route = createFileRoute("/api/public/v1/entries/$entryId")({
  server: {
    handlers: {
      DELETE: async ({ request, params }) => {
        const auth = await authenticate(request);
        if ("error" in auth) return auth.error;
        if (!auth.client.allowed_scopes.includes("entries:write")) {
          return new Response("Forbidden", { status: 403 });
        }

        const entryId = params.entryId;
        if (!UUID_RE.test(entryId)) {
          return Response.json({ error: "Invalid entry_id" }, { status: 400 });
        }

        const { data: entry } = await supabaseAdmin
          .from("finance_entries")
          .select("id, organization_id")
          .eq("id", entryId)
          .maybeSingle();
        if (!entry || entry.organization_id !== auth.client.organization_id) {
          return Response.json({ error: "Entry not found" }, { status: 404 });
        }

        // First: delete all linked attachments (storage + DB)
        const { data: attachments } = await supabaseAdmin
          .from("finance_attachments")
          .select("id, storage_path")
          .eq("entry_id", entryId)
          .eq("organization_id", auth.client.organization_id);

        const paths = (attachments ?? []).map((a) => a.storage_path).filter(Boolean);
        if (paths.length > 0) {
          await supabaseAdmin.storage.from("finance-attachments").remove(paths);
        }
        const attachmentIds = (attachments ?? []).map((a) => a.id);
        if (attachmentIds.length > 0) {
          await supabaseAdmin.from("finance_attachments").delete().in("id", attachmentIds);
        }

        // Then: delete the entry
        const { error: delErr } = await supabaseAdmin
          .from("finance_entries")
          .delete()
          .eq("id", entryId)
          .eq("organization_id", auth.client.organization_id);
        if (delErr) return Response.json({ error: delErr.message }, { status: 500 });

        return Response.json({
          data: { deleted: true, id: entryId, attachments_deleted: attachmentIds.length },
        });
      },
    },
  },
});
