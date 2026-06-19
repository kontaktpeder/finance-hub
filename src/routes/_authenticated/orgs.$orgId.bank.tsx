import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getBankStatusFn,
  listBanksFn,
  startBankConnectFn,
  syncBankFn,
  listBankTransactionsFn,
  deleteBankConnectionFn,
} from "@/lib/banking.functions";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Landmark, RefreshCw, Loader2, ArrowDownRight, ArrowUpRight, AlertTriangle, Trash2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/orgs/$orgId/bank")({
  component: BankPage,
});

type BankConnection = {
  id: string;
  bank_id: string | null;
  bank_name: string | null;
  status: string;
  consent_expires_at: string | null;
  last_sync_at: string | null;
  last_sync_error: string | null;
};

function fmtAmount(n: number, ccy = "NOK") {
  return new Intl.NumberFormat("nb-NO", { style: "currency", currency: ccy }).format(n);
}

function statusBadge(s: string) {
  const map: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
    pending: { label: "Venter på consent", variant: "secondary" },
    active: { label: "Tilkobla", variant: "default" },
    expired: { label: "Consent utløpt", variant: "destructive" },
    error: { label: "Sync-feil", variant: "destructive" },
    revoked: { label: "Tilbakekalla", variant: "outline" },
  };
  const m = map[s] ?? { label: s, variant: "outline" as const };
  return <Badge variant={m.variant}>{m.label}</Badge>;
}

function BankPage() {
  const { orgId } = Route.useParams();
  const qc = useQueryClient();
  const getStatus = useServerFn(getBankStatusFn);
  const listBanks = useServerFn(listBanksFn);
  const startConnect = useServerFn(startBankConnectFn);
  const sync = useServerFn(syncBankFn);
  const listTx = useServerFn(listBankTransactionsFn);
  const deleteConn = useServerFn(deleteBankConnectionFn);

  const status = useQuery({
    queryKey: ["bank-status", orgId],
    queryFn: () => getStatus({ data: { orgId } }),
  });

  const txQ = useQuery({
    queryKey: ["bank-tx", orgId],
    queryFn: () => listTx({ data: { orgId, days: 90 } }),
    enabled: Boolean(status.data?.connections?.some((c: BankConnection) => c.status === "active")),
  });

  const [showPicker, setShowPicker] = useState(false);
  const banksQ = useQuery({
    queryKey: ["bank-list", orgId],
    queryFn: () => listBanks({ data: { orgId } }),
    enabled: showPicker && Boolean(status.data?.configured),
  });

  const [psuId, setPsuId] = useState("");

  const connectMut = useMutation({
    mutationFn: (bankId: string) =>
      startConnect({ data: { orgId, bankId, psuId: psuId.trim() || undefined } }),
    onSuccess: (r) => {
      if (r.consentUrl) {
        window.location.href = r.consentUrl;
      } else {
        toast.success("Allereie tilkobla — synkar…");
        qc.invalidateQueries({ queryKey: ["bank-status", orgId] });
      }
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const syncMut = useMutation({
    mutationFn: () => sync({ data: { orgId } }),
    onSuccess: (r) => {
      toast.success(`Synka ${r.count} tilkobling(ar): ${r.transactions} transaksjon(ar).`);
      qc.invalidateQueries({ queryKey: ["bank-status", orgId] });
      qc.invalidateQueries({ queryKey: ["bank-tx", orgId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "income" | "expense">("all");

  const filteredTx = useMemo(() => {
    const list = txQ.data?.transactions ?? [];
    return list.filter((t) => {
      if (filter === "income" && !t.is_income) return false;
      if (filter === "expense" && t.is_income) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        return (
          (t.description ?? "").toLowerCase().includes(q) ||
          (t.counterparty ?? "").toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [txQ.data, search, filter]);

  const accountsById = useMemo(() => {
    const m = new Map<string, { name: string; number: string | null; currency: string; balance?: number | null }>();
    for (const a of txQ.data?.accounts ?? []) {
      const meta = (a.raw_metadata ?? {}) as Record<string, unknown>;
      const balRaw =
        (meta.balances as { amount?: { value?: number } }[] | undefined)?.[0]?.amount?.value ??
        (meta.balance as number | undefined);
      m.set(a.id, {
        name: a.account_name ?? a.account_number ?? "Konto",
        number: a.account_number,
        currency: a.currency,
        balance: typeof balRaw === "number" ? balRaw : null,
      });
    }
    return m;
  }, [txQ.data]);

  if (status.isLoading) {
    return (
      <div className="p-8 flex items-center gap-3 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Lastar bank-status…
      </div>
    );
  }

  if (!status.data?.configured) {
    return (
      <div className="p-4 md:p-6 max-w-3xl mx-auto space-y-4">
        <header className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            <Landmark className="h-6 w-6" /> Bank
          </h1>
        </header>
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" /> Neonomics ikkje konfigurert
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm space-y-2">
            <p>Sett <code>NEONOMICS_CLIENT_ID</code> og <code>NEONOMICS_CLIENT_SECRET</code> som secrets, så er bank-integrasjonen klar.</p>
            <p className="text-muted-foreground">Standard base-URL er sandbox. Override med <code>NEONOMICS_BASE_URL</code>.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const connections = (status.data?.connections ?? []) as BankConnection[];
  const hasActive = connections.some((c) => c.status === "active");

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-4">
      <header className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            <Landmark className="h-6 w-6" /> Bank
          </h1>
          <p className="text-sm text-muted-foreground">
            Importerte transaksjonar er ikkje bokført. Du vel sjølv kva som blir regnskapspost.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {hasActive && (
            <Button variant="outline" size="sm" onClick={() => syncMut.mutate()} disabled={syncMut.isPending}>
              {syncMut.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <RefreshCw className="h-4 w-4 mr-2" />}
              Synk no
            </Button>
          )}
          <Button size="sm" onClick={() => setShowPicker((v) => !v)}>
            {showPicker ? "Lukk bankvalg" : "Kople til bank"}
          </Button>
          <Button asChild variant="ghost" size="sm">
            <Link to="/orgs/$orgId/bank/diagnostics" params={{ orgId }}>
              Diagnostikk
            </Link>
          </Button>
        </div>
      </header>

      {connections.length === 0 && !showPicker && (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            Ingen bank-tilkoblingar enno. Klikk «Kople til bank» for å starte.
          </CardContent>
        </Card>
      )}

      {connections.length > 0 && (
        <div className="grid sm:grid-cols-2 gap-3">
          {connections.map((c) => (
            <Card key={c.id}>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center justify-between">
                  <span>{c.bank_name ?? c.bank_id ?? "Bank"}</span>
                  {statusBadge(c.status)}
                </CardTitle>
                <CardDescription className="text-xs">
                  {c.last_sync_at ? `Sist synka ${new Date(c.last_sync_at).toLocaleString("nb-NO")}` : "Aldri synka"}
                </CardDescription>
              </CardHeader>
              {c.last_sync_error && (
                <CardContent className="text-xs text-destructive pt-0">{c.last_sync_error}</CardContent>
              )}
            </Card>
          ))}
        </div>
      )}

      {showPicker && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Velg bank (Norge)</CardTitle>
            <CardDescription className="text-xs">
              Sandbox: bruk t.d. Sbanken med PSU-id <code>13039319955</code> for å teste end-to-end.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="mb-3">
              <label className="text-xs text-muted-foreground">PSU-id (fødselsnummer, valfri for sandbox-bankar utan personidentifikasjon)</label>
              <Input
                value={psuId}
                onChange={(e) => setPsuId(e.target.value)}
                placeholder="13039319955"
                className="sm:max-w-xs"
                inputMode="numeric"
              />
            </div>
            {banksQ.isLoading && (
              <div className="text-sm text-muted-foreground flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" /> Henter bankar…
              </div>
            )}
            {banksQ.error && (
              <div className="text-sm text-destructive">{(banksQ.error as Error).message}</div>
            )}
            {banksQ.data && (
              <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-2 max-h-96 overflow-auto">
                {[...banksQ.data.banks]
                  .sort((a, b) => {
                    const ap = a.requiresPsuId ? 1 : 0;
                    const bp = b.requiresPsuId ? 1 : 0;
                    if (ap !== bp) return ap - bp;
                    return a.name.localeCompare(b.name, "nb");
                  })
                  .map((b) => (
                    <Button
                      key={b.bankId}
                      variant="outline"
                      className="justify-between h-auto py-2"
                      onClick={() => connectMut.mutate(b.bankId)}
                      disabled={connectMut.isPending || (b.requiresPsuId && !psuId.trim())}
                      title={b.requiresPsuId && !psuId.trim() ? "Skriv inn PSU-id over for å bruke denne banken" : undefined}
                    >
                      <span className="text-sm truncate">{b.name}</span>
                      {b.requiresPsuId && (
                        <Badge variant="outline" className="ml-2 text-[10px]">
                          krev person-ID
                        </Badge>
                      )}
                    </Button>
                  ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {hasActive && (
        <>
          {(txQ.data?.accounts?.length ?? 0) > 0 && (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {txQ.data!.accounts.map((a) => {
                const info = accountsById.get(a.id)!;
                return (
                  <Card key={a.id}>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm">{info.name}</CardTitle>
                      <CardDescription className="text-xs">{info.number ?? ""}</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="text-lg font-semibold">
                        {info.balance != null ? fmtAmount(info.balance, info.currency) : "—"}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Transaksjonar (siste 90 dagar)</CardTitle>
              <CardDescription>
                Ikkje bokført. «Bokfør»-handling kjem i Sprint 2.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col sm:flex-row gap-2 mb-3">
                <Input
                  placeholder="Søk beskrivelse eller motpart…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="sm:max-w-xs"
                />
                <Select value={filter} onValueChange={(v) => setFilter(v as typeof filter)}>
                  <SelectTrigger className="sm:max-w-[160px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Alle</SelectItem>
                    <SelectItem value="income">Inntekt</SelectItem>
                    <SelectItem value="expense">Utgift</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {txQ.isLoading && (
                <div className="text-sm text-muted-foreground flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" /> Lastar transaksjonar…
                </div>
              )}

              {!txQ.isLoading && filteredTx.length === 0 && (
                <div className="text-sm text-muted-foreground py-6 text-center">
                  Ingen transaksjonar matchar filteret.
                </div>
              )}

              <div className="divide-y">
                {filteredTx.map((t) => (
                  <div key={t.id} className="flex items-center gap-3 py-2 text-sm">
                    <div className="w-20 text-xs text-muted-foreground">
                      {new Date(t.transaction_date).toLocaleDateString("nb-NO")}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="truncate">{t.description ?? "—"}</div>
                      {t.counterparty && (
                        <div className="text-xs text-muted-foreground truncate">{t.counterparty}</div>
                      )}
                    </div>
                    <div className={`flex items-center gap-1 tabular-nums ${t.is_income ? "text-emerald-600" : "text-foreground"}`}>
                      {t.is_income ? <ArrowDownRight className="h-3.5 w-3.5" /> : <ArrowUpRight className="h-3.5 w-3.5" />}
                      {fmtAmount(Number(t.amount), t.currency)}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
