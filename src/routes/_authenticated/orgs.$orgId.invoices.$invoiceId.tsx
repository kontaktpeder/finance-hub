import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useServerFn } from "@tanstack/react-start";
import {
  sendInvoiceFn,
  updateDraftInvoiceFn,
  markInvoicePaidFn,
  getInvoicePdfUrlFn,
} from "@/lib/invoices.functions";
import { calcInvoiceTotals } from "@/lib/invoices.calc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Plus, Trash2, FileDown, Send, CheckCircle2, ChevronLeft } from "lucide-react";

import { toast } from "sonner";
import { formatNOK, formatDate } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/orgs/$orgId/invoices/$invoiceId")({
  component: InvoiceDetailPage,
});

type LineForm = {
  description: string;
  quantity: number;
  unit_price: number;
  vat_rate: number;
};

const EMPTY_LINE: LineForm = { description: "", quantity: 1, unit_price: 0, vat_rate: 25 };
const VAT_OPTIONS = [0, 12, 15, 25] as const;

const STATUS_LABEL: Record<string, string> = {
  draft: "Utkast",
  sent: "Sendt",
  paid: "Betalt",
};
const STATUS_VARIANT: Record<string, "outline" | "secondary" | "default"> = {
  draft: "outline",
  sent: "secondary",
  paid: "default",
};

function InvoiceDetailPage() {
  const { orgId, invoiceId } = Route.useParams();
  const qc = useQueryClient();
  const navigate = useNavigate();

  const updateDraft = useServerFn(updateDraftInvoiceFn);
  const sendInvoice = useServerFn(sendInvoiceFn);
  const markPaid = useServerFn(markInvoicePaidFn);
  const getPdf = useServerFn(getInvoicePdfUrlFn);

  const { data: invoice, isLoading } = useQuery({
    queryKey: ["invoice", invoiceId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("invoices")
        .select("*, invoice_lines(*)")
        .eq("id", invoiceId)
        .eq("organization_id", orgId)
        .single();
      if (error) throw error;
      return data;
    },
  });

  const [customer_name, setCustomerName] = useState("");
  const [customer_org_number, setCustomerOrgNumber] = useState("");
  const [customer_email, setCustomerEmail] = useState("");
  const [customer_address, setCustomerAddress] = useState("");
  const [issue_date, setIssueDate] = useState("");
  const [due_date, setDueDate] = useState("");
  const [lines, setLines] = useState<LineForm[]>([EMPTY_LINE]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!invoice) return;
    const inv: any = invoice;
    setCustomerName(inv.customer_name ?? "");
    setCustomerOrgNumber(inv.customer_org_number ?? "");
    setCustomerEmail(inv.customer_email ?? "");
    setCustomerAddress(inv.customer_address ?? "");
    setIssueDate(inv.issue_date ?? "");
    setDueDate(inv.due_date ?? "");
    const sorted = (inv.invoice_lines ?? [])
      .slice()
      .sort((a: any, b: any) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
    setLines(
      sorted.length > 0
        ? sorted.map((l: any) => ({
            description: l.description ?? "",
            quantity: Number(l.quantity),
            unit_price: Number(l.unit_price),
            vat_rate: Number(l.vat_rate),
          }))
        : [EMPTY_LINE],
    );
  }, [invoice]);

  const totals = useMemo(() => calcInvoiceTotals(lines), [lines]);

  if (isLoading || !invoice) {
    return <div className="p-8 text-sm text-muted-foreground">Laster…</div>;
  }

  const inv: any = invoice;
  const status = inv.status as "draft" | "sent" | "paid";
  const readOnly = status !== "draft";

  function updateLine(i: number, patch: Partial<LineForm>) {
    setLines((ls) => ls.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  }
  function addLine() {
    setLines((ls) => [...ls, { ...EMPTY_LINE }]);
  }
  function removeLine(i: number) {
    setLines((ls) => (ls.length <= 1 ? ls : ls.filter((_, idx) => idx !== i)));
  }

  async function save() {
    setBusy(true);
    try {
      await updateDraft({
        data: {
          organizationId: orgId,
          invoiceId,
          patch: {
            issue_date,
            due_date: due_date || null,
            customer_name,
            customer_org_number: customer_org_number || null,
            customer_email: customer_email || null,
            customer_address: customer_address || null,
            lines,
          },
        },
      });
      toast.success("Lagret");
      qc.invalidateQueries({ queryKey: ["invoice", invoiceId] });
      qc.invalidateQueries({ queryKey: ["invoices", orgId] });
    } catch (err: any) {
      toast.error(err.message ?? "Kunne ikke lagre");
    } finally {
      setBusy(false);
    }
  }

  async function doSend() {
    setBusy(true);
    try {
      await save();
      await sendInvoice({ data: { organizationId: orgId, invoiceId } });
      toast.success("Faktura sendt");
      qc.invalidateQueries({ queryKey: ["invoice", invoiceId] });
      qc.invalidateQueries({ queryKey: ["invoices", orgId] });
    } catch (err: any) {
      toast.error(err.message ?? "Kunne ikke sende");
    } finally {
      setBusy(false);
    }
  }

  async function doMarkPaid() {
    setBusy(true);
    try {
      await markPaid({ data: { organizationId: orgId, invoiceId } });
      toast.success("Markert som betalt");
      qc.invalidateQueries({ queryKey: ["invoice", invoiceId] });
      qc.invalidateQueries({ queryKey: ["invoices", orgId] });
    } catch (err: any) {
      toast.error(err.message ?? "Kunne ikke markere som betalt");
    } finally {
      setBusy(false);
    }
  }

  async function openPdf() {
    try {
      const res = await getPdf({ data: { organizationId: orgId, invoiceId } });
      window.open(res.url, "_blank", "noopener");
    } catch (err: any) {
      toast.error(err.message ?? "PDF ikke tilgjengelig");
    }
  }

  return (
    <div className="p-8 max-w-4xl">
      <div className="mb-4">
        <Link
          to="/orgs/$orgId/invoices"
          params={{ orgId }}
          className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
        >
          <ChevronLeft className="h-3 w-3" /> Alle fakturaer
        </Link>
      </div>

      <header className="flex items-end justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {inv.invoice_number ? `Faktura ${inv.invoice_number}` : "Nytt utkast"}
          </h1>
          <div className="mt-1 flex items-center gap-2">
            <Badge variant={STATUS_VARIANT[status]}>{STATUS_LABEL[status]}</Badge>
            {readOnly && (
              <span className="text-xs text-muted-foreground">
                Sendt {inv.locked_at ? formatDate(inv.locked_at) : ""}
              </span>
            )}
          </div>
        </div>
        <div className="flex gap-2">
          {readOnly && inv.pdf_attachment_id && (
            <Button variant="outline" onClick={openPdf}>
              <FileDown className="h-4 w-4 mr-2" /> Vis PDF
            </Button>
          )}
          {status === "sent" && (
            <Button onClick={doMarkPaid} disabled={busy}>
              <CheckCircle2 className="h-4 w-4 mr-2" /> Marker som betalt
            </Button>
          )}
          {status === "draft" && (
            <>
              <Button variant="outline" onClick={save} disabled={busy}>
                Lagre utkast
              </Button>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button disabled={busy}>
                    <Send className="h-4 w-4 mr-2" /> Send faktura
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Send faktura?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Fakturanummer tildeles og PDF låses. Dette kan ikke angres.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Avbryt</AlertDialogCancel>
                    <AlertDialogAction onClick={doSend}>Send</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </>
          )}
        </div>
      </header>

      <div className="grid gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Kunde</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1.5">
              <Label>Navn</Label>
              <Input
                value={customer_name}
                onChange={(e) => setCustomerName(e.target.value)}
                disabled={readOnly}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Org.nr.</Label>
                <Input
                  value={customer_org_number}
                  onChange={(e) => setCustomerOrgNumber(e.target.value)}
                  disabled={readOnly}
                />
              </div>
              <div className="space-y-1.5">
                <Label>E-post</Label>
                <Input
                  type="email"
                  value={customer_email}
                  onChange={(e) => setCustomerEmail(e.target.value)}
                  disabled={readOnly}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Adresse</Label>
              <Textarea
                value={customer_address}
                onChange={(e) => setCustomerAddress(e.target.value)}
                disabled={readOnly}
                rows={2}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Datoer</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Fakturadato</Label>
              <Input
                type="date"
                value={issue_date}
                onChange={(e) => setIssueDate(e.target.value)}
                disabled={readOnly}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Forfallsdato</Label>
              <Input
                type="date"
                value={due_date}
                onChange={(e) => setDueDate(e.target.value)}
                disabled={readOnly}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">Linjer</CardTitle>
            {!readOnly && (
              <Button variant="outline" size="sm" onClick={addLine}>
                <Plus className="h-4 w-4 mr-1" /> Legg til
              </Button>
            )}
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {lines.map((line, i) => (
                <div key={i} className="grid grid-cols-12 gap-2 items-end">
                  <div className="col-span-5 space-y-1">
                    <Label className="text-xs">Beskrivelse</Label>
                    <Input
                      value={line.description}
                      onChange={(e) => updateLine(i, { description: e.target.value })}
                      disabled={readOnly}
                    />
                  </div>
                  <div className="col-span-1 space-y-1">
                    <Label className="text-xs">Antall</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={line.quantity}
                      onChange={(e) => updateLine(i, { quantity: Number(e.target.value) })}
                      disabled={readOnly}
                    />
                  </div>
                  <div className="col-span-2 space-y-1">
                    <Label className="text-xs">Enhetspris</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={line.unit_price}
                      onChange={(e) => updateLine(i, { unit_price: Number(e.target.value) })}
                      disabled={readOnly}
                    />
                  </div>
                  <div className="col-span-2 space-y-1">
                    <Label className="text-xs">MVA %</Label>
                    <Select
                      value={String(line.vat_rate)}
                      onValueChange={(v) => updateLine(i, { vat_rate: Number(v) })}
                      disabled={readOnly}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {VAT_OPTIONS.map((v) => (
                          <SelectItem key={v} value={String(v)}>
                            {v}%
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="col-span-2 flex items-center justify-end gap-2">
                    <span className="tabular text-sm">
                      {formatNOK(
                        Math.round(line.quantity * line.unit_price * (1 + line.vat_rate / 100) * 100) / 100,
                      )}
                    </span>
                    {!readOnly && lines.length > 1 && (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => removeLine(i)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="py-4">
            <div className="ml-auto max-w-xs space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Netto</span>
                <span className="tabular">{formatNOK(totals.subtotal)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">MVA</span>
                <span className="tabular">{formatNOK(totals.vat_amount)}</span>
              </div>
              <div className="flex justify-between border-t pt-1 font-semibold">
                <span>Total</span>
                <span className="tabular">{formatNOK(totals.total)}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
