import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatNOK } from "@/lib/format";
import { TrendingUp, TrendingDown, Wallet, AlertCircle } from "lucide-react";

export const Route = createFileRoute("/_authenticated/orgs/$orgId/")({
  component: Dashboard,
});

function Dashboard() {
  const { orgId } = Route.useParams();
  const year = new Date().getFullYear();

  const { data } = useQuery({
    queryKey: ["dashboard", orgId, year],
    queryFn: async () => {
      const start = `${year}-01-01`;
      const end = `${year + 1}-01-01`;
      const { data: entries, error } = await supabase
        .from("finance_entries")
        .select("entry_type, amount_gross, amount_net, vat_amount, payment_status, entry_date")
        .eq("organization_id", orgId)
        .gte("entry_date", start)
        .lt("entry_date", end);
      if (error) throw error;
      let income = 0, expense = 0, unpaid = 0, missingVoucher = 0;
      for (const e of entries ?? []) {
        if (e.entry_type === "income") income += Number(e.amount_gross);
        else expense += Number(e.amount_gross);
        if (e.payment_status === "unpaid") unpaid += Number(e.amount_gross);
      }
      const { count: attachmentless } = await supabase
        .from("finance_entries")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", orgId)
        .eq("entry_type", "expense")
        .not("id", "in", `(${(await supabase.from("finance_attachments").select("entry_id").eq("organization_id", orgId).not("entry_id", "is", null)).data?.map(a => `'${a.entry_id}'`).join(",") || "''"})`);
      missingVoucher = attachmentless ?? 0;
      return { income, expense, result: income - expense, unpaid, missingVoucher, count: entries?.length ?? 0 };
    },
  });

  const stats = [
    { label: "Inntekter", value: data?.income ?? 0, icon: TrendingUp, tone: "success" },
    { label: "Utgifter", value: data?.expense ?? 0, icon: TrendingDown, tone: "destructive" },
    { label: "Resultat", value: data?.result ?? 0, icon: Wallet, tone: "primary" },
    { label: "Ubetalt", value: data?.unpaid ?? 0, icon: AlertCircle, tone: "warning" },
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
              <s.icon className={`h-4 w-4 text-${s.tone === "primary" ? "primary" : s.tone === "success" ? "success" : s.tone === "destructive" ? "destructive" : "warning"}`} />
            </CardHeader>
            <CardContent>
              <div className="tabular text-2xl font-semibold">{formatNOK(s.value)}</div>
              <div className="text-xs text-muted-foreground mt-1">NOK</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Manglende bilag</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="tabular text-3xl font-semibold">{data?.missingVoucher ?? 0}</div>
          <p className="text-sm text-muted-foreground mt-1">utgiftsposter uten vedlegg</p>
        </CardContent>
      </Card>
    </div>
  );
}
