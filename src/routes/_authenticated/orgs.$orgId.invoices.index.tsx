import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useServerFn } from "@tanstack/react-start";
import { createInvoiceFn } from "@/lib/invoices.functions";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Plus, FileSpreadsheet } from "lucide-react";
import { toast } from "sonner";
import { formatNOK, formatDate } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/orgs/$orgId/invoices/")({
  component: InvoicesPage,
});

const STATUS_LABEL: Record<string, string> = {
  draft: "Utkast",
  sent: "Sendt",
  paid: "Betalt",
};

const STATUS_VARIANT: Record<string, "secondary" | "default" | "outline"> = {
  draft: "outline",
  sent: "secondary",
  paid: "default",
};

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}
function plusDaysISO(days: number) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function InvoicesPage() {
  const { orgId } = Route.useParams();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const createInvoice = useServerFn(createInvoiceFn);
  const [busy, setBusy] = useState(false);

  const { data: invoices, isLoading } = useQuery({
    queryKey: ["invoices", orgId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("invoices")
        .select("id, invoice_number, customer_name, issue_date, due_date, total, status")
        .eq("organization_id", orgId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  async function newInvoice() {
    setBusy(true);
    try {
      const inv = await createInvoice({
        data: {
          organizationId: orgId,
          invoice: {
            issue_date: todayISO(),
            due_date: plusDaysISO(14),
            customer_name: "Ny kunde",
            lines: [{ description: "Ny linje", quantity: 1, unit_price: 0, vat_rate: 25 }],
          },
        },
      });
      qc.invalidateQueries({ queryKey: ["invoices", orgId] });
      navigate({
        to: "/orgs/$orgId/invoices/$invoiceId",
        params: { orgId, invoiceId: (inv as any).id },
      });
    } catch (err: any) {
      toast.error(err.message ?? "Kunne ikke opprette");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="p-8 max-w-5xl">
      <header className="flex items-end justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Fakturaer</h1>
          <p className="text-sm text-muted-foreground mt-1">Utgående fakturaer.</p>
        </div>
        <Button onClick={newInvoice} disabled={busy}>
          <Plus className="h-4 w-4 mr-2" /> Ny faktura
        </Button>
      </header>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Laster…</p>
      ) : invoices?.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            <FileSpreadsheet className="h-8 w-8 mx-auto mb-2 opacity-40" />
            Ingen fakturaer ennå.
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead className="border-b text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="text-left px-4 py-3">Nr.</th>
                  <th className="text-left px-4 py-3">Kunde</th>
                  <th className="text-left px-4 py-3">Dato</th>
                  <th className="text-left px-4 py-3">Forfall</th>
                  <th className="text-right px-4 py-3">Beløp</th>
                  <th className="text-left px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {invoices?.map((inv: any) => (
                  <tr
                    key={inv.id}
                    className="border-b last:border-0 hover:bg-muted/30 cursor-pointer"
                    onClick={() =>
                      navigate({
                        to: "/orgs/$orgId/invoices/$invoiceId",
                        params: { orgId, invoiceId: inv.id },
                      })
                    }
                  >
                    <td className="px-4 py-3 tabular">
                      <span className="hover:underline text-primary">
                        {inv.invoice_number ?? "—"}
                      </span>
                    </td>
                    <td className="px-4 py-3">{inv.customer_name}</td>
                    <td className="px-4 py-3">{formatDate(inv.issue_date)}</td>
                    <td className="px-4 py-3">{inv.due_date ? formatDate(inv.due_date) : "—"}</td>
                    <td className="px-4 py-3 text-right tabular">{formatNOK(inv.total)}</td>
                    <td className="px-4 py-3">
                      <Badge variant={STATUS_VARIANT[inv.status] ?? "secondary"}>
                        {STATUS_LABEL[inv.status] ?? inv.status}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
