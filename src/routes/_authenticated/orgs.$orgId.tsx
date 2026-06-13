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
  ScanLine,
  Paperclip,
  FileSpreadsheet,
  Settings,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/orgs/$orgId")({
  component: OrgLayout,
});

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

  const activeProps = {
    className: "bg-sidebar-accent text-sidebar-accent-foreground font-medium",
  };
  const baseLink =
    "flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors text-sidebar-foreground/80 hover:bg-sidebar-accent/50";

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
          <Link to="/orgs/$orgId" params={{ orgId }} activeOptions={{ exact: true }} className={baseLink} activeProps={activeProps}>
            <LayoutDashboard className="h-4 w-4" /> Dashbord
          </Link>
          <Link to="/orgs/$orgId/entries" params={{ orgId }} className={baseLink} activeProps={activeProps}>
            <Receipt className="h-4 w-4" /> Poster
          </Link>
          <Link to="/orgs/$orgId/scan" params={{ orgId }} className={baseLink} activeProps={activeProps}>
            <ScanLine className="h-4 w-4" /> AI-skanning
          </Link>
          <Link to="/orgs/$orgId/attachments" params={{ orgId }} className={baseLink} activeProps={activeProps}>
            <Paperclip className="h-4 w-4" /> Bilag
          </Link>
          <Link to="/orgs/$orgId/invoices" params={{ orgId }} className={baseLink} activeProps={activeProps}>
            <FileSpreadsheet className="h-4 w-4" /> Fakturaer
          </Link>
          <Link to="/orgs/$orgId/reports" params={{ orgId }} className={baseLink} activeProps={activeProps}>
            <FileText className="h-4 w-4" /> Rapporter
          </Link>
          <Link to="/orgs/$orgId/settings" params={{ orgId }} className={baseLink} activeProps={activeProps}>
            <Settings className="h-4 w-4" /> Innstillinger
          </Link>
          <Link to="/orgs/$orgId/members" params={{ orgId }} className={baseLink} activeProps={activeProps}>
            <Users className="h-4 w-4" /> Medlemmer
          </Link>
          <Link to="/orgs/$orgId/api-keys" params={{ orgId }} className={baseLink} activeProps={activeProps}>
            <KeyRound className="h-4 w-4" /> API-nøkler
          </Link>
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
