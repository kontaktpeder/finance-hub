import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatNOK, monthLabel } from "@/lib/format";
import { Download } from "lucide-react";

export const Route = createFileRoute("/_authenticated/orgs/$orgId/reports")({
  component: ReportsPage,
});

function ReportsPage() {
  const { orgId } = Route.useParams();
  const year = new Date().getFullYear();

  const { data } = useQuery({
    queryKey: ["report", orgId, year],
    queryFn: async () => {
      const { data: entries, error } = await supabase
        .from("finance_entries")
        .select("voucher_number, entry_type, entry_date, description, counterparty, category, amount_gross, vat_rate, vat_amount, amount_net, payment_status")
        .eq("organization_id", orgId)
        .gte("entry_date", `${year}-01-01`)
        .lt("entry_date", `${year + 1}-01-01`)
        .order("entry_date");
      if (error) throw error;
      const months: Record<number, { income: number; expense: number; vat: number }> = {};
      for (let m = 1; m <= 12; m++) months[m] = { income: 0, expense: 0, vat: 0 };
      for (const e of entries ?? []) {
        const m = new Date(e.entry_date).getMonth() + 1;
        if (e.entry_type === "income") months[m].income += Number(e.amount_gross);
        else months[m].expense += Number(e.amount_gross);
        months[m].vat += Number(e.vat_amount);
      }
      return { months, entries: entries ?? [] };
    },
  });

  function exportCsv() {
    if (!data) return;
    const header = ["voucher_number","entry_type","entry_date","description","counterparty","category","amount_gross","vat_rate","vat_amount","amount_net","payment_status"];
    const rows = [header.join(",")];
    for (const e of data.entries) {
      rows.push(header.map((k) => {
        const v = (e as any)[k] ?? "";
        const s = String(v).replace(/"/g, '""');
        return /[,"\n]/.test(s) ? `"${s}"` : s;
      }).join(","));
    }
    const blob = new Blob([rows.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `regnskap-${year}.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="p-8 max-w-6xl">
      <header className="flex items-end justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Rapporter {year}</h1>
          <p className="text-sm text-muted-foreground mt-1">Månedssammendrag og CSV-eksport.</p>
        </div>
        <Button onClick={exportCsv} variant="outline"><Download className="h-4 w-4 mr-2" /> Last ned CSV</Button>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {data && Object.entries(data.months).map(([m, v]) => (
          <Card key={m}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium capitalize">{monthLabel(year, Number(m))}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1">
              <div className="flex justify-between text-sm"><span className="text-muted-foreground">Inntekt</span><span className="tabular text-success">{formatNOK(v.income)}</span></div>
              <div className="flex justify-between text-sm"><span className="text-muted-foreground">Utgift</span><span className="tabular">−{formatNOK(v.expense)}</span></div>
              <div className="flex justify-between text-sm pt-1 border-t mt-2"><span className="font-medium">Resultat</span><span className="tabular font-semibold">{formatNOK(v.income - v.expense)}</span></div>
              <div className="flex justify-between text-xs text-muted-foreground"><span>MVA</span><span className="tabular">{formatNOK(v.vat)}</span></div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
