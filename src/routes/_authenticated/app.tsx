import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Plus, Building2, LogOut } from "lucide-react";

export const Route = createFileRoute("/_authenticated/app")({
  component: OrgList,
});

function OrgList() {
  const navigate = useNavigate();

  const { data: orgs, isLoading } = useQuery({
    queryKey: ["organizations"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("organizations")
        .select("id, name, kind, org_number, created_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  async function signOut() {
    await supabase.auth.signOut();
    navigate({ to: "/auth" });
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="mx-auto max-w-5xl px-4 sm:px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0">
            <div className="h-7 w-7 shrink-0 rounded-md bg-primary text-primary-foreground grid place-items-center font-semibold text-sm">F</div>
            <span className="font-semibold tracking-tight truncate">Finance Core</span>
          </div>
          <Button variant="ghost" size="sm" onClick={signOut}>
            <LogOut className="h-4 w-4 mr-2" /> <span className="hidden sm:inline">Logg ut</span>
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 sm:px-6 py-8 sm:py-12">
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3 mb-6 sm:mb-8">
          <div>
            <h1 className="text-xl sm:text-2xl font-semibold tracking-tight">Organisasjoner</h1>
            <p className="text-sm text-muted-foreground mt-1">Velg en organisasjon eller opprett en ny.</p>
          </div>
          <Button asChild className="shrink-0">
            <Link to="/orgs/new"><Plus className="h-4 w-4 mr-2" /> Ny organisasjon</Link>
          </Button>
        </div>

        {isLoading ? (
          <p className="text-sm text-muted-foreground">Laster…</p>
        ) : !orgs || orgs.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <Building2 className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
              <p className="text-sm text-muted-foreground mb-4">Du er ikke medlem av noen organisasjon ennå.</p>
              <Button asChild>
                <Link to="/orgs/new">Opprett din første organisasjon</Link>
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {orgs.map((o) => (
              <Link
                key={o.id}
                to="/orgs/$orgId"
                params={{ orgId: o.id }}
                className="block"
              >
                <Card className="hover:border-primary/50 transition-colors h-full">
                  <CardHeader>
                    <CardTitle className="text-base">{o.name}</CardTitle>
                    <CardDescription>
                      {o.kind.toUpperCase()}{o.org_number ? ` · ${o.org_number}` : ""}
                    </CardDescription>
                  </CardHeader>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
