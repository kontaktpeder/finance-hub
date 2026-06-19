import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertTriangle, Upload, Sparkles, Check, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { scanReceiptDraft, convertDraftToEntry, type ReceiptSuggestion } from "@/lib/receipt-drafts.functions";

export const Route = createFileRoute("/_authenticated/orgs/$orgId/scan")({
  component: ScanPage,
});

type DraftRow = {
  id: string;
  status: string;
  ai_suggestion: ReceiptSuggestion | null;
  attachment_id: string | null;
  book_id: string;
  created_at: string;
};

function ScanPage() {
  const { orgId } = Route.useParams();
  const qc = useQueryClient();
  const scanFn = useServerFn(scanReceiptDraft);
  const [activeDraftId, setActiveDraftId] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [bookId, setBookId] = useState<string>("");
  const [scanning, setScanning] = useState(false);

  const { data: books } = useQuery({
    queryKey: ["books", orgId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("finance_books")
        .select("id, name, is_default")
        .eq("organization_id", orgId)
        .order("created_at");
      if (error) throw error;
      if (data && data.length > 0 && !bookId) {
        const def = data.find((b) => b.is_default) ?? data[0];
        setBookId(def.id);
      }
      return data;
    },
  });

  const { data: drafts } = useQuery({
    queryKey: ["receipt-drafts", orgId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("finance_receipt_drafts")
        .select("id, status, ai_suggestion, attachment_id, book_id, created_at")
        .eq("organization_id", orgId)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data as unknown as DraftRow[];
    },
  });

  async function handleScan() {
    if (!file) { toast.error("Velg en fil"); return; }
    if (!bookId) { toast.error("Velg regnskapsbok"); return; }
    setScanning(true);
    try {
      const path = `${orgId}/drafts/${Date.now()}-${file.name}`;
      const { error: upErr } = await supabase.storage
        .from("finance-attachments")
        .upload(path, file, { contentType: file.type });
      if (upErr) throw upErr;
      const res = await scanFn({
        data: {
          organizationId: orgId,
          bookId,
          storagePath: path,
          fileName: file.name,
          mimeType: file.type,
          sizeBytes: file.size,
        },
      });
      toast.success("AI-forslag klart");
      setFile(null);
      setActiveDraftId(res.draftId);
      qc.invalidateQueries({ queryKey: ["receipt-drafts", orgId] });
    } catch (err: any) {
      toast.error(err.message ?? "Skanning feilet");
    } finally {
      setScanning(false);
    }
  }

  const activeDraft = useMemo(
    () => drafts?.find((d) => d.id === activeDraftId) ?? null,
    [drafts, activeDraftId]
  );

  return (
    <div className="p-4 sm:p-6 md:p-8 max-w-7xl">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
          <Sparkles className="h-6 w-6 text-primary" /> AI-skanning av kvitteringer
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Last opp kvittering/faktura, få AI-forslag og kontroller før posten opprettes.
        </p>
      </header>

      <Alert variant="default" className="mb-6 border-amber-500/30 bg-amber-500/5">
        <AlertTriangle className="h-4 w-4 text-amber-600" />
        <AlertTitle>AI kan tolke feil</AlertTitle>
        <AlertDescription>
          Kontroller dato, beløp, leverandør og MVA før posten opprettes. AI bokfører aldri automatisk.
        </AlertDescription>
      </Alert>

      <div className="grid lg:grid-cols-[1fr_1.2fr] gap-6">
        <div className="space-y-4">
          <div className="rounded-md border bg-card p-4 space-y-3">
            <h2 className="font-medium text-sm">Last opp ny kvittering</h2>
            <div className="space-y-1.5">
              <Label>Regnskapsbok</Label>
              <Select value={bookId} onValueChange={setBookId}>
                <SelectTrigger><SelectValue placeholder="Velg" /></SelectTrigger>
                <SelectContent>
                  {books?.map((b) => (<SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Fil (bilde eller PDF)</Label>
              <Input
                type="file"
                accept="image/*,application/pdf"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
            </div>
            <Button onClick={handleScan} disabled={scanning || !file} className="w-full">
              {scanning ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Skanner…</> : <><Upload className="h-4 w-4 mr-2" /> Skann med AI</>}
            </Button>
          </div>

          <div className="rounded-md border bg-card">
            <div className="p-3 border-b text-sm font-medium">Utkast</div>
            <ul className="divide-y">
              {drafts?.length === 0 && (
                <li className="p-4 text-sm text-muted-foreground">Ingen utkast ennå.</li>
              )}
              {drafts?.map((d) => (
                <li key={d.id}>
                  <button
                    onClick={() => setActiveDraftId(d.id)}
                    className={`w-full text-left p-3 hover:bg-accent/40 transition ${activeDraftId === d.id ? "bg-accent/60" : ""}`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="text-sm font-medium truncate">
                        {d.ai_suggestion?.description ?? "Uten beskrivelse"}
                      </div>
                      <StatusBadge status={d.status} />
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5 tabular">
                      {d.ai_suggestion?.amount_gross != null
                        ? `${d.ai_suggestion.amount_gross} ${d.ai_suggestion?.entry_date ?? ""}`
                        : new Date(d.created_at).toLocaleString("nb-NO")}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div>
          {activeDraft ? (
            <ReviewPanel
              orgId={orgId}
              draft={activeDraft}
              onConverted={() => {
                qc.invalidateQueries({ queryKey: ["receipt-drafts", orgId] });
                qc.invalidateQueries({ queryKey: ["entries", orgId] });
              }}
            />
          ) : (
            <div className="rounded-md border bg-card p-12 text-center text-muted-foreground">
              Velg eller skann et utkast for å se AI-forslaget her.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; variant: any }> = {
    draft: { label: "Utkast", variant: "secondary" },
    reviewed: { label: "Gjennomgått", variant: "default" },
    converted: { label: "Bokført", variant: "default" },
    rejected: { label: "Avvist", variant: "destructive" },
  };
  const m = map[status] ?? { label: status, variant: "outline" };
  return <Badge variant={m.variant} className="text-[10px]">{m.label}</Badge>;
}

function ReviewPanel({ orgId, draft, onConverted }: { orgId: string; draft: DraftRow; onConverted: () => void }) {
  const convertFn = useServerFn(convertDraftToEntry);
  const s = draft.ai_suggestion;
  const [form, setForm] = useState(() => ({
    entry_type: (s?.entry_type ?? "expense") as "income" | "expense",
    entry_date: s?.entry_date ?? new Date().toISOString().slice(0, 10),
    counterparty: s?.counterparty ?? "",
    description: s?.description ?? "",
    category: s?.category ?? "",
    category_group: s?.category_group ?? "",
    amount_gross: String(s?.amount_gross ?? ""),
    vat_rate: String(s?.vat_rate ?? "25"),
    vat_amount: String(s?.vat_amount ?? ""),
    amount_net: String(s?.amount_net ?? ""),
    payment_status: (s?.payment_status ?? "unpaid") as "paid" | "unpaid" | "partial",
    invoice_status: (s?.invoice_status ?? "none") as "none" | "draft" | "sent" | "overdue" | "paid",
    pre_company_expense: s?.pre_company_expense ?? false,
    notes: s?.notes ?? "",
  }));
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [mimeType, setMimeType] = useState<string>("");
  const [busy, setBusy] = useState(false);

  useQuery({
    queryKey: ["attachment-url", draft.attachment_id],
    enabled: !!draft.attachment_id,
    queryFn: async () => {
      const { data: att } = await supabase
        .from("finance_attachments")
        .select("storage_path, mime_type")
        .eq("id", draft.attachment_id!)
        .single();
      if (!att) return null;
      setMimeType(att.mime_type ?? "");
      const { data: url } = await supabase.storage
        .from("finance-attachments")
        .createSignedUrl(att.storage_path, 600);
      setSignedUrl(url?.signedUrl ?? null);
      return url?.signedUrl ?? null;
    },
  });

  const conf: Record<string, number> = {};
  const notes: Record<string, string> = {};
  for (const c of s?.confidence ?? []) {
    conf[c.field] = c.score;
    if (c.note) notes[c.field] = c.note;
  }

  function set<K extends keyof typeof form>(k: K, v: (typeof form)[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  function recalcFromGrossRate(gross: number, rate: number) {
    const vat = +(gross - gross / (1 + rate / 100)).toFixed(2);
    const net = +(gross - vat).toFixed(2);
    setForm((f) => ({ ...f, amount_gross: String(gross), vat_rate: String(rate), vat_amount: String(vat), amount_net: String(net) }));
  }

  async function approve() {
    if (draft.status === "converted") { toast.error("Allerede bokført"); return; }
    setBusy(true);
    try {
      await convertFn({
        data: {
          organizationId: orgId,
          draftId: draft.id,
          bookId: draft.book_id,
          entry: {
            entry_type: form.entry_type,
            entry_date: form.entry_date,
            counterparty: form.counterparty.trim() || null,
            description: form.description.trim(),
            category: form.category.trim() || null,
            category_group: form.category_group.trim() || null,
            amount_gross: Number(form.amount_gross.replace(",", ".")),
            vat_rate: Number(form.vat_rate.replace(",", ".")),
            vat_amount: Number(form.vat_amount.replace(",", ".")),
            amount_net: Number(form.amount_net.replace(",", ".")),
            payment_status: form.payment_status,
            invoice_status: form.invoice_status,
            pre_company_expense: form.pre_company_expense,
            notes: form.notes.trim() || null,
          },
        },
      });
      toast.success("Post opprettet");
      onConverted();
    } catch (err: any) {
      toast.error(err.message ?? "Klarte ikke opprette post");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
      <div className="rounded-md border bg-muted/30 min-h-[600px] flex items-center justify-center overflow-hidden">
        {signedUrl ? (
          mimeType === "application/pdf" ? (
            <iframe src={signedUrl} className="w-full h-[700px]" title="Dokument" />
          ) : (
            <img src={signedUrl} alt="Dokument" className="max-w-full max-h-[700px] object-contain" />
          )
        ) : (
          <div className="text-sm text-muted-foreground">Laster dokument…</div>
        )}
      </div>

      <div className="rounded-md border bg-card p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-medium">AI-forslag</div>
            <div className="text-xs text-muted-foreground">Kontroller hvert felt før du godkjenner.</div>
          </div>
          <StatusBadge status={draft.status} />
        </div>

        <FieldRow label="Type" confidence={conf.entry_type} note={notes.entry_type}>
          <Select value={form.entry_type} onValueChange={(v) => set("entry_type", v as any)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="expense">Utgift</SelectItem>
              <SelectItem value="income">Inntekt</SelectItem>
            </SelectContent>
          </Select>
        </FieldRow>

        <div className="grid grid-cols-2 gap-3">
          <FieldRow label="Dato" confidence={conf.entry_date} note={notes.entry_date}>
            <Input type="date" value={form.entry_date} onChange={(e) => set("entry_date", e.target.value)} />
          </FieldRow>
          <FieldRow label="Motpart" confidence={conf.counterparty} note={notes.counterparty}>
            <Input value={form.counterparty} onChange={(e) => set("counterparty", e.target.value)} />
          </FieldRow>
        </div>

        <FieldRow label="Beskrivelse" confidence={conf.description} note={notes.description}>
          <Input value={form.description} onChange={(e) => set("description", e.target.value)} />
        </FieldRow>

        <div className="grid grid-cols-2 gap-3">
          <FieldRow label="Kategori" confidence={conf.category} note={notes.category}>
            <Input value={form.category} onChange={(e) => set("category", e.target.value)} />
          </FieldRow>
          <FieldRow label="Kategorigruppe" confidence={conf.category_group} note={notes.category_group}>
            <Input value={form.category_group} onChange={(e) => set("category_group", e.target.value)} />
          </FieldRow>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <FieldRow label="Brutto" confidence={conf.amount_gross} note={notes.amount_gross}>
            <Input
              inputMode="decimal"
              value={form.amount_gross}
              onChange={(e) => set("amount_gross", e.target.value)}
              onBlur={() => {
                const g = Number(form.amount_gross.replace(",", "."));
                const r = Number(form.vat_rate.replace(",", "."));
                if (!isNaN(g) && !isNaN(r)) recalcFromGrossRate(g, r);
              }}
            />
          </FieldRow>
          <FieldRow label="MVA-sats %" confidence={conf.vat_rate} note={notes.vat_rate}>
            <Input
              inputMode="decimal"
              value={form.vat_rate}
              onChange={(e) => set("vat_rate", e.target.value)}
              onBlur={() => {
                const g = Number(form.amount_gross.replace(",", "."));
                const r = Number(form.vat_rate.replace(",", "."));
                if (!isNaN(g) && !isNaN(r)) recalcFromGrossRate(g, r);
              }}
            />
          </FieldRow>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <FieldRow label="MVA-beløp" confidence={conf.vat_amount} note={notes.vat_amount}>
            <Input inputMode="decimal" value={form.vat_amount} onChange={(e) => set("vat_amount", e.target.value)} />
          </FieldRow>
          <FieldRow label="Netto" confidence={conf.amount_net} note={notes.amount_net}>
            <Input inputMode="decimal" value={form.amount_net} onChange={(e) => set("amount_net", e.target.value)} />
          </FieldRow>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <FieldRow label="Betalingsstatus" confidence={conf.payment_status} note={notes.payment_status}>
            <Select value={form.payment_status} onValueChange={(v) => set("payment_status", v as any)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="unpaid">Ubetalt</SelectItem>
                <SelectItem value="paid">Betalt</SelectItem>
                <SelectItem value="partial">Delvis betalt</SelectItem>
              </SelectContent>
            </Select>
          </FieldRow>
          <FieldRow label="Fakturastatus" confidence={conf.invoice_status} note={notes.invoice_status}>
            <Select value={form.invoice_status} onValueChange={(v) => set("invoice_status", v as any)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Ingen</SelectItem>
                <SelectItem value="draft">Utkast</SelectItem>
                <SelectItem value="sent">Sendt</SelectItem>
                <SelectItem value="overdue">Forfalt</SelectItem>
                <SelectItem value="paid">Betalt</SelectItem>
              </SelectContent>
            </Select>
          </FieldRow>
        </div>

        <div className="flex items-center justify-between py-2 border-y">
          <div>
            <Label className="text-sm">Privat utlegg (før selskap)</Label>
            <div className="text-xs text-muted-foreground">Markeres når utlegget ble gjort før selskapet kunne betale.</div>
          </div>
          <Switch checked={form.pre_company_expense} onCheckedChange={(v) => set("pre_company_expense", v)} />
        </div>

        <FieldRow label="Notater" confidence={conf.notes} note={notes.notes}>
          <Textarea rows={2} value={form.notes} onChange={(e) => set("notes", e.target.value)} />
        </FieldRow>

        <Button onClick={approve} disabled={busy || draft.status === "converted"} className="w-full">
          {busy ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Oppretter…</> : <><Check className="h-4 w-4 mr-2" /> Godkjenn og opprett post</>}
        </Button>
      </div>
    </div>
  );
}

function FieldRow({ label, confidence, note, children }: { label: string; confidence?: number; note?: string; children: React.ReactNode }) {
  const pct = confidence != null ? Math.round(confidence * 100) : null;
  const color = pct == null ? "" : pct >= 80 ? "text-emerald-600" : pct >= 50 ? "text-amber-600" : "text-destructive";
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <Label className="text-xs">{label}</Label>
        {pct != null && <span className={`text-[10px] tabular ${color}`}>AI {pct}%</span>}
      </div>
      {children}
      {note && <div className="text-[10px] text-muted-foreground italic">{note}</div>}
    </div>
  );
}
