import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { formatNOK, formatDate } from "@/lib/format";
import { CategorySelect, categoryOrDefault } from "@/lib/CategorySelect";
import {
  correctEntryFn,
  recordPaymentFn,
  voidEntryFn,
} from "@/lib/ledger.functions";
import type { Category } from "@/lib/categories";

type EntryLite = {
  id: string;
  entry_type: "income" | "expense";
  description: string;
  counterparty: string | null;
  category: string | null;
  amount_gross: number | string;
  vat_rate: number | string;
  payment_status: string;
  paid_at: string | null;
  booking_status?: string | null;
  posting_kind?: string | null;
  private_expense?: boolean | null;
  void_reason?: string | null;
  reversed_by_entry_id?: string | null;
};

export function bookingBadge(entry: EntryLite) {
  if (entry.posting_kind === "reversal") return { label: "Motpost", variant: "outline" as const };
  if (entry.posting_kind === "correction") return { label: "Korrigering", variant: "outline" as const };
  if (entry.booking_status === "voided") return { label: "Annullert", variant: "destructive" as const };
  if (entry.booking_status === "corrected") return { label: "Korrigert", variant: "secondary" as const };
  if (entry.private_expense) return { label: "Privat", variant: "outline" as const };
  return null;
}

export function isActiveOriginal(entry: EntryLite) {
  return (entry.posting_kind ?? "original") === "original" && (entry.booking_status ?? "active") === "active";
}

export function EntryLedgerActions({ entry, orgId }: { entry: EntryLite; orgId: string }) {
  const qc = useQueryClient();
  const voidFn = useServerFn(voidEntryFn);
  const correctFn = useServerFn(correctEntryFn);
  const payFn = useServerFn(recordPaymentFn);

  const [voidOpen, setVoidOpen] = useState(false);
  const [correctOpen, setCorrectOpen] = useState(false);
  const [voidReason, setVoidReason] = useState("");
  const [voidPrivate, setVoidPrivate] = useState(false);
  const [busy, setBusy] = useState(false);

  const [payAmount, setPayAmount] = useState("");
  const [payDate, setPayDate] = useState(new Date().toISOString().slice(0, 10));
  const [payKind, setPayKind] = useState<"payment" | "refund" | "credit_note">("payment");
  const [payBy, setPayBy] = useState("");

  const [corr, setCorr] = useState(() => ({
    description: entry.description,
    category: categoryOrDefault(entry.category, entry.entry_type),
    counterparty: entry.counterparty ?? "",
    amount: String(entry.amount_gross),
    vatRate: String(entry.vat_rate),
    reason: "",
  }));

  const active = isActiveOriginal(entry);

  const { data: payments } = useQuery({
    queryKey: ["entry-payments", entry.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("finance_payments")
        .select("id, kind, amount, paid_on, paid_by, notes, created_at")
        .eq("entry_id", entry.id)
        .order("paid_on", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: audit } = useQuery({
    queryKey: ["entry-audit", entry.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("finance_entry_audit")
        .select("id, action, field_name, old_value, new_value, reason, created_at")
        .eq("entry_id", entry.id)
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return data ?? [];
    },
  });

  async function invalidate() {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ["entries", orgId] }),
      qc.invalidateQueries({ queryKey: ["entry-payments", entry.id] }),
      qc.invalidateQueries({ queryKey: ["entry-audit", entry.id] }),
      qc.invalidateQueries({ queryKey: ["report", orgId] }),
      qc.invalidateQueries({ queryKey: ["dashboard", orgId] }),
    ]);
  }

  async function onVoid() {
    if (voidReason.trim().length < 3) {
      toast.error("Skriv en begrunnelse");
      return;
    }
    setBusy(true);
    try {
      await voidFn({
        data: {
          organizationId: orgId,
          entryId: entry.id,
          reason: voidReason.trim(),
          privateExpense: voidPrivate,
        },
      });
      toast.success("Posten er annullert med motpost");
      setVoidOpen(false);
      await invalidate();
    } catch (err: any) {
      toast.error(err?.message ?? "Klarte ikke annullere");
    } finally {
      setBusy(false);
    }
  }

  async function onCorrect() {
    if (corr.reason.trim().length < 3) {
      toast.error("Skriv en begrunnelse");
      return;
    }
    setBusy(true);
    try {
      await correctFn({
        data: {
          organizationId: orgId,
          entryId: entry.id,
          reason: corr.reason.trim(),
          description: corr.description.trim(),
          category: corr.category as Category,
          counterparty: corr.counterparty.trim() || null,
          amount_gross: Number(corr.amount.replace(",", ".")),
          vat_rate: Number(corr.vatRate.replace(",", ".")),
        },
      });
      toast.success("Posten er korrigert (motpost + ny post)");
      setCorrectOpen(false);
      await invalidate();
    } catch (err: any) {
      toast.error(err?.message ?? "Klarte ikke korrigere");
    } finally {
      setBusy(false);
    }
  }

  async function onPay() {
    const amount = Number(payAmount.replace(",", "."));
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error("Oppgi beløp");
      return;
    }
    setBusy(true);
    try {
      await payFn({
        data: {
          organizationId: orgId,
          entryId: entry.id,
          amount,
          paidOn: payDate,
          kind: payKind,
          paidBy: payBy.trim() || null,
        },
      });
      toast.success("Betaling registrert");
      setPayAmount("");
      await invalidate();
    } catch (err: any) {
      toast.error(err?.message ?? "Klarte ikke registrere betaling");
    } finally {
      setBusy(false);
    }
  }

  async function markPrivate(next: boolean) {
    const { error } = await supabase
      .from("finance_entries")
      .update({ private_expense: next })
      .eq("id", entry.id)
      .eq("organization_id", orgId);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(next ? "Merket som privat" : "Privat-merking fjernet");
    await invalidate();
  }

  const kindLabel: Record<string, string> = {
    payment: "Betaling",
    refund: "Refusjon",
    credit_note: "Kreditnota",
  };

  return (
    <div className="mt-6 space-y-5">
      {entry.void_reason && (
        <p className="text-xs text-muted-foreground">
          Begrunnelse: {entry.void_reason}
        </p>
      )}

      {active && (
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" variant="outline" onClick={() => setVoidOpen(true)}>
            Annuller
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={() => setCorrectOpen(true)}>
            Korriger beløp/kontering
          </Button>
        </div>
      )}

      {active && (
        <div className="flex items-center justify-between rounded-md border px-3 py-2">
          <div>
            <div className="text-sm">Privat kjøp</div>
            <div className="text-xs text-muted-foreground">
              Ikke fradragsberettiget. Annuller hvis selskapet aldri skulle bære kostnaden.
            </div>
          </div>
          <Switch
            checked={!!entry.private_expense}
            onCheckedChange={(v) => void markPrivate(v)}
          />
        </div>
      )}

      {active && (
        <div className="rounded-md border p-3 space-y-3">
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
            Betalingshendelser
          </div>
          <p className="text-xs text-muted-foreground">
            Betalingsstatus beregnes fra registrerte betalinger. `paid_at` er datoen posten ble fullt dekket.
          </p>
          {(payments ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">Ingen betalinger registrert.</p>
          ) : (
            <ul className="text-sm space-y-1">
              {(payments ?? []).map((p) => (
                <li key={p.id} className="flex justify-between gap-2">
                  <span>
                    {formatDate(p.paid_on)} · {kindLabel[p.kind] ?? p.kind}
                    {p.paid_by ? ` · ${p.paid_by}` : ""}
                  </span>
                  <span className="tabular">
                    {p.kind === "payment" ? "" : "−"}
                    {formatNOK(p.amount)} kr
                  </span>
                </li>
              ))}
            </ul>
          )}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            <div className="space-y-1">
              <Label className="text-xs">Beløp</Label>
              <Input inputMode="decimal" value={payAmount} onChange={(e) => setPayAmount(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Dato</Label>
              <Input type="date" value={payDate} onChange={(e) => setPayDate(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Type</Label>
              <Select value={payKind} onValueChange={(v) => setPayKind(v as typeof payKind)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="payment">Betaling</SelectItem>
                  <SelectItem value="refund">Refusjon</SelectItem>
                  <SelectItem value="credit_note">Kreditnota</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Betalt av</Label>
              <Input value={payBy} onChange={(e) => setPayBy(e.target.value)} placeholder="f.eks. Denis" />
            </div>
          </div>
          <Button type="button" size="sm" onClick={() => void onPay()} disabled={busy}>
            Registrer betaling
          </Button>
        </div>
      )}

      {(audit ?? []).length > 0 && (
        <div>
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1">
            Endringslogg
          </div>
          <ul className="text-xs text-muted-foreground space-y-1">
            {(audit ?? []).map((a) => (
              <li key={a.id}>
                {formatDate(a.created_at.slice(0, 10))} · {a.action}
                {a.field_name ? ` · ${a.field_name}` : ""}
                {a.reason ? ` — ${a.reason}` : ""}
              </li>
            ))}
          </ul>
        </div>
      )}

      <Dialog open={voidOpen} onOpenChange={setVoidOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Annuller post</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Originalbeløpet beholdes. Det opprettes en motpost med eget bilagsnummer og motsatt beløp.
          </p>
          <div className="space-y-1.5">
            <Label>Begrunnelse</Label>
            <Textarea rows={3} value={voidReason} onChange={(e) => setVoidReason(e.target.value)} />
          </div>
          <div className="flex items-center justify-between">
            <Label className="text-sm">Privat kjøp — selskapet skulle ikke bære kostnaden</Label>
            <Switch checked={voidPrivate} onCheckedChange={setVoidPrivate} />
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setVoidOpen(false)}>Avbryt</Button>
            <Button type="button" onClick={() => void onVoid()} disabled={busy}>
              {busy ? "Annullerer…" : "Annuller"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={correctOpen} onOpenChange={setCorrectOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Korriger post</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Oppretter motpost mot originalen og en ny korrekt post. Originalbeløpet endres ikke.
          </p>
          <div className="space-y-1.5">
            <Label>Ny beskrivelse</Label>
            <Input value={corr.description} onChange={(e) => setCorr({ ...corr, description: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label>Kategori</Label>
              <CategorySelect
                value={corr.category}
                entryType={entry.entry_type}
                onChange={(v) => setCorr({ ...corr, category: v })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Motpart</Label>
              <Input value={corr.counterparty} onChange={(e) => setCorr({ ...corr, counterparty: e.target.value })} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label>Beløp inkl. MVA</Label>
              <Input inputMode="decimal" value={corr.amount} onChange={(e) => setCorr({ ...corr, amount: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>MVA %</Label>
              <Input inputMode="decimal" value={corr.vatRate} onChange={(e) => setCorr({ ...corr, vatRate: e.target.value })} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Begrunnelse</Label>
            <Textarea rows={2} value={corr.reason} onChange={(e) => setCorr({ ...corr, reason: e.target.value })} />
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setCorrectOpen(false)}>Avbryt</Button>
            <Button type="button" onClick={() => void onCorrect()} disabled={busy}>
              {busy ? "Korrigerer…" : "Korriger"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export function BookingStatusBadge({ entry }: { entry: EntryLite }) {
  const b = bookingBadge(entry);
  if (!b) return null;
  return (
    <Badge variant={b.variant} className="text-[10px] font-normal shrink-0">
      {b.label}
    </Badge>
  );
}
