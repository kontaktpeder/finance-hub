import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/_authenticated/orgs/$orgId/members")({
  component: MembersPage,
});

function MembersPage() {
  const { orgId } = Route.useParams();
  const { data } = useQuery({
    queryKey: ["members", orgId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("organization_members")
        .select("id, user_id, role, created_at")
        .eq("organization_id", orgId)
        .order("created_at");
      if (error) throw error;
      return data;
    },
  });

  return (
    <div className="p-4 sm:p-6 md:p-8 max-w-3xl">
      <header className="mb-6">
        <h1 className="text-xl sm:text-2xl font-semibold tracking-tight">Medlemmer</h1>
        <p className="text-sm text-muted-foreground mt-1">Personer med tilgang til denne organisasjonen.</p>
      </header>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Aktive medlemmer</CardTitle>
          <CardDescription>Invitering via e-post kommer i neste runde — legg til medlemmer ved å gi dem user_id manuelt eller via API.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {data?.map((m) => (
              <div key={m.id} className="flex items-center justify-between border rounded-md px-3 py-2">
                <div className="tabular text-xs text-muted-foreground">{m.user_id}</div>
                <Badge variant={m.role === "owner" ? "default" : "secondary"}>{m.role}</Badge>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
