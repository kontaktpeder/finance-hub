import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  ScanFailedError,
  ScanValidationError,
  scanReceiptFile,
} from "@/lib/receipt-scan.server";

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
  await supabaseAdmin
    .from("api_clients")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", client.id);
  return {
    client: client as { id: string; organization_id: string; allowed_scopes: string[] },
  };
}

export const Route = createFileRoute("/api/public/v1/ai/scan-receipt")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = await authenticate(request);
        if ("error" in auth) return auth.error;
        if (!auth.client.allowed_scopes.includes("entries:write")) {
          return new Response("Forbidden", { status: 403 });
        }

        let form: FormData;
        try {
          form = await request.formData();
        } catch {
          return Response.json(
            { error: "invalid_request", message: "Expected multipart/form-data" },
            { status: 400 },
          );
        }

        const file = form.get("file");
        if (!(file instanceof File)) {
          return Response.json(
            { error: "invalid_request", message: "Missing 'file' field" },
            { status: 400 },
          );
        }

        try {
          const data = await scanReceiptFile(file);
          return Response.json({ data });
        } catch (err) {
          if (err instanceof ScanValidationError) {
            return Response.json(
              { error: "invalid_request", message: err.message },
              { status: 400 },
            );
          }
          if (err instanceof ScanFailedError) {
            return Response.json(
              { error: "scan_failed", message: err.message },
              { status: 500 },
            );
          }
          const message = err instanceof Error ? err.message : "Unexpected scan error";
          return Response.json({ error: "scan_failed", message }, { status: 500 });
        }
      },
    },
  },
});
