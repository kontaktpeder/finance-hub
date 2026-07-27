import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { completeNexusSsoLogin } from "@/lib/identity.functions";

export const Route = createFileRoute("/auth/callback")({
  ssr: false,
  validateSearch: (search: Record<string, unknown>) => ({
    code: typeof search.code === "string" ? search.code : undefined,
  }),
  head: () => ({ meta: [{ title: "Fullfører innlogging – Finance Core" }] }),
  component: AuthCallbackPage,
});

function AuthCallbackPage() {
  const { code } = Route.useSearch();
  const navigate = useNavigate();
  const completeSso = useServerFn(completeNexusSsoLogin);
  const [message, setMessage] = useState("Fullfører innlogging…");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!code) {
        toast.error("Mangler SSO-kode");
        navigate({ to: "/auth", replace: true });
        return;
      }
      try {
        setMessage("Henter identitet fra Nexus…");
        const tokens = await completeSso({ data: { code } });
        if (cancelled) return;
        setMessage("Starter lokal sesjon…");
        const { error } = await supabase.auth.setSession({
          access_token: tokens.access_token,
          refresh_token: tokens.refresh_token,
        });
        if (error) throw error;
        if (cancelled) return;
        navigate({ to: "/", replace: true });
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "SSO feilet");
        navigate({ to: "/auth", replace: true });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [code, completeSso, navigate]);

  return (
    <main className="grid min-h-screen place-items-center bg-background px-4">
      <div className="flex flex-col items-center gap-3 text-sm text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin" />
        <p>{message}</p>
      </div>
    </main>
  );
}
