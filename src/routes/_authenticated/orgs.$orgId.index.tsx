import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatNOK } from "@/lib/format";
import { TrendingUp, TrendingDown, Wallet, AlertCircle, CalendarDays, FileWarning, Receipt } from "lucide-react";

export const Route = createFileRoute("/_authenticated/orgs/$orgId/")({
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
    <div className="p-8 max-w-6xl">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight">Dashbord {year}</h1>
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
    </div>
  );
}
