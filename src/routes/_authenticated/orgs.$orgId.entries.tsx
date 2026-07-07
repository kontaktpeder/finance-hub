import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  Plus,
  Paperclip,
  ChevronDown,
  ChevronRight,
  Folder,
  ExternalLink,
  FileText,
  Download,
  AlertTriangle,
} from "lucide-react";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { toast } from "sonner";
import { formatNOK, formatDate } from "@/lib/format";
import { MissionReturnLink } from "@/components/finance/MissionReturnLink";

const Search = z.object({
  issue: z.string().optional(),
  return: z.string().optional(),
});

export const Route = createFileRoute("/_authenticated/orgs/$orgId/entries")({
  validateSearch: (s) => Search.parse(s),
  component: EntriesPage,
});


type PreFilter = "all" | "pre" | "ordinary";

type Entry = {
  id: string;
  voucher_number: string | null;
  entry_type: "income" | "expense";
  entry_date: string;
  description: string;
  counterparty: string | null;
  category: string | null;
  category_group: string | null;
  amount_gross: number | string;
  amount_net: number | string;
  vat_amount: number | string;
  vat_rate: number | string;
  payment_status: string;
  invoice_status: string;
  source_app: string | null;
  source_type: string | null;
  source_ref: string | null;
  external_url: string | null;
  notes: string | null;
  pre_company_expense: boolean;
};

function preCompanyLabel(pre: boolean): string {
  return pre ? "Før stiftelse" : "Ordinær";
}

function matchesPreFilter(entry: Entry, filter: PreFilter): boolean {
  if (filter === "all") return true;
  if (filter === "pre") return entry.pre_company_expense;
  return !entry.pre_company_expense;
}

function sumByPreAndType(entries: Entry[], pre: boolean) {
  let income = 0;
  let expense = 0;
  for (const e of entries) {
    if (e.pre_company_expense !== pre) continue;
    const amt = Number(e.amount_gross);
    if (e.entry_type === "income") income += amt;
    else expense += amt;
  }
  return { income, expense };
}

function exportEntriesCsv(entries: Entry[], orgId: string) {
  const header = [
    "voucher_number", "entry_type", "entry_date", "description", "counterparty",
    "category", "category_group", "amount_gross", "amount_net", "vat_rate", "vat_amount",
    "payment_status", "invoice_status", "pre_company_expense", "pre_company_label",
  ];
  const rows = [header.join(",")];
  for (const e of entries) {
    const row: Record<string, unknown> = {
      ...e,
      pre_company_expense: e.pre_company_expense ? "true" : "false",
      pre_company_label: preCompanyLabel(e.pre_company_expense),
    };
    rows.push(
      header.map((k) => {
        const v = row[k] ?? "";
        const s = String(v).replace(/"/g, '""');
        return /[,"\n]/.test(s) ? `"${s}"` : s;
      }).join(","),
    );
  }
  const blob = new Blob([rows.join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `poster-${orgId.slice(0, 8)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}


function EntriesPage() {
  const { orgId } = Route.useParams();
  const search = Route.useSearch();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [preFilter, setPreFilter] = useState<PreFilter>("all");

  const missingAttachmentFilter = search.issue === "missing_attachment";

  const { data: books } = useQuery({
    queryKey: ["books", orgId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("finance_books")
        .select("id, name, is_default")
        .eq("organization_id", orgId)
        .order("created_at");
      if (error) throw error;
      return data;
    },
  });

  const { data: entries, isLoading } = useQuery({
    queryKey: ["entries", orgId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("finance_entries")
        .select(
          "id, voucher_number, entry_type, entry_date, description, counterparty, category, category_group, amount_gross, amount_net, vat_amount, vat_rate, payment_status, invoice_status, source_app, source_type, source_ref, external_url, notes, pre_company_expense",
        )
        .eq("organization_id", orgId)
        .order("entry_date", { ascending: false })
        .limit(100);
      if (error) throw error;
      return data as Entry[];
    },
  });

  // Set of entry_ids that have at least one attachment (org-scoped).
  const { data: entryIdsWithAttachment } = useQuery({
    queryKey: ["entry-ids-with-attachment", orgId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("finance_attachments")
        .select("entry_id")
        .eq("organization_id", orgId)
        .not("entry_id", "is", null);
      if (error) throw error;
      return new Set((data ?? []).map((r: { entry_id: string }) => r.entry_id));
    },
  });

  const missingAttachmentIds = useMemo(() => {
    if (!entries || !entryIdsWithAttachment) return new Set<string>();
    const s = new Set<string>();
    for (const e of entries) {
      if (e.entry_type === "expense" && !entryIdsWithAttachment.has(e.id)) s.add(e.id);
    }
    return s;
  }, [entries, entryIdsWithAttachment]);

  const filteredEntries = useMemo(() => {
    let list = (entries ?? []).filter((e) => matchesPreFilter(e, preFilter));
    if (missingAttachmentFilter) {
      list = list.filter((e) => missingAttachmentIds.has(e.id));
    }
    return list;
  }, [entries, preFilter, missingAttachmentFilter, missingAttachmentIds]);

  const { income, expense } = useMemo(() => {
    const inc: Entry[] = [];
    const exp: Entry[] = [];
    for (const e of filteredEntries) {
      if (e.entry_type === "income") inc.push(e);
      else exp.push(e);
    }
    return { income: inc, expense: exp };
  }, [filteredEntries]);

  const hasAnyPre = useMemo(
    () => (entries ?? []).some((e) => e.pre_company_expense),
    [entries],
  );

  // Auto-expand the first missing entry when arriving from Confidence.
  const firstMissingId = useMemo(() => {
    if (!missingAttachmentFilter) return null;
    for (const e of filteredEntries) if (missingAttachmentIds.has(e.id)) return e.id;
    return null;
  }, [missingAttachmentFilter, filteredEntries, missingAttachmentIds]);

  useEffect(() => {
    if (firstMissingId) setExpandedId((cur) => cur ?? firstMissingId);
  }, [firstMissingId]);

  const isEmpty = !isLoading && filteredEntries.length === 0;

  return (
    <div className="p-3 sm:p-6 md:p-8 max-w-6xl">
      {search.return && (
        <div className="mb-3">
          <MissionReturnLink returnUrl={search.return} />
        </div>
      )}
      <header className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3 mb-4">
        <div className="min-w-0">
          <h1 className="text-xl sm:text-2xl font-semibold tracking-tight">Poster</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Gruppert på kategori. Klikk en post for detaljer.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button
            variant="outline"
            size="sm"
            onClick={() => exportEntriesCsv(filteredEntries, orgId)}
            disabled={filteredEntries.length === 0}
          >
            <Download className="h-4 w-4 sm:mr-2" />
            <span className="hidden sm:inline">CSV</span>
          </Button>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm">
                <Plus className="h-4 w-4 sm:mr-2" />
                <span className="hidden sm:inline">Ny post</span>
              </Button>
            </DialogTrigger>
            <NewEntryDialog
              orgId={orgId}
              books={books ?? []}
              onCreated={() => {
                qc.invalidateQueries({ queryKey: ["entries", orgId] });
                qc.invalidateQueries({ queryKey: ["entry-ids-with-attachment", orgId] });
                qc.invalidateQueries({ queryKey: ["dashboard", orgId] });
                qc.invalidateQueries({ queryKey: ["finance-confidence", orgId] });
                setOpen(false);
              }}
            />
          </Dialog>
        </div>
      </header>

      {missingAttachmentFilter && (
        <div className="mb-4 flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/5 px-3 py-2 text-sm">
          <AlertTriangle className="h-4 w-4 mt-0.5 text-warning shrink-0" />
          <div className="flex-1">
            Viser utgiftsposter som mangler bilag fra Finance Confidence.
          </div>
          <a
            href={`/orgs/${orgId}/entries${search.return ? `?return=${encodeURIComponent(search.return)}` : ""}`}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            Vis alle
          </a>
        </div>
      )}

      {hasAnyPre && (
        <div className="mb-4 space-y-3">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-muted-foreground">Vis:</span>
            <ToggleGroup
              type="single"
              value={preFilter}
              onValueChange={(v) => v && setPreFilter(v as PreFilter)}
              variant="outline"
              size="sm"
            >
              <ToggleGroupItem value="all">Alle</ToggleGroupItem>
              <ToggleGroupItem value="pre">Før stiftelse</ToggleGroupItem>
              <ToggleGroupItem value="ordinary">Ordinære</ToggleGroupItem>
            </ToggleGroup>
          </div>
          <PreCompanyTotals entries={entries ?? []} activeFilter={preFilter} />
        </div>
      )}

      {isLoading && (
        <div className="text-sm text-muted-foreground py-8 text-center">Laster…</div>
      )}

      {isEmpty && missingAttachmentFilter && (
        <div className="rounded-lg border bg-card p-8 text-center text-sm text-muted-foreground">
          Ingen poster med dette problemet funnet.
        </div>
      )}

      {!isLoading && !(isEmpty && missingAttachmentFilter) && (
        <div className="space-y-8">
          <Section
            title="Inntekter"
            subtitle="Salg, sponsor, støtte og andre innbetalinger"
            entries={income}
            tone="income"
            orgId={orgId}
            expandedId={expandedId}
            setExpandedId={setExpandedId}
            missingAttachmentIds={missingAttachmentIds}
          />
          <Section
            title="Utgifter"
            subtitle="Kostnader og utbetalinger"
            entries={expense}
            tone="expense"
            orgId={orgId}
            expandedId={expandedId}
            setExpandedId={setExpandedId}
            missingAttachmentIds={missingAttachmentIds}
          />
        </div>
      )}
    </div>
  );
}


function Section({
  title,
  subtitle,
  entries,
  tone,
  orgId,
  expandedId,
  setExpandedId,
}: {
  title: string;
  subtitle: string;
  entries: Entry[];
  tone: "income" | "expense";
  orgId: string;
  expandedId: string | null;
  setExpandedId: (id: string | null) => void;
}) {
  const groups = useMemo(() => {
    const map = new Map<string, Entry[]>();
    for (const e of entries) {
      const key = e.category_group || e.category || "Uten kategori";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(e);
    }
    return Array.from(map.entries())
      .map(([name, items]) => {
        const total = items.reduce((s, e) => s + Number(e.amount_gross), 0);
        const unpaid = items
          .filter((e) => e.payment_status === "unpaid")
          .reduce((s, e) => s + Number(e.amount_gross), 0);
        return { name, items, total, unpaid };
      })
      .sort((a, b) => b.total - a.total);
  }, [entries]);

  const sectionTotal = groups.reduce((s, g) => s + g.total, 0);
  const sectionUnpaid = groups.reduce((s, g) => s + g.unpaid, 0);

  return (
    <section className="rounded-lg border bg-card">
      <header className="flex items-center justify-between gap-3 p-4 sm:p-5 border-b">
        <div className="min-w-0">
          <h2 className="text-base sm:text-lg font-semibold tracking-tight">{title}</h2>
          <p className="hidden sm:block text-xs text-muted-foreground mt-0.5">{subtitle}</p>
        </div>
        <div className="text-right shrink-0">
          {sectionUnpaid > 0 && (
            <div className="text-[10px] sm:text-xs text-muted-foreground">
              {formatNOK(sectionUnpaid)} ubetalt
            </div>
          )}
          <div className="tabular text-lg sm:text-xl font-semibold">
            {formatNOK(sectionTotal)} <span className="text-xs text-muted-foreground font-normal">kr</span>
          </div>
        </div>
      </header>


      {groups.length === 0 ? (
        <div className="p-8 text-center text-sm text-muted-foreground">
          Ingen {tone === "income" ? "inntekter" : "utgifter"} ennå.
        </div>
      ) : (
        <div>
          {groups.map((g) => (
            <CategoryGroup
              key={g.name}
              group={g}
              orgId={orgId}
              expandedId={expandedId}
              setExpandedId={setExpandedId}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function CategoryGroup({
  group,
  orgId,
  expandedId,
  setExpandedId,
}: {
  group: { name: string; items: Entry[]; total: number; unpaid: number };
  orgId: string;
  expandedId: string | null;
  setExpandedId: (id: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b last:border-b-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2 sm:gap-3 px-4 sm:px-5 py-3 hover:bg-muted/40 transition-colors text-left"
      >
        {open ? (
          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
        )}
        <Folder className="hidden sm:block h-4 w-4 shrink-0 text-muted-foreground" />
        <span className="font-medium truncate min-w-0">{group.name}</span>
        <span className="text-xs text-muted-foreground shrink-0">{group.items.length}</span>
        <span className="ml-auto flex items-center gap-2 sm:gap-3 shrink-0">
          {group.unpaid > 0 && (
            <span className="hidden sm:inline text-xs text-muted-foreground">
              ({formatNOK(group.unpaid)} kr ubetalt)
            </span>
          )}
          <span className="tabular text-sm sm:text-base font-semibold">{formatNOK(group.total)} kr</span>
        </span>
      </button>
      {open && (
        <div className="bg-muted/20 sm:overflow-x-auto">
          <div className="hidden sm:grid sm:min-w-[900px] grid-cols-[90px_90px_1fr_1fr_110px_90px_110px_24px] gap-4 px-5 py-2 text-[11px] uppercase tracking-wider text-muted-foreground border-y">
            <span>Bilag</span>
            <span>Dato</span>
            <span>Motpart</span>
            <span>Beskrivelse</span>
            <span className="text-right">Beløp</span>
            <span>Status</span>
            <span>Faktura</span>
            <span></span>
          </div>
          <div className="sm:min-w-[900px]">
            {group.items.map((e) => (
              <EntryRow
                key={e.id}
                entry={e}
                orgId={orgId}
                expanded={expandedId === e.id}
                onToggle={() => setExpandedId(expandedId === e.id ? null : e.id)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function EntryRow({
  entry,
  orgId,
  expanded,
  onToggle,
}: {
  entry: Entry;
  orgId: string;
  expanded: boolean;
  onToggle: () => void;
}) {
  const isInvoice = entry.source_type === "invoice" && entry.source_ref;
  return (
    <>
      {/* Mobile card */}
      <button
        type="button"
        onClick={onToggle}
        className={`sm:hidden w-full flex items-center justify-between gap-3 px-4 py-3 text-left border-t hover:bg-muted/40 transition-colors ${
          expanded ? "bg-muted/40" : ""
        }`}
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 min-w-0">
            <span className="truncate text-sm font-medium">
              {entry.counterparty ?? entry.description}
            </span>
            <PreCompanyBadge pre={entry.pre_company_expense} />
          </div>
          <div className="truncate text-xs text-muted-foreground mt-0.5">
            {formatDate(entry.entry_date)}
            {entry.payment_status === "unpaid" && " · Ubetalt"}
          </div>
        </div>
        <div className="tabular text-sm font-semibold shrink-0">
          {formatNOK(entry.amount_gross)}
        </div>
      </button>


      {/* Desktop row */}
      <button
        type="button"
        onClick={onToggle}
        className={`hidden sm:grid w-full grid-cols-[90px_90px_1fr_1fr_110px_90px_110px_24px] gap-4 px-5 py-2.5 items-center text-sm text-left hover:bg-muted/40 transition-colors ${
          expanded ? "bg-muted/40" : ""
        }`}
      >
        <span
          className="tabular text-xs text-muted-foreground"
          title="Internt bilagsnummer i regnskapsboken"
        >
          {entry.voucher_number ?? "—"}
        </span>
        <span className="tabular text-xs text-muted-foreground">{formatDate(entry.entry_date)}</span>
        <span className="truncate">{entry.counterparty ?? "—"}</span>
        <span className="truncate text-muted-foreground flex items-center gap-2">
          <span className="truncate">{entry.description}</span>
          <PreCompanyBadge pre={entry.pre_company_expense} />
        </span>


        <span className="tabular text-right font-medium">{formatNOK(entry.amount_gross)} kr</span>
        <span>
          <StatusBadge kind="payment" value={entry.payment_status} />
        </span>
        <span>
          {isInvoice ? (
            <div className="flex flex-col gap-0.5">
              <span className="tabular text-xs font-medium">{entry.source_ref}</span>
              <StatusBadge kind="invoice" value={entry.invoice_status} />
            </div>
          ) : (
            <StatusBadge kind="invoice" value={entry.invoice_status} />
          )}
        </span>
        <span className="text-muted-foreground">
          {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        </span>
      </button>
      {expanded && <DetailPanel entry={entry} orgId={orgId} />}
    </>
  );
}


function StatusBadge({ kind, value }: { kind: "payment" | "invoice"; value: string }) {
  const map: Record<string, { label: string; variant: "default" | "secondary" | "outline" | "destructive" }> = {
    paid: { label: "Betalt", variant: "default" },
    unpaid: { label: "Ubetalt", variant: "secondary" },
    partial: { label: "Delvis", variant: "outline" },
    received: { label: "Mottatt", variant: "default" },
    sent: { label: "Sendt", variant: "outline" },
    pending: { label: "Avventer", variant: "secondary" },
    none: { label: "—", variant: "outline" },
  };
  const cfg = map[value] ?? { label: value, variant: "outline" as const };
  return (
    <Badge variant={cfg.variant} className="text-[10px] font-normal">
      {cfg.label}
    </Badge>
  );
}

function DetailPanel({ entry, orgId }: { entry: Entry; orgId: string }) {
  const queryClient = useQueryClient();
  const [uploading, setUploading] = useState(false);
  const inputRef = useState(() => ({ current: null as HTMLInputElement | null }))[0];

  const { data: attachments } = useQuery({
    queryKey: ["entry-attachments", entry.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("finance_attachments")
        .select("id, file_name, storage_path, mime_type, size_bytes")
        .eq("entry_id", entry.id);
      if (error) throw error;
      return data;
    },
  });

  async function openAttachment(path: string) {
    const { data, error } = await supabase.storage
      .from("finance-attachments")
      .createSignedUrl(path, 60 * 10);
    if (error) {
      toast.error("Klarte ikke åpne bilag");
      return;
    }
    window.open(data.signedUrl, "_blank");
  }

  async function uploadAttachment(file: File) {
    setUploading(true);
    try {
      const { data: u } = await supabase.auth.getUser();
      const path = `${orgId}/${entry.id}/${Date.now()}-${file.name}`;
      const { error: upErr } = await supabase.storage
        .from("finance-attachments")
        .upload(path, file);
      if (upErr) throw upErr;
      const { error: insErr } = await supabase.from("finance_attachments").insert({
        organization_id: orgId,
        entry_id: entry.id,
        storage_path: path,
        file_name: file.name,
        mime_type: file.type,
        size_bytes: file.size,
        uploaded_by: u.user?.id ?? null,
      });
      if (insErr) throw insErr;
      toast.success("Bilag lastet opp");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["entry-attachments", entry.id] }),
        queryClient.invalidateQueries({ queryKey: ["entries", orgId] }),
        queryClient.invalidateQueries({ queryKey: ["finance-confidence", orgId] }),
        queryClient.invalidateQueries({ queryKey: ["dashboard", orgId] }),
      ]);
    } catch (err: any) {
      toast.error(err?.message ?? "Kunne ikke laste opp bilag");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  const isInvoice = entry.source_type === "invoice" && entry.source_ref;

  return (
    <div className="border-t bg-background px-5 py-5">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Field label="Motpart" value={entry.counterparty} />
        <Field label="Kategori" value={entry.category} />
        <Field label="Kategori-gruppe" value={entry.category_group} />

        <Field label="Beløp brutto" value={`${formatNOK(entry.amount_gross)} kr`} />
        <Field label="Netto" value={`${formatNOK(entry.amount_net)} kr`} />
        <Field
          label="MVA"
          value={`${formatNOK(entry.vat_amount)} kr (${Number(entry.vat_rate)}%)`}
        />

        <Field label="Betalingsstatus" value={entry.payment_status} />
        <Field label="Fakturastatus" value={entry.invoice_status} />
        <Field
          label="Bilagsnummer"
          value={entry.voucher_number}
          help="Internt bilagsnummer i regnskapsboken"
        />
        <Field label="Stiftelse" value={preCompanyLabel(entry.pre_company_expense)} />


        {isInvoice ? (
          <>
            <Field label="Fakturanummer" value={entry.source_ref} />
            <div className="md:col-span-2">
              <p className="text-xs text-muted-foreground">
                Fakturanummer er kundens dokument. Bilagsnummer er intern rekkefølge i boken.
              </p>
            </div>
          </>
        ) : (
          <>
            <Field label="Kildeapp" value={entry.source_app} />
            <Field label="Kildetype" value={entry.source_type} />
            <Field label="Kildereferanse" value={entry.source_ref} />
          </>
        )}
      </div>

      {entry.external_url && (
        <div className="mt-4">
          <a
            href={entry.external_url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline"
          >
            <ExternalLink className="h-3 w-3" /> Åpne ekstern lenke
          </a>
        </div>
      )}

      {entry.notes && (
        <div className="mt-5">
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1">Notater</div>
          <p className="text-sm whitespace-pre-wrap">{entry.notes}</p>
        </div>
      )}

      <div className="mt-5">
        <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-2">Bilag</div>
        <input
          ref={(el) => {
            inputRef.current = el;
          }}
          type="file"
          accept="image/*,application/pdf"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void uploadAttachment(f);
          }}
        />
        {!attachments || attachments.length === 0 ? (
          <div className="flex items-center gap-3">
            <p className="text-sm text-muted-foreground">Mangler bilag.</p>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={uploading}
              onClick={() => inputRef.current?.click()}
            >
              <Paperclip className="h-3.5 w-3.5 mr-1.5" />
              {uploading ? "Laster opp…" : "Last opp bilag"}
            </Button>
          </div>
        ) : (
          <div className="space-y-1.5">
            {attachments.map((a) => (
              <button
                key={a.id}
                type="button"
                onClick={() => openAttachment(a.storage_path)}
                className="flex items-center gap-2 text-sm text-primary hover:underline"
              >
                <FileText className="h-3.5 w-3.5" />
                {a.file_name}
                <span className="text-xs text-muted-foreground">
                  ({Math.round((a.size_bytes ?? 0) / 1024)} kB)
                </span>
              </button>
            ))}
            <div className="pt-1">
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={uploading}
                onClick={() => inputRef.current?.click()}
              >
                <Paperclip className="h-3.5 w-3.5 mr-1.5" />
                {uploading ? "Laster opp…" : "Last opp flere"}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}


function Field({ label, value, help }: { label: string; value: string | null | undefined; help?: string }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-0.5">
        {label}
      </div>
      <div className="text-sm" title={help}>{value ?? <span className="text-muted-foreground">—</span>}</div>
      {help && <p className="text-[10px] text-muted-foreground mt-0.5">{help}</p>}
    </div>
  );
}

function NewEntryDialog({
  orgId,
  books,
  onCreated,
}: {
  orgId: string;
  books: Array<{ id: string; name: string; is_default: boolean }>;
  onCreated: () => void;
}) {
  const defaultBook = books.find((b) => b.is_default) ?? books[0];
  const [bookId, setBookId] = useState(defaultBook?.id ?? "");
  const [entryType, setEntryType] = useState<"income" | "expense">("expense");
  const [entryDate, setEntryDate] = useState(new Date().toISOString().slice(0, 10));
  const [description, setDescription] = useState("");
  const [counterparty, setCounterparty] = useState("");
  const [category, setCategory] = useState("");
  const [categoryGroup, setCategoryGroup] = useState("");
  const [amountGross, setAmountGross] = useState("");
  const [vatRate, setVatRate] = useState("25");
  const [notes, setNotes] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!bookId) {
      toast.error("Velg regnskapsbok");
      return;
    }
    setBusy(true);
    try {
      const gross = Number(amountGross.replace(",", "."));
      const rate = Number(vatRate);
      const vatAmount = +(gross - gross / (1 + rate / 100)).toFixed(2);
      const net = +(gross - vatAmount).toFixed(2);
      const { data: u } = await supabase.auth.getUser();
      const { data: entry, error } = await supabase
        .from("finance_entries")
        .insert({
          organization_id: orgId,
          book_id: bookId,
          entry_type: entryType,
          entry_date: entryDate,
          description: description.trim(),
          counterparty: counterparty.trim() || null,
          category: category.trim() || null,
          category_group: categoryGroup.trim() || null,
          amount_gross: gross,
          vat_rate: rate,
          vat_amount: vatAmount,
          amount_net: net,
          notes: notes.trim() || null,
          created_by: u.user?.id ?? null,
          created_via: "ui",
        })
        .select("id")
        .single();
      if (error) throw error;

      if (file && entry) {
        const path = `${orgId}/${entry.id}/${Date.now()}-${file.name}`;
        const { error: upErr } = await supabase.storage
          .from("finance-attachments")
          .upload(path, file);
        if (upErr) throw upErr;
        await supabase.from("finance_attachments").insert({
          organization_id: orgId,
          entry_id: entry.id,
          storage_path: path,
          file_name: file.name,
          mime_type: file.type,
          size_bytes: file.size,
          uploaded_by: u.user?.id ?? null,
        });
      }
      toast.success("Post lagt til");
      onCreated();
    } catch (err: any) {
      toast.error(err.message ?? "Klarte ikke lagre");
    } finally {
      setBusy(false);
    }
  }

  return (
    <DialogContent className="max-w-lg">
      <DialogHeader>
        <DialogTitle>Ny post</DialogTitle>
      </DialogHeader>
      <form onSubmit={submit} className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Type</Label>
            <Select value={entryType} onValueChange={(v) => setEntryType(v as "income" | "expense")}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="income">Inntekt</SelectItem>
                <SelectItem value="expense">Utgift</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Dato</Label>
            <Input
              type="date"
              value={entryDate}
              onChange={(e) => setEntryDate(e.target.value)}
              required
            />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label>Bok</Label>
          <Select value={bookId} onValueChange={setBookId}>
            <SelectTrigger>
              <SelectValue placeholder="Velg" />
            </SelectTrigger>
            <SelectContent>
              {books.map((b) => (
                <SelectItem key={b.id} value={b.id}>
                  {b.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Beskrivelse</Label>
          <Input value={description} onChange={(e) => setDescription(e.target.value)} required />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Motpart</Label>
            <Input value={counterparty} onChange={(e) => setCounterparty(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Kategori</Label>
            <Input value={category} onChange={(e) => setCategory(e.target.value)} />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label>Kategori-gruppe (valgfritt)</Label>
          <Input
            value={categoryGroup}
            onChange={(e) => setCategoryGroup(e.target.value)}
            placeholder="f.eks. Råvarer, Honorar, Transport"
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Beløp inkl. MVA</Label>
            <Input
              inputMode="decimal"
              value={amountGross}
              onChange={(e) => setAmountGross(e.target.value)}
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label>MVA-sats %</Label>
            <Input inputMode="decimal" value={vatRate} onChange={(e) => setVatRate(e.target.value)} />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label>Notater</Label>
          <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label className="flex items-center gap-2">
            <Paperclip className="h-3.5 w-3.5" /> Bilag (valgfritt)
          </Label>
          <Input
            type="file"
            accept="image/*,application/pdf"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
        </div>
        <DialogFooter>
          <Button type="submit" disabled={busy}>
            {busy ? "Lagrer…" : "Lagre post"}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}

function PreCompanyBadge({ pre }: { pre: boolean }) {
  if (!pre) return null;
  return (
    <Badge variant="outline" className="text-[10px] font-normal shrink-0">
      Før stiftelse
    </Badge>
  );
}

function PreCompanyTotals({
  entries,
  activeFilter,
}: {
  entries: Entry[];
  activeFilter: PreFilter;
}) {
  const pre = sumByPreAndType(entries, true);
  const ord = sumByPreAndType(entries, false);

  const rows =
    activeFilter === "pre"
      ? [{ label: "Før stiftelse", ...pre }]
      : activeFilter === "ordinary"
        ? [{ label: "Ordinære poster", ...ord }]
        : [
            { label: "Før stiftelse", ...pre },
            { label: "Ordinære poster", ...ord },
          ];

  if (rows.every((r) => r.income === 0 && r.expense === 0)) return null;

  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {rows.map((r) => (
        <div key={r.label} className="rounded-lg border bg-card px-4 py-3">
          <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1.5">
            {r.label}
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Inntekt</span>
            <span className="tabular">{formatNOK(r.income)} kr</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Utgift</span>
            <span className="tabular">−{formatNOK(r.expense)} kr</span>
          </div>
        </div>
      ))}
    </div>
  );
}

