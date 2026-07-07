import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { useServerFn } from "@tanstack/react-start";
import { createInvoiceFn } from "@/lib/invoices.functions";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Plus, FileSpreadsheet, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { formatNOK, formatDate } from "@/lib/format";
import { MissionReturnLink } from "@/components/finance/MissionReturnLink";

const Search = z.object({
  issue: z.string().optional(),
  return: z.string().optional(),
});

export const Route = createFileRoute("/_authenticated/orgs/$orgId/invoices/")({
  validateSearch: (s) => Search.parse(s),
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

const DRAFT_STALE_DAYS = 14;

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
  const search = Route.useSearch();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const createInvoice = useServerFn(createInvoiceFn);
  const [busy, setBusy] = useState(false);

  const { data: invoices, isLoading } = useQuery({
    queryKey: ["invoices", orgId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("invoices")
        .select(
          "id, invoice_number, customer_name, issue_date, due_date, total, status, updated_at",
        )
        .eq("organization_id", orgId)
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return data;
    },
  });

  const staleCutoff = useMemo(
    () => new Date(Date.now() - DRAFT_STALE_DAYS * 24 * 60 * 60 * 1000).toISOString(),
    [],
  );

  const isStaleDraftFilter = search.issue === "stale_draft";

  const visibleInvoices = useMemo(() => {
    if (!invoices) return invoices;
    if (!isStaleDraftFilter) return invoices;
    return invoices.filter(
      (inv: any) => inv.status === "draft" && inv.updated_at && inv.updated_at < staleCutoff,
    );
  }, [invoices, isStaleDraftFilter, staleCutoff]);

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
    <div className="p-4 sm:p-6 md:p-8 max-w-5xl">
      {search.return && (
        <div className="mb-3">
          <MissionReturnLink returnUrl={search.return} />
        </div>
      )}
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Fakturaer</h1>
          <p className="text-sm text-muted-foreground mt-1">Utgående fakturaer.</p>
        </div>
        <Button onClick={newInvoice} disabled={busy}>
          <Plus className="h-4 w-4 mr-2" /> Ny faktura
        </Button>
      </header>

      {isStaleDraftFilter && (
        <div className="mb-4 flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/5 px-3 py-2 text-sm">
          <AlertTriangle className="h-4 w-4 mt-0.5 text-warning shrink-0" />
          <div className="flex-1">
            Viser fakturautkast eldre enn {DRAFT_STALE_DAYS} dager fra Finance Confidence.
          </div>
          <button
            className="text-xs text-muted-foreground hover:text-foreground"
            onClick={() => navigate({ to: ".", search: { return: search.return } as any })}
          >
            Vis alle
          </button>
        </div>
      )}

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Laster…</p>
      ) : visibleInvoices?.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            <FileSpreadsheet className="h-8 w-8 mx-auto mb-2 opacity-40" />
            {isStaleDraftFilter
              ? "Ingen fakturaer med dette problemet funnet."
              : "Ingen fakturaer ennå."}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0 overflow-x-auto">
            <table className="w-full text-sm min-w-[640px]">
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
                {visibleInvoices?.map((inv: any) => {
                  const isStale =
                    inv.status === "draft" && inv.updated_at && inv.updated_at < staleCutoff;
                  return (
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
                      <td className="px-4 py-3">
                        {inv.due_date ? formatDate(inv.due_date) : "—"}
                      </td>
                      <td className="px-4 py-3 text-right tabular">{formatNOK(inv.total)}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <Badge variant={STATUS_VARIANT[inv.status] ?? "secondary"}>
                            {STATUS_LABEL[inv.status] ?? inv.status}
                          </Badge>
                          {isStale && (
                            <Badge variant="outline" className="text-[10px] font-normal">
                              Gammelt utkast
                            </Badge>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
