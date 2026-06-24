import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
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
        .select(
          "voucher_number, entry_type, entry_date, description, counterparty, category, category_group, amount_gross, vat_rate, vat_amount, amount_net, payment_status, pre_company_expense",
        )
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

  const { incomeCats, expenseCats, incomeTotal, expenseTotal } = useMemo(() => {
    const inc = new Map<string, number>();
    const exp = new Map<string, number>();
    let it = 0, et = 0;
    for (const e of data?.entries ?? []) {
      const key = (e as any).category_group || (e as any).category || "Uten kategori";
      const amt = Number(e.amount_gross);
      if (e.entry_type === "income") {
        inc.set(key, (inc.get(key) ?? 0) + amt);
        it += amt;
      } else {
        exp.set(key, (exp.get(key) ?? 0) + amt);
        et += amt;
      }
    }
    const sort = (m: Map<string, number>) =>
      Array.from(m.entries()).sort((a, b) => b[1] - a[1]);
    return { incomeCats: sort(inc), expenseCats: sort(exp), incomeTotal: it, expenseTotal: et };
  }, [data]);

  function exportCsv() {
    if (!data) return;
    const header = [
      "voucher_number","entry_type","entry_date","description","counterparty","category","category_group","amount_gross","vat_rate","vat_amount","amount_net","payment_status","pre_company_expense","pre_company_label",
    ];
    const rows = [header.join(",")];
    for (const e of data.entries) {
      const pre = Boolean((e as any).pre_company_expense);
      const row: Record<string, unknown> = {
        ...e,
        pre_company_expense: pre ? "true" : "false",
        pre_company_label: pre ? "Før stiftelse" : "Ordinær",
      };
      rows.push(
        header
          .map((k) => {
            const v = row[k] ?? "";
            const s = String(v).replace(/"/g, '""');
            return /[,"\n]/.test(s) ? `"${s}"` : s;
          })
          .join(","),
      );
    }

    const blob = new Blob([rows.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `regnskap-${year}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="p-4 sm:p-6 md:p-8 max-w-6xl space-y-10">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Rapporter {year}</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Resultat per måned og fordeling på kategori.
          </p>
        </div>
        <Button onClick={exportCsv} variant="outline">
          <Download className="h-4 w-4 mr-2" /> Last ned CSV
        </Button>
      </header>

      <section>
        <h2 className="text-sm uppercase tracking-wider text-muted-foreground mb-3">
          Resultat per måned
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {data && Object.entries(data.months).map(([m, v]) => (
            <Card key={m}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium capitalize">
                  {monthLabel(year, Number(m))}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-1">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Inntekt</span>
                  <span className="tabular text-success">{formatNOK(v.income)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Utgift</span>
                  <span className="tabular">−{formatNOK(v.expense)}</span>
                </div>
                <div className="flex justify-between text-sm pt-1 border-t mt-2">
                  <span className="font-medium">Resultat</span>
                  <span className="tabular font-semibold">
                    {formatNOK(v.income - v.expense)}
                  </span>
                </div>
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>MVA</span>
                  <span className="tabular">{formatNOK(v.vat)}</span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <section className="grid gap-6 md:grid-cols-2">
        <CategoryReport title="Inntekter per kategori" rows={incomeCats} total={incomeTotal} tone="income" />
        <CategoryReport title="Utgifter per kategori" rows={expenseCats} total={expenseTotal} tone="expense" />
      </section>
    </div>
  );
}

function CategoryReport({
  title,
  rows,
  total,
  tone,
}: {
  title: string;
  rows: Array<[string, number]>;
  total: number;
  tone: "income" | "expense";
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">Ingen data.</p>
        ) : (
          <div className="space-y-2">
            {rows.map(([name, amt]) => {
              const pct = total > 0 ? (amt / total) * 100 : 0;
              return (
                <div key={name}>
                  <div className="flex justify-between text-sm mb-1">
                    <span>{name}</span>
                    <span className="tabular text-muted-foreground">
                      {formatNOK(amt)} kr · {pct.toFixed(1)}%
                    </span>
                  </div>
                  <div className="h-1.5 rounded bg-muted overflow-hidden">
                    <div
                      className={`h-full ${tone === "income" ? "bg-success" : "bg-primary"}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
            <div className="flex justify-between text-sm pt-3 border-t mt-3 font-medium">
              <span>Total</span>
              <span className="tabular">{formatNOK(total)} kr</span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
