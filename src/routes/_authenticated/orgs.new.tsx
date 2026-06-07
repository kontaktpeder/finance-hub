import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/orgs/new")({
  component: NewOrg,
});

function NewOrg() {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [kind, setKind] = useState("enk");
  const [orgNumber, setOrgNumber] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      // Ensure we have a fresh session (JWT) before insert; refresh if needed.
      let { data: sess } = await supabase.auth.getSession();
      if (!sess.session) {
        const { data: refreshed } = await supabase.auth.refreshSession();
        sess = { session: refreshed.session } as typeof sess;
      }
      if (!sess.session?.user) {
        navigate({ to: "/auth" });
        throw new Error("Sesjonen har utløpt – logg inn på nytt");
      }
      const userId = sess.session.user.id;
      const { data: org, error } = await supabase
        .from("organizations")
        .insert({
          name: name.trim(),
          kind,
          org_number: orgNumber.trim() || null,
          created_by: userId,
        })
        .select("id")
        .single();
      if (error) throw error;

      // Create default book
      const year = new Date().getFullYear();
      await supabase.from("finance_books").insert({
        organization_id: org.id,
        name: `Regnskap ${year}`,
        fiscal_year: year,
        is_default: true,
      });

      toast.success("Organisasjon opprettet");
      navigate({ to: "/orgs/$orgId", params: { orgId: org.id } });
    } catch (err: any) {
      toast.error(err.message ?? "Klarte ikke opprette");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="mx-auto max-w-2xl px-6 py-4">
          <Button variant="ghost" size="sm" asChild>
            <Link to="/app"><ArrowLeft className="h-4 w-4 mr-2" /> Tilbake</Link>
          </Button>
        </div>
      </header>
      <main className="mx-auto max-w-2xl px-6 py-12">
        <Card>
          <CardHeader>
            <CardTitle>Ny organisasjon</CardTitle>
            <CardDescription>Opprett en ny enhet i Finance Core. Du blir automatisk eier.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={submit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Navn</Label>
                <Input id="name" required value={name} onChange={(e) => setName(e.target.value)} placeholder="Peder August Halvorsen ENK" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="kind">Type</Label>
                <Select value={kind} onValueChange={setKind}>
                  <SelectTrigger id="kind"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="enk">ENK</SelectItem>
                    <SelectItem value="as">AS</SelectItem>
                    <SelectItem value="other">Annet</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="orgnr">Organisasjonsnummer (valgfritt)</Label>
                <Input id="orgnr" value={orgNumber} onChange={(e) => setOrgNumber(e.target.value)} placeholder="123 456 789" />
              </div>
              <Button type="submit" disabled={busy || !name.trim()}>{busy ? "Oppretter…" : "Opprett"}</Button>
            </form>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
