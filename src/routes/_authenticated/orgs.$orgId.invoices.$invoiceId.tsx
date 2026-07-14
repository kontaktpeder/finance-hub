import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useServerFn } from "@tanstack/react-start";
import {
  sendInvoiceFn,
  updateDraftInvoiceFn,
  markInvoicePaidFn,
  getInvoicePdfUrlFn,
  previewDraftInvoicePdfFn,
  deleteDraftInvoiceFn,
  adminDeleteInvoiceFn,
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
import { Plus, Trash2, FileDown, Send, CheckCircle2, ChevronLeft, Eye } from "lucide-react";

import { toast } from "sonner";
import { formatNOK, formatDate } from "@/lib/format";
const CompanySearchCombobox = lazy(() =>
  import("@/components/invoices/CompanySearchCombobox").then((m) => ({ default: m.CompanySearchCombobox })),
);
import { formatCompanyAddress } from "@/lib/brreg";

function parseAddress(addr: string | null | undefined): { street: string; postalCode: string; city: string } {
  if (!addr) return { street: "", postalCode: "", city: "" };
  // "gate, 1234 STED" or "gate, 1234 STED, NORGE" — take last comma segment as postal+city
  const parts = addr.split(",").map((s) => s.trim()).filter(Boolean);
  if (parts.length === 1) return { street: parts[0], postalCode: "", city: "" };
  const last = parts[parts.length - 1];
  const m = last.match(/^(\d{3,5})\s+(.+)$/);
  if (m) {
    return { street: parts.slice(0, -1).join(", "), postalCode: m[1], city: m[2] };
  }
  return { street: parts.slice(0, -1).join(", "), postalCode: "", city: last };
}

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
  overdue: "Forfalt",
};
const STATUS_VARIANT: Record<string, "outline" | "secondary" | "default" | "destructive"> = {
  draft: "outline",
  sent: "secondary",
  paid: "default",
  overdue: "destructive",
};

function isOverdue(status: string, dueDate: string | null | undefined): boolean {
  if (status !== "sent" || !dueDate) return false;
  const today = new Date().toISOString().slice(0, 10);
  return dueDate < today;
}

function InvoiceDetailPage() {
  const { orgId, invoiceId } = Route.useParams();
  const qc = useQueryClient();
  

  const updateDraft = useServerFn(updateDraftInvoiceFn);
  const sendInvoice = useServerFn(sendInvoiceFn);
  const markPaid = useServerFn(markInvoicePaidFn);
  const getPdf = useServerFn(getInvoicePdfUrlFn);
  const previewPdf = useServerFn(previewDraftInvoicePdfFn);
  const deleteDraft = useServerFn(deleteDraftInvoiceFn);
  const adminDelete = useServerFn(adminDeleteInvoiceFn);

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
  const [customer_street, setCustomerStreet] = useState("");
  const [customer_postal_code, setCustomerPostalCode] = useState("");
  const [customer_city, setCustomerCity] = useState("");
  const [customer_vat_registered, setCustomerVatRegistered] = useState<boolean | null>(null);
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
    const parsed = parseAddress(inv.customer_address);
    setCustomerStreet(parsed.street);
    setCustomerPostalCode(parsed.postalCode);
    setCustomerCity(parsed.city);
    setCustomerVatRegistered(null);
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

  const customer_address = formatCompanyAddress({
    address: customer_street || null,
    postalCode: customer_postal_code || null,
    city: customer_city || null,
  });

  const totals = useMemo(() => calcInvoiceTotals(lines), [lines]);

  if (isLoading || !invoice) {
    return <div className="p-4 sm:p-8 text-sm text-muted-foreground">Laster…</div>;
  }

  const inv: any = invoice;
  const status = inv.status as "draft" | "sent" | "paid";
  const readOnly = status !== "draft";
  const displayStatus = isOverdue(status, inv.due_date) ? "overdue" : status;

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

  async function doDelete() {
    setBusy(true);
    try {
      if (status === "draft") {
        await deleteDraft({ data: { organizationId: orgId, invoiceId } });
      } else {
        await adminDelete({ data: { organizationId: orgId, invoiceId } });
      }
      toast.success("Faktura slettet");
      await qc.invalidateQueries({ queryKey: ["invoices", orgId] });
      navigate({ to: "/orgs/$orgId/invoices", params: { orgId } });
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Kunne ikke slette faktura");
    } finally {
      setBusy(false);
    }
  }

  async function doPreview() {
    // Open the tab synchronously so popup blockers allow it.
    // NB: no "noopener" — that makes window.open() return null and we lose the reference.
    const win = window.open("about:blank", "_blank");
    setBusy(true);
    try {
      const res = await previewPdf({
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
      const bin = atob(res.base64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const blob = new Blob([bytes], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      if (win && !win.closed) {
        win.location.replace(url);
      } else {
        // Popup blocked — fall back to download
        const a = document.createElement("a");
        a.href = url;
        a.download = "forhandsvisning.pdf";
        document.body.appendChild(a);
        a.click();
        a.remove();
      }
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (err: any) {
      if (win && !win.closed) win.close();
      toast.error(err.message ?? "Kunne ikke lage forhåndsvisning");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="p-4 sm:p-6 md:p-8 max-w-4xl">
      <div className="mb-4">
        <Link
          to="/orgs/$orgId/invoices"
          params={{ orgId }}
          className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
        >
          <ChevronLeft className="h-3 w-3" /> Alle fakturaer
        </Link>
      </div>

      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {inv.invoice_number ? `Faktura ${inv.invoice_number}` : "Nytt utkast"}
          </h1>
          <div className="mt-1 flex items-center gap-2">
            <Badge variant={STATUS_VARIANT[displayStatus]}>{STATUS_LABEL[displayStatus]}</Badge>
            {readOnly && (
              <span className="text-xs text-muted-foreground">
                Sendt {inv.locked_at ? formatDate(inv.locked_at) : ""}
                {displayStatus === "overdue" && inv.due_date ? ` · forfalt ${formatDate(inv.due_date)}` : ""}
              </span>
            )}
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
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
              <Button variant="outline" onClick={doPreview} disabled={busy}>
                <Eye className="h-4 w-4 mr-2" /> Forhåndsvis faktura
              </Button>
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
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" disabled={busy}>
                <Trash2 className="h-4 w-4 mr-2" /> Slett
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Slett faktura?</AlertDialogTitle>
                <AlertDialogDescription>
                  {status === "draft"
                    ? "Utkastet slettes permanent."
                    : "Sendte fakturaer slettes sammen med tilhørende regnskapspost. Dette kan ikke angres."}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Avbryt</AlertDialogCancel>
                <AlertDialogAction onClick={doDelete}>Slett faktura</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </header>

      <div className="grid gap-6">
        {(status === "sent" || status === "paid") && inv.finance_entry_id && (
          <Card>
            <CardContent className="py-4 flex items-center justify-between gap-4">
              <div className="space-y-0.5">
                <div className="text-sm font-medium">Regnskapspost opprettet automatisk</div>
                <div className="text-xs text-muted-foreground">
                  Betalingsstatus: {status === "paid" ? "Betalt" : "Ubetalt"}
                  {inv.paid_at ? ` · ${formatDate(inv.paid_at)}` : ""}
                </div>
              </div>
              <Link
                to="/orgs/$orgId/entries"
                params={{ orgId }}
                className="text-xs text-primary hover:underline"
              >
                Åpne regnskap →
              </Link>
            </CardContent>
          </Card>
        )}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Fakturamottaker</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {!readOnly && (
              <div className="space-y-1.5">
                <Label>Søk firmanavn eller org.nr.</Label>
                <Suspense fallback={null}>
                  <CompanySearchCombobox
                    disabled={readOnly}
                    onSelect={(c) => {
                      setCustomerName(c.name);
                      setCustomerOrgNumber(c.orgNumber);
                      setCustomerStreet(c.address ?? "");
                      setCustomerPostalCode(c.postalCode ?? "");
                      setCustomerCity(c.city ?? "");
                      if (c.email && !customer_email) setCustomerEmail(c.email);
                      setCustomerVatRegistered(c.vatRegistered);
                    }}
                  />
                </Suspense>
              </div>
            )}
            <div className="space-y-1.5">
              <Label>Kundenavn</Label>
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
              <Input
                value={customer_street}
                onChange={(e) => setCustomerStreet(e.target.value)}
                disabled={readOnly}
                placeholder="Gate og nummer"
              />
            </div>
            <div className="grid grid-cols-[140px_1fr] gap-3">
              <div className="space-y-1.5">
                <Label>Postnr.</Label>
                <Input
                  value={customer_postal_code}
                  onChange={(e) => setCustomerPostalCode(e.target.value)}
                  disabled={readOnly}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Poststed</Label>
                <Input
                  value={customer_city}
                  onChange={(e) => setCustomerCity(e.target.value)}
                  disabled={readOnly}
                />
              </div>
            </div>
            {!readOnly && customer_vat_registered !== null && (
              <p className="text-xs text-muted-foreground">
                MVA-registrert: {customer_vat_registered ? "Ja" : "Nei"}
              </p>
            )}
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
