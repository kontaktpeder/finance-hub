import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { getNexusAppUrl, isSharedAuthEnabled } from "@/integrations/supabase/shared-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "sonner";

export const Route = createFileRoute("/auth/")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Logg inn – Finance Core" },
      { name: "description", content: "Logg inn i Finance Core" },
    ],
  }),
  component: AuthPage,
});

function GoogleIcon() {
  return (
    <svg className="mr-2 h-4 w-4" viewBox="0 0 24 24" aria-hidden>
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.99.66-2.26 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.1c-.22-.66-.35-1.36-.35-2.1s.13-1.44.35-2.1V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.83z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z"
      />
    </svg>
  );
}

function AuthPage() {
  const navigate = useNavigate();
  const shared = isSharedAuthEnabled();
  const nexusApp = getNexusAppUrl();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [showEmergency, setShowEmergency] = useState(!shared || !nexusApp);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/" });
    });
  }, [navigate]);

  function loginViaNexus() {
    if (!nexusApp) {
      toast.error("NEXUS_APP_URL er ikke satt");
      return;
    }
    window.location.assign(
      `${nexusApp}/auth?return_to=${encodeURIComponent(window.location.origin)}`,
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      if (!shared && mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: window.location.origin },
        });
        if (error) throw error;
        toast.success("Konto opprettet");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
      navigate({ to: "/" });
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Noe gikk galt");
    } finally {
      setBusy(false);
    }
  }

  async function handleGoogle() {
    setBusy(true);
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: window.location.origin,
    });
    if (result.error) {
      toast.error(
        result.error instanceof Error ? result.error.message : "Kunne ikke logge inn med Google",
      );
      setBusy(false);
      return;
    }
    if (result.redirected) return;
    navigate({ to: "/" });
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <Link to="/" className="inline-flex items-center gap-2">
            <div className="h-8 w-8 rounded-md bg-primary text-primary-foreground grid place-items-center font-semibold">
              F
            </div>
            <span className="text-xl font-semibold tracking-tight">Finance Core</span>
          </Link>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>Velkommen</CardTitle>
            <CardDescription>
              {shared
                ? "Logg inn via Platform Core (Nexus) for felles identitet."
                : "Logg inn eller opprett konto for å fortsette."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {shared && nexusApp ? (
              <>
                <Button type="button" className="w-full" onClick={loginViaNexus} disabled={busy}>
                  Logg inn via Nexus
                </Button>
                <button
                  type="button"
                  className="w-full text-xs text-muted-foreground hover:underline"
                  onClick={() => setShowEmergency((v) => !v)}
                >
                  {showEmergency ? "Skjul nødinnlogging" : "Nødinnlogging (e-post)"}
                </button>
              </>
            ) : null}

            {!shared ? (
              <>
                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  onClick={handleGoogle}
                  disabled={busy}
                >
                  <GoogleIcon />
                  Fortsett med Google
                </Button>
                <div className="my-2 flex items-center gap-3 text-xs text-muted-foreground">
                  <div className="h-px flex-1 bg-border" />
                  ELLER
                  <div className="h-px flex-1 bg-border" />
                </div>
                <Tabs value={mode} onValueChange={(v) => setMode(v as "signin" | "signup")}>
                  <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger value="signin">Logg inn</TabsTrigger>
                    <TabsTrigger value="signup">Opprett konto</TabsTrigger>
                  </TabsList>
                  <TabsContent value={mode}>
                    <form onSubmit={handleSubmit} className="space-y-4 pt-4">
                      <div className="space-y-2">
                        <Label htmlFor="email">E-post</Label>
                        <Input
                          id="email"
                          type="email"
                          autoComplete="email"
                          required
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="password">Passord</Label>
                        <Input
                          id="password"
                          type="password"
                          autoComplete={mode === "signup" ? "new-password" : "current-password"}
                          required
                          minLength={8}
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                        />
                      </div>
                      <Button type="submit" className="w-full" disabled={busy}>
                        {busy ? "Vent…" : mode === "signin" ? "Logg inn" : "Opprett konto"}
                      </Button>
                    </form>
                  </TabsContent>
                </Tabs>
              </>
            ) : showEmergency ? (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email-em">E-post</Label>
                  <Input
                    id="email-em"
                    type="email"
                    autoComplete="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password-em">Passord</Label>
                  <Input
                    id="password-em"
                    type="password"
                    autoComplete="current-password"
                    required
                    minLength={8}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </div>
                <Button type="submit" className="w-full" disabled={busy}>
                  {busy ? "Vent…" : "Logg inn"}
                </Button>
              </form>
            ) : null}
          </CardContent>
        </Card>
        <p className="mt-6 text-center text-xs text-muted-foreground">
          Finance Core · regnskap og bilag for flere organisasjoner
        </p>
      </div>
    </div>
  );
}
