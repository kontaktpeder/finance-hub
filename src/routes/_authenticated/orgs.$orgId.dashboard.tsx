import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatNOK } from "@/lib/format";
import { getFinanceConfidenceFn } from "@/lib/confidence.functions";
import { TrendingUp, TrendingDown, Wallet, AlertCircle, CalendarDays, FileWarning, Receipt, ShieldCheck, ShieldAlert } from "lucide-react";

export const Route = createFileRoute("/_authenticated/orgs/$orgId/dashboard")({
  component: Dashboard,
});

function Dashboard() {
  const { orgId } = Route.useParams();
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;

  const { data } = useQuery({
    queryKey: ["dashboard", orgId, year, month],
    queryFn: async () => {
      const start = `${year}-01-01`;
      const end = `${year + 1}-01-01`;
      const mStart = `${year}-${String(month).padStart(2, "0")}-01`;
      const nextMonth = month === 12 ? `${year + 1}-01-01` : `${year}-${String(month + 1).padStart(2, "0")}-01`;

      const { data: entries, error } = await supabase
        .from("finance_entries")
        .select("id, entry_type, amount_gross, payment_status, entry_date")
        .eq("organization_id", orgId)
        .gte("entry_date", start)
        .lt("entry_date", end);
      if (error) throw error;

      let income = 0, expense = 0, unpaid = 0;
      let mIncome = 0, mExpense = 0, mCount = 0;
      const expenseIds: string[] = [];
      for (const e of entries ?? []) {
        const amt = Number(e.amount_gross);
        if (e.entry_type === "income") income += amt;
        else { expense += amt; expenseIds.push(e.id); }
        if (e.payment_status === "unpaid") unpaid += amt;
        if (e.entry_date >= mStart && e.entry_date < nextMonth) {
          mCount += 1;
          if (e.entry_type === "income") mIncome += amt;
          else mExpense += amt;
        }
      }

      let missing = 0;
      if (expenseIds.length) {
        const { data: atts } = await supabase
          .from("finance_attachments")
          .select("entry_id")
          .eq("organization_id", orgId)
          .in("entry_id", expenseIds);
        const withAtt = new Set((atts ?? []).map((a) => a.entry_id));
        missing = expenseIds.filter((id) => !withAtt.has(id)).length;
      }

      return {
        income,
        expense,
        result: income - expense,
        unpaid,
        missing,
        count: entries?.length ?? 0,
        mResult: mIncome - mExpense,
        mCount,
      };
    },
  });

  const stats = [
    { label: "Inntekter", value: data?.income ?? 0, Icon: TrendingUp, color: "text-success" },
    { label: "Utgifter", value: data?.expense ?? 0, Icon: TrendingDown, color: "text-destructive" },
    { label: "Resultat", value: data?.result ?? 0, Icon: Wallet, color: "text-primary" },
    { label: "Ubetalt", value: data?.unpaid ?? 0, Icon: AlertCircle, color: "text-warning" },
  ];

  return (
    <div className="p-4 sm:p-6 md:p-8 max-w-6xl">
      <header className="mb-6 md:mb-8">
        <h1 className="text-xl sm:text-2xl font-semibold tracking-tight">Dashbord {year}</h1>
        <p className="text-sm text-muted-foreground mt-1">{data?.count ?? 0} poster i år</p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-8">
        {stats.map((s) => (
          <Card key={s.label}>
            <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
              <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{s.label}</CardTitle>
              <s.Icon className={`h-4 w-4 ${s.color}`} />
            </CardHeader>
            <CardContent>
              <div className="tabular text-2xl font-semibold">{formatNOK(s.value)}</div>
              <div className="text-xs text-muted-foreground mt-1">NOK</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <h2 className="text-sm uppercase tracking-wider text-muted-foreground mb-3">Denne måneden</h2>
      <div className="grid gap-4 sm:grid-cols-3 mb-8">
        <Card>
          <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Månedens resultat
            </CardTitle>
            <CalendarDays className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="tabular text-2xl font-semibold">{formatNOK(data?.mResult ?? 0)}</div>
            <div className="text-xs text-muted-foreground mt-1">NOK</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Poster denne måneden
            </CardTitle>
            <Receipt className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="tabular text-2xl font-semibold">{data?.mCount ?? 0}</div>
            <div className="text-xs text-muted-foreground mt-1">stk</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Mangler bilag
            </CardTitle>
            <FileWarning className="h-4 w-4 text-warning" />
          </CardHeader>
          <CardContent>
            <div className="tabular text-2xl font-semibold">{data?.missing ?? 0}</div>
            <div className="text-xs text-muted-foreground mt-1">utgiftsposter</div>
          </CardContent>
        </Card>
      </div>

      <FinanceConfidenceSection orgId={orgId} />
    </div>
  );
}

function severityBadgeVariant(sev: "info" | "warning" | "critical") {
  if (sev === "critical") return "destructive" as const;
  if (sev === "warning") return "secondary" as const;
  return "outline" as const;
}

function severityLabel(sev: "info" | "warning" | "critical") {
  if (sev === "critical") return "Kritisk";
  if (sev === "warning") return "Bør sjekkes";
  return "Info";
}

function FinanceConfidenceSection({ orgId }: { orgId: string }) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["finance-confidence", orgId],
    queryFn: () => getFinanceConfidenceFn({ data: { orgId } }),
  });

  const status = data?.status ?? "ok";
  const isOk = status === "ok";
  const StatusIcon = isOk ? ShieldCheck : ShieldAlert;
  const statusColor = isOk
    ? "text-success"
    : status === "critical"
      ? "text-destructive"
      : "text-warning";
  const statusText = isOk
    ? "Ingen kjente mangler funnet"
    : "Mangler som bør sjekkes";

  return (
    <section className="mt-4">
      <h2 className="text-sm uppercase tracking-wider text-muted-foreground mb-3">
        Finance Confidence
      </h2>
      <Card>
        <CardHeader className="pb-3 flex flex-row items-center justify-between space-y-0">
          <div className="flex items-center gap-2">
            <StatusIcon className={`h-5 w-5 ${statusColor}`} />
            <CardTitle className="text-base font-semibold">
              {isLoading ? "Kjører kontroller…" : error ? "Kunne ikke hente status" : statusText}
            </CardTitle>
          </div>
          {data && (
            <div className="text-xs text-muted-foreground tabular">
              Score: {data.score} %
            </div>
          )}
        </CardHeader>
        <CardContent>
          {data && data.issues.length === 0 && !error && (
            <p className="text-sm text-muted-foreground">
              Ingen avvik oppdaget av de automatiske kontrollene.
            </p>
          )}
          {data && data.issues.length > 0 && (
            <ul className="divide-y divide-border">
              {data.issues.map((issue) => (
                <li key={issue.id} className="py-3 flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <Badge variant={severityBadgeVariant(issue.severity)}>
                        {severityLabel(issue.severity)}
                      </Badge>
                      <span className="text-sm font-medium">{issue.title}</span>
                    </div>
                    {issue.description && (
                      <p className="text-xs text-muted-foreground">{issue.description}</p>
                    )}
                  </div>
                  {issue.action_url && (
                    <Link
                      to={issue.action_url}
                      className="text-xs text-primary hover:underline whitespace-nowrap shrink-0"
                    >
                      Gå til
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          )}
          <p className="mt-4 text-[11px] text-muted-foreground">
            Basert på automatiske kontroller. Erstatter ikke regnskapsfører.
          </p>
        </CardContent>
      </Card>
    </section>
  );
}
