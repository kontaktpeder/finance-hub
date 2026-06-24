import { createFileRoute, Outlet, Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger, SheetTitle, SheetHeader } from "@/components/ui/sheet";
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
  Landmark,
  Menu,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/orgs/$orgId")({
  component: OrgLayout,
});

type NavItem = {
  to: "/orgs/$orgId/dashboard" | "/orgs/$orgId/entries" | "/orgs/$orgId/scan" | "/orgs/$orgId/invoices" | "/orgs/$orgId/bank" | "/orgs/$orgId/attachments" | "/orgs/$orgId/reports" | "/orgs/$orgId/settings" | "/orgs/$orgId/members" | "/orgs/$orgId/api-keys";
  label: string;
  icon: typeof LayoutDashboard;
  exact?: boolean;
  primary?: boolean;
};

const navItems: NavItem[] = [
  { to: "/orgs/$orgId/scan", label: "Skann", icon: ScanLine, primary: true },
  { to: "/orgs/$orgId/dashboard", label: "Dashbord", icon: LayoutDashboard, primary: true },
  { to: "/orgs/$orgId/entries", label: "Poster", icon: Receipt, primary: true },
  { to: "/orgs/$orgId/reports", label: "Rapporter", icon: FileText, primary: true },
  { to: "/orgs/$orgId/attachments", label: "Bilag", icon: Paperclip, primary: true },
  { to: "/orgs/$orgId/invoices", label: "Faktura", icon: FileSpreadsheet },
  { to: "/orgs/$orgId/bank", label: "Bank", icon: Landmark },
  { to: "/orgs/$orgId/settings", label: "Innstillinger", icon: Settings },
  { to: "/orgs/$orgId/members", label: "Medlemmer", icon: Users },
  { to: "/orgs/$orgId/api-keys", label: "API-nøkler", icon: KeyRound },
];


function OrgLayout() {
  const { orgId } = Route.useParams();
  const navigate = useNavigate();
  const [sheetOpen, setSheetOpen] = useState(false);
  const pathname = useRouterState({ select: (s) => s.location.pathname });

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
    staleTime: 5 * 60_000,
  });

  async function signOut() {
    await supabase.auth.signOut();
    navigate({ to: "/auth" });
  }

  const activeProps = { className: "bg-sidebar-accent text-sidebar-accent-foreground font-medium" };
  const baseLink =
    "flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors text-sidebar-foreground/80 hover:bg-sidebar-accent/50";

  // Order so Skann sits in the middle of the mobile bottom bar (FAB position)
  const bottomTabOrder = [
    "/orgs/$orgId/dashboard",
    "/orgs/$orgId/entries",
    "/orgs/$orgId/scan",
    "/orgs/$orgId/reports",
    "/orgs/$orgId/attachments",
  ];
  const primaryTabs = bottomTabOrder
    .map((to) => navItems.find((i) => i.to === to))
    .filter((t): t is NavItem => !!t);


  function NavList({ onNavigate }: { onNavigate?: () => void }) {
    return (
      <nav className="flex-1 p-2 space-y-0.5 overflow-y-auto">
        {navItems.map((item) => {
          const isScan = item.to === "/orgs/$orgId/scan";
          return (
            <Link
              key={item.to}
              to={item.to}
              params={{ orgId }}
              activeOptions={"exact" in item && item.exact ? { exact: true } : undefined}
              className={
                isScan
                  ? "flex items-center gap-2 rounded-md px-3 py-2.5 text-sm font-semibold bg-primary text-primary-foreground hover:bg-primary/90 transition-colors mb-1"
                  : baseLink
              }
              activeProps={isScan ? undefined : activeProps}
              onClick={onNavigate}
            >
              <item.icon className="h-4 w-4" /> {item.label}
            </Link>
          );
        })}
      </nav>
    );
  }


  return (
    <div className="min-h-screen bg-background md:grid md:grid-cols-[240px_1fr]">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex border-r bg-sidebar flex-col">
        <div className="p-4 border-b">
          <Link to="/app" className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground">
            <ChevronLeft className="h-3 w-3" /> Alle organisasjoner
          </Link>
          <div className="mt-3">
            <div className="font-semibold tracking-tight leading-tight truncate">{org?.name ?? "…"}</div>
            <div className="text-xs text-muted-foreground mt-0.5">{org?.kind.toUpperCase()}</div>
          </div>
        </div>
        <NavList />
        <div className="p-2 border-t">
          <Button variant="ghost" size="sm" className="w-full justify-start" onClick={signOut}>
            <LogOut className="h-4 w-4 mr-2" /> Logg ut
          </Button>
        </div>
      </aside>

      {/* Mobile top bar */}
      <header className="md:hidden sticky top-0 z-30 flex items-center gap-2 border-b bg-background/95 backdrop-blur px-3 h-14">
        <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" aria-label="Meny">
              <Menu className="h-5 w-5" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="p-0 w-72 flex flex-col">
            <SheetHeader className="p-4 border-b text-left">
              <Link
                to="/app"
                onClick={() => setSheetOpen(false)}
                className="flex items-center gap-2 text-xs text-muted-foreground"
              >
                <ChevronLeft className="h-3 w-3" /> Alle organisasjoner
              </Link>
              <SheetTitle className="text-base mt-2 truncate">{org?.name ?? "…"}</SheetTitle>
              <div className="text-xs text-muted-foreground">{org?.kind.toUpperCase()}</div>
            </SheetHeader>
            <NavList onNavigate={() => setSheetOpen(false)} />
            <div className="p-2 border-t">
              <Button variant="ghost" size="sm" className="w-full justify-start" onClick={signOut}>
                <LogOut className="h-4 w-4 mr-2" /> Logg ut
              </Button>
            </div>
          </SheetContent>
        </Sheet>
        <div className="min-w-0 flex-1">
          <div className="font-semibold tracking-tight truncate text-sm">{org?.name ?? "…"}</div>
          <div className="text-[10px] text-muted-foreground leading-none">{org?.kind.toUpperCase()}</div>
        </div>
      </header>

      <main className="overflow-auto pb-20 md:pb-0">
        <Outlet />
      </main>

      {/* Mobile bottom tab bar */}
      <nav
        className="md:hidden fixed bottom-0 inset-x-0 z-30 border-t bg-background/95 backdrop-blur grid grid-cols-5 h-16 items-stretch"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        {primaryTabs.map((tab) => {
          const targetPath = tab.to.replace("$orgId", orgId);
          const isActive =
            "exact" in tab && tab.exact ? pathname === targetPath : pathname.startsWith(targetPath);
          const isScan = tab.to === "/orgs/$orgId/scan";
          if (isScan) {
            return (
              <Link
                key={tab.to}
                to={tab.to}
                params={{ orgId }}
                className="flex items-center justify-center -mt-4"
                aria-label="Skann bilag"
              >
                <span
                  className={`grid place-items-center h-14 w-14 rounded-full shadow-lg ring-4 ring-background transition-colors ${
                    isActive ? "bg-primary text-primary-foreground" : "bg-primary text-primary-foreground hover:bg-primary/90"
                  }`}
                >
                  <tab.icon className="h-6 w-6" />
                </span>
              </Link>
            );
          }
          return (
            <Link
              key={tab.to}
              to={tab.to}
              params={{ orgId }}
              activeOptions={"exact" in tab && tab.exact ? { exact: true } : undefined}
              className={`flex flex-col items-center justify-center gap-0.5 text-[10px] font-medium transition-colors ${
                isActive ? "text-primary" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <tab.icon className="h-5 w-5" />
              {tab.label}
            </Link>
          );
        })}
      </nav>

    </div>
  );
}
