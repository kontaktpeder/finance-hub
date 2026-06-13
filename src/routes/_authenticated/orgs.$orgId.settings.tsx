import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertCircle, Info } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/orgs/$orgId/settings")({
  component: SettingsPage,
});

type OrgSettings = {
  name: string;
  org_number: string | null;
  address: string | null;
  postal_code: string | null;
  city: string | null;
  country: string | null;
  bank_account: string | null;
};

function SettingsPage() {
  const { orgId } = Route.useParams();
  const qc = useQueryClient();
  const { data: org } = useQuery({
    queryKey: ["org-settings", orgId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("organizations")
        .select("name, org_number, address, postal_code, city, country, bank_account")
        .eq("id", orgId)
        .single();
      if (error) throw error;
      return data as OrgSettings;
    },
  });

  const [form, setForm] = useState<OrgSettings>({
    name: "",
    org_number: "",
    address: "",
    postal_code: "",
    city: "",
    country: "Norge",
    bank_account: "",
  });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (org) {
      setForm({
        name: org.name ?? "",
        org_number: org.org_number ?? "",
        address: org.address ?? "",
        postal_code: org.postal_code ?? "",
        city: org.city ?? "",
        country: org.country ?? "Norge",
        bank_account: org.bank_account ?? "",
      });
    }
  }, [org]);

  const incomplete = !form.address || !form.bank_account;

  function set<K extends keyof OrgSettings>(k: K, v: OrgSettings[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const { error } = await supabase
        .from("organizations")
        .update({
          name: form.name,
          org_number: form.org_number || null,
          address: form.address || null,
          postal_code: form.postal_code || null,
          city: form.city || null,
          country: form.country || "Norge",
          bank_account: form.bank_account || null,
        })
        .eq("id", orgId);
      if (error) throw error;
      qc.invalidateQueries({ queryKey: ["org-settings", orgId] });
      qc.invalidateQueries({ queryKey: ["org", orgId] });
      toast.success("Lagret");
    } catch (err: any) {
      toast.error(err.message ?? "Kunne ikke lagre");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="p-8 max-w-2xl">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Fakturainnstillinger</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Selgerinformasjon som vises på fakturaer.
        </p>
      </header>

      <Alert className="mb-6">
        <Info className="h-4 w-4" />
        <AlertDescription>
          Endringer gjelder kun nye utkast og fakturaer som sendes fremover. Allerede sendte
          fakturaer beholder opplysningene de hadde ved utsendelse.
        </AlertDescription>
      </Alert>

      {incomplete && (
        <Alert variant="destructive" className="mb-6">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            Adresse og kontonummer må være utfylt før du kan sende fakturaer.
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Selger</CardTitle>
          <CardDescription>Vises som avsender på fakturaen</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={save} className="space-y-4">
            <div className="space-y-1.5">
              <Label>Foretaksnavn</Label>
              <Input value={form.name} onChange={(e) => set("name", e.target.value)} required />
            </div>
            <div className="space-y-1.5">
              <Label>Organisasjonsnummer</Label>
              <Input value={form.org_number ?? ""} onChange={(e) => set("org_number", e.target.value)} placeholder="123 456 789" />
            </div>
            <div className="space-y-1.5">
              <Label>Adresse</Label>
              <Input value={form.address ?? ""} onChange={(e) => set("address", e.target.value)} placeholder="Storgata 1" />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label>Postnr.</Label>
                <Input value={form.postal_code ?? ""} onChange={(e) => set("postal_code", e.target.value)} />
              </div>
              <div className="space-y-1.5 col-span-2">
                <Label>Poststed</Label>
                <Input value={form.city ?? ""} onChange={(e) => set("city", e.target.value)} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Land</Label>
              <Input value={form.country ?? ""} onChange={(e) => set("country", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Bankkontonummer</Label>
              <Input value={form.bank_account ?? ""} onChange={(e) => set("bank_account", e.target.value)} placeholder="1234.56.78901" />
            </div>
            <Button type="submit" disabled={busy}>
              {busy ? "Lagrer…" : "Lagre"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
