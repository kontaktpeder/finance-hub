import { createFileRoute, Outlet, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  LayoutDashboard,
  Receipt,
  FileText,
  Users,
  KeyRound,
  ChevronLeft,
  LogOut,
} from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/orgs/$orgId")({
  component: OrgLayout,
});

const nav = [
  { to: "/orgs/$orgId", label: "Dashbord", icon: LayoutDashboard, exact: true },
  { to: "/orgs/$orgId/entries", label: "Poster", icon: Receipt },
  { to: "/orgs/$orgId/reports", label: "Rapporter", icon: FileText },
  { to: "/orgs/$orgId/members", label: "Medlemmer", icon: Users },
  { to: "/orgs/$orgId/api-keys", label: "API-nøkler", icon: KeyRound },
] as const;

function OrgLayout() {
  const { orgId } = Route.useParams();
  const navigate = useNavigate();

  const { data: org } = useQuery({
    queryKey: ["org", orgId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("organizations")
        .select("id, name, kind, org_number")
        .eq("id", orgId)
        .single();
      if (error) throw error;
      return data;
    },
  });

  async function signOut() {
    await supabase.auth.signOut();
    navigate({ to: "/auth" });
  }

  return (
    <div className="min-h-screen bg-background grid md:grid-cols-[240px_1fr]">
      <aside className="border-r bg-sidebar flex flex-col">
        <div className="p-4 border-b">
          <Link to="/app" className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground">
            <ChevronLeft className="h-3 w-3" /> Alle organisasjoner
          </Link>
          <div className="mt-3">
            <div className="font-semibold tracking-tight leading-tight">{org?.name ?? "…"}</div>
            <div className="text-xs text-muted-foreground mt-0.5">{org?.kind.toUpperCase()}</div>
          </div>
        </div>
        <nav className="flex-1 p-2 space-y-0.5">
          {nav.map((n) => (
            <Link
              key={n.to}
              to={n.to}
              params={{ orgId }}
              activeOptions={{ exact: n.exact }}
              className={({ isActive }: { isActive: boolean }) =>
                cn(
                  "flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors",
                  isActive
                    ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                    : "text-sidebar-foreground/80 hover:bg-sidebar-accent/50",
                )
              }
            >
              {(props: { isActive: boolean }) => (
                <>
                  <n.icon className="h-4 w-4" />
                  {n.label}
                </>
              )}
            </Link>
          ))}
        </nav>
        <div className="p-2 border-t">
          <Button variant="ghost" size="sm" className="w-full justify-start" onClick={signOut}>
            <LogOut className="h-4 w-4 mr-2" /> Logg ut
          </Button>
        </div>
      </aside>
      <main className="overflow-auto">
        <Outlet />
      </main>
    </div>
  );
}
