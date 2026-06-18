import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { diagnoseBanksFn } from "@/lib/banking.functions";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Loader2, Search } from "lucide-react";

export const Route = createFileRoute("/_authenticated/orgs/$orgId/bank/diagnostics")({
  component: DiagnosticsPage,
});

function DiagnosticsPage() {
  const { orgId } = Route.useParams();
  const diagnose = useServerFn(diagnoseBanksFn);
  const [q, setQ] = useState("");

  const banksQ = useQuery({
    queryKey: ["bank-diagnostics", orgId],
    queryFn: () => diagnose({ data: { orgId } }),
  });

  const filtered = useMemo(() => {
    const list = banksQ.data?.banks ?? [];
    const needle = q.trim().toLowerCase();
    if (!needle) return list;
    return list.filter((b) =>
      [b.name, b.bic, b.id].some((v) => v && v.toLowerCase().includes(needle)),
    );
  }, [banksQ.data, q]);

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-4">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Bank-diagnostikk (NO)</h1>
        <p className="text-sm text-muted-foreground">
          Rå-respons frå <code>GET /ics/v3/banks?countryCode=NO</code>. Bruk for å sjekke om ein bank
          finst og kva eigenskapar den har.{" "}
          <Link to="/orgs/$orgId/bank" params={{ orgId }} className="underline">
            Tilbake til Bank
          </Link>
        </p>
      </header>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">
            {banksQ.data ? `${banksQ.data.count} bankar tilgjengelig` : "Bankar"}
          </CardTitle>
          <CardDescription>Søk på navn, BIC eller id.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="relative max-w-sm">
            <Search className="h-4 w-4 absolute left-2 top-2.5 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="t.d. Sparebanken, Sbanken, DNBANOKK…"
              className="pl-8"
            />
          </div>

          {banksQ.isLoading && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Hentar bankar frå Neonomics…
            </div>
          )}
          {banksQ.error && (
            <div className="text-sm text-destructive">{(banksQ.error as Error).message}</div>
          )}

          {banksQ.data && (
            <div className="border rounded-md divide-y">
              {filtered.map((b) => (
                <div key={`${b.id ?? b.bic}`} className="p-3 text-sm flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">{b.name ?? "(utan navn)"}</div>
                    <div className="text-xs text-muted-foreground font-mono break-all">
                      {b.bic ?? "—"} · {b.id ?? "—"}
                    </div>
                    {b.supportedServices && b.supportedServices.length > 0 && (
                      <div className="text-xs text-muted-foreground mt-1">
                        services: {b.supportedServices.join(", ")}
                      </div>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    {b.status && (
                      <Badge variant={b.status === "AVAILABLE" ? "default" : "outline"}>
                        {b.status}
                      </Badge>
                    )}
                    {b.personalIdentificationRequired && (
                      <Badge variant="secondary" className="text-[10px]">krev person-ID</Badge>
                    )}
                  </div>
                </div>
              ))}
              {filtered.length === 0 && (
                <div className="p-6 text-center text-sm text-muted-foreground">
                  Ingen bankar matcher søket.
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
