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
  const { data: key } = await supabaseAdmin
    .from("api_keys")
    .select("id, revoked_at, api_clients(id, organization_id, allowed_scopes, revoked_at)")
    .eq("key_hash", hash)
    .maybeSingle();
  const client = key?.api_clients as any;
  if (!key || key.revoked_at || !client || client.revoked_at) {
    return { error: new Response("Invalid API key", { status: 401 }) };
  }
  await supabaseAdmin.from("api_clients").update({ last_used_at: new Date().toISOString() }).eq("id", client.id);
  return { client: client as { id: string; organization_id: string; allowed_scopes: string[] } };
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const Route = createFileRoute("/api/public/v1/entries/$entryId/attachments")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const auth = await authenticate(request);
        if ("error" in auth) return auth.error;
        if (!auth.client.allowed_scopes.includes("entries:read")) {
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

        const { data: rows, error } = await supabaseAdmin
          .from("finance_attachments")
          .select("id, file_name, mime_type, size_bytes, storage_path, uploaded_at, entry_id")
          .eq("organization_id", auth.client.organization_id)
          .eq("entry_id", entryId)
          .order("uploaded_at", { ascending: false });
        if (error) return Response.json({ error: error.message }, { status: 500 });

        const out = await Promise.all(
          (rows ?? []).map(async (a) => {
            const { data: signed } = await supabaseAdmin.storage
              .from("finance-attachments")
              .createSignedUrl(a.storage_path, 600);
            return {
              id: a.id,
              entry_id: a.entry_id,
              file_name: a.file_name,
              filename: a.file_name,
              mime_type: a.mime_type,
              size_bytes: a.size_bytes,
              size: a.size_bytes,
              url: signed?.signedUrl ?? null,
              created_at: a.uploaded_at,
              uploaded_at: a.uploaded_at,
            };
          }),
        );

        return Response.json({ data: out });
      },
    },
  },
});
