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

function sanitizeFileName(name: string): string {
  const base = name.split(/[\\/]/).pop() || "file";
  return base.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 200);
}

export const Route = createFileRoute("/api/public/v1/attachments")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = await authenticate(request);
        if ("error" in auth) return auth.error;
        if (!auth.client.allowed_scopes.includes("attachments:write")) {
          return new Response("Forbidden", { status: 403 });
        }

        let form: FormData;
        try {
          form = await request.formData();
        } catch {
          return Response.json({ error: "Expected multipart/form-data" }, { status: 400 });
        }

        const file = form.get("file");
        if (!(file instanceof File)) {
          return Response.json({ error: "Missing 'file' field" }, { status: 400 });
        }
        if (file.size > 25 * 1024 * 1024) {
          return Response.json({ error: "File too large (max 25MB)" }, { status: 400 });
        }

        const entryIdRaw = form.get("entry_id");
        let entryId: string | null = null;
        if (typeof entryIdRaw === "string" && entryIdRaw.length > 0) {
          if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(entryIdRaw)) {
            return Response.json({ error: "Invalid entry_id" }, { status: 400 });
          }
          // Verify entry belongs to the same org
          const { data: entry } = await supabaseAdmin
            .from("finance_entries")
            .select("id, organization_id")
            .eq("id", entryIdRaw)
            .maybeSingle();
          if (!entry || entry.organization_id !== auth.client.organization_id) {
            return Response.json({ error: "Entry not found" }, { status: 404 });
          }
          entryId = entry.id;
        }

        const fileName = sanitizeFileName(file.name || "upload");
        const stamp = Date.now();
        const path = `${auth.client.organization_id}/${entryId ?? "unlinked"}/${stamp}-${fileName}`;
        const contentType = file.type || "application/octet-stream";

        const arrayBuf = await file.arrayBuffer();
        const { error: upErr } = await supabaseAdmin.storage
          .from("finance-attachments")
          .upload(path, arrayBuf, { contentType, upsert: false });
        if (upErr) return Response.json({ error: upErr.message }, { status: 500 });

        const { data: attachment, error: insErr } = await supabaseAdmin
          .from("finance_attachments")
          .insert({
            organization_id: auth.client.organization_id,
            entry_id: entryId,
            storage_path: path,
            file_name: fileName,
            mime_type: contentType,
            size_bytes: file.size,
          })
          .select("*")
          .single();
        if (insErr) {
          await supabaseAdmin.storage.from("finance-attachments").remove([path]);
          return Response.json({ error: insErr.message }, { status: 500 });
        }

        return Response.json({ data: attachment }, { status: 201 });
      },
    },
  },
});
