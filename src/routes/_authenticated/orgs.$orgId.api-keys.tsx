import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useServerFn } from "@tanstack/react-start";
import { createApiKey } from "@/lib/api-keys.functions";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { Plus, KeyRound, Copy } from "lucide-react";
import { PlatformLinkingCard } from "@/components/finance/PlatformLinkingCard";

export const Route = createFileRoute("/_authenticated/orgs/$orgId/api-keys")({
  component: ApiKeysPage,
});

const ALL_SCOPES = [
  "entries:read",
  "entries:write",
  "attachments:write",
  "reports:read",
  "invoices:read",
  "invoices:write",
  "platform:read",
  "platform:verify",
] as const;

const SCOPE_LABELS: Record<(typeof ALL_SCOPES)[number], string> = {
  "entries:read": "Les poster",
  "entries:write": "Skriv poster",
  "attachments:write": "Last opp bilag",
  "reports:read": "Les rapporter",
  "invoices:read": "Les fakturaer",
  "invoices:write": "Opprett/send fakturaer",
  "platform:read": "Platform — les org",
  "platform:verify": "Platform — verifiser kobling",
};

function ApiKeysPage() {
  const { orgId } = Route.useParams();
  const qc = useQueryClient();
  const createKey = useServerFn(createApiKey);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [scopes, setScopes] = useState<string[]>(["entries:read", "entries:write"]);
  const [secret, setSecret] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const { data: clients } = useQuery({
    queryKey: ["api-clients", orgId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("api_clients")
        .select("id, name, allowed_scopes, created_at, revoked_at, last_used_at, api_keys(key_prefix, revoked_at, created_at)")
        .eq("organization_id", orgId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await createKey({ data: { organizationId: orgId, name: name.trim(), scopes } });
      setSecret(res.token);
      setName("");
      qc.invalidateQueries({ queryKey: ["api-clients", orgId] });
    } catch (err: any) {
      toast.error(err.message ?? "Klarte ikke opprette");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="p-4 sm:p-6 md:p-8 max-w-3xl space-y-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">API-nøkler</h1>
          <p className="text-sm text-muted-foreground mt-1">Nøkler gir tilgang til kun denne organisasjonen.</p>
        </div>
        <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setSecret(null); }}>
          <DialogTrigger asChild>
            <Button><Plus className="h-4 w-4 mr-2" /> Ny nøkkel</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>{secret ? "Nøkkel opprettet" : "Ny API-nøkkel"}</DialogTitle></DialogHeader>
            {secret ? (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">Kopier nøkkelen nå. Den vises kun én gang.</p>
                <div className="rounded-md bg-muted p-3 tabular text-xs break-all">{secret}</div>
                <Button variant="outline" onClick={() => { navigator.clipboard.writeText(secret); toast.success("Kopiert"); }}>
                  <Copy className="h-4 w-4 mr-2" /> Kopier
                </Button>
              </div>
            ) : (
              <form onSubmit={submit} className="space-y-3">
                <div className="space-y-1.5">
                  <Label>Navn</Label>
                  <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="gold-of-sicily-backend" required />
                </div>
                <div className="space-y-2">
                  <Label>Scopes</Label>
                  {ALL_SCOPES.map((s) => (
                    <div key={s} className="flex items-center gap-2">
                      <Checkbox
                        id={s}
                        checked={scopes.includes(s)}
                        onCheckedChange={(c) => setScopes(c ? [...scopes, s] : scopes.filter((x) => x !== s))}
                      />
                      <label htmlFor={s} className="text-sm">{SCOPE_LABELS[s]} <span className="text-muted-foreground tabular text-xs">({s})</span></label>
                    </div>
                  ))}
                </div>
                <DialogFooter>
                  <Button type="submit" disabled={busy || !name.trim() || scopes.length === 0}>
                    {busy ? "Oppretter…" : "Opprett nøkkel"}
                  </Button>
                </DialogFooter>
              </form>
            )}
          </DialogContent>
        </Dialog>
      </header>

      <PlatformLinkingCard orgId={orgId} />

      <div className="space-y-3">
        {clients?.length === 0 && (
          <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">
            <KeyRound className="h-8 w-8 mx-auto mb-2 opacity-40" />
            Ingen API-nøkler ennå.
          </CardContent></Card>
        )}
        {clients?.map((c) => (
          <Card key={c.id}>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                {c.name}
                {c.revoked_at && <Badge variant="destructive">Tilbakekalt</Badge>}
              </CardTitle>
              <CardDescription className="tabular text-xs">
                {c.api_keys?.map((k: any) => `${k.key_prefix}…`).join(", ") || "(ingen aktiv nøkkel)"}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-1">
              {c.allowed_scopes.map((s: string) => <Badge key={s} variant="secondary" className="tabular text-xs">{s}</Badge>)}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
