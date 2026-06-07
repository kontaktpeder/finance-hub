import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Paperclip } from "lucide-react";
import { toast } from "sonner";
import { formatNOK, formatDate } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/orgs/$orgId/entries")({
  component: EntriesPage,
});

function EntriesPage() {
  const { orgId } = Route.useParams();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);

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
        .select("id, voucher_number, entry_type, entry_date, description, counterparty, category, amount_gross, vat_amount, payment_status, source_app, source_ref")
        .eq("organization_id", orgId)
        .order("entry_date", { ascending: false })
        .limit(200);
      if (error) throw error;
      return data;
    },
  });

  return (
    <div className="p-8 max-w-6xl">
      <header className="flex items-end justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Poster</h1>
          <p className="text-sm text-muted-foreground mt-1">Inntekter og utgifter, sortert på dato.</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="h-4 w-4 mr-2" /> Ny post</Button>
          </DialogTrigger>
          <NewEntryDialog
            orgId={orgId}
            books={books ?? []}
            onCreated={() => {
              qc.invalidateQueries({ queryKey: ["entries", orgId] });
              qc.invalidateQueries({ queryKey: ["dashboard", orgId] });
              setOpen(false);
            }}
          />
        </Dialog>
      </header>

      <div className="rounded-md border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[100px]">Bilag</TableHead>
              <TableHead className="w-[100px]">Dato</TableHead>
              <TableHead>Beskrivelse</TableHead>
              <TableHead>Kategori</TableHead>
              <TableHead className="text-right">Brutto</TableHead>
              <TableHead className="text-right">MVA</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Kilde</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">Laster…</TableCell></TableRow>
            )}
            {!isLoading && entries?.length === 0 && (
              <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">Ingen poster ennå.</TableCell></TableRow>
            )}
            {entries?.map((e) => (
              <TableRow key={e.id}>
                <TableCell className="tabular text-xs">{e.voucher_number}</TableCell>
                <TableCell className="tabular text-xs">{formatDate(e.entry_date)}</TableCell>
                <TableCell>
                  <div className="font-medium">{e.description}</div>
                  {e.counterparty && <div className="text-xs text-muted-foreground">{e.counterparty}</div>}
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">{e.category ?? "—"}</TableCell>
                <TableCell className={`tabular text-right ${e.entry_type === "income" ? "text-success" : ""}`}>
                  {e.entry_type === "expense" ? "−" : ""}{formatNOK(e.amount_gross)}
                </TableCell>
                <TableCell className="tabular text-right text-muted-foreground">{formatNOK(e.vat_amount)}</TableCell>
                <TableCell>
                  <Badge variant={e.payment_status === "paid" ? "default" : e.payment_status === "unpaid" ? "secondary" : "outline"} className="text-xs">
                    {e.payment_status === "paid" ? "Betalt" : e.payment_status === "unpaid" ? "Ubetalt" : e.payment_status}
                  </Badge>
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {e.source_app ? `${e.source_app}` : <span className="text-muted-foreground/40">manuell</span>}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function NewEntryDialog({ orgId, books, onCreated }: { orgId: string; books: Array<{ id: string; name: string; is_default: boolean }>; onCreated: () => void }) {
  const defaultBook = books.find((b) => b.is_default) ?? books[0];
  const [bookId, setBookId] = useState(defaultBook?.id ?? "");
  const [entryType, setEntryType] = useState<"income" | "expense">("expense");
  const [entryDate, setEntryDate] = useState(new Date().toISOString().slice(0, 10));
  const [description, setDescription] = useState("");
  const [counterparty, setCounterparty] = useState("");
  const [category, setCategory] = useState("");
  const [amountGross, setAmountGross] = useState("");
  const [vatRate, setVatRate] = useState("25");
  const [notes, setNotes] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!bookId) { toast.error("Velg regnskapsbok"); return; }
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
        const { error: upErr } = await supabase.storage.from("finance-attachments").upload(path, file);
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
      <DialogHeader><DialogTitle>Ny post</DialogTitle></DialogHeader>
      <form onSubmit={submit} className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Type</Label>
            <Select value={entryType} onValueChange={(v) => setEntryType(v as "income" | "expense")}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="income">Inntekt</SelectItem>
                <SelectItem value="expense">Utgift</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Dato</Label>
            <Input type="date" value={entryDate} onChange={(e) => setEntryDate(e.target.value)} required />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label>Bok</Label>
          <Select value={bookId} onValueChange={setBookId}>
            <SelectTrigger><SelectValue placeholder="Velg" /></SelectTrigger>
            <SelectContent>
              {books.map((b) => (<SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>))}
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
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Beløp inkl. MVA</Label>
            <Input inputMode="decimal" value={amountGross} onChange={(e) => setAmountGross(e.target.value)} required />
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
          <Label className="flex items-center gap-2"><Paperclip className="h-3.5 w-3.5" /> Bilag (valgfritt)</Label>
          <Input type="file" accept="image/*,application/pdf" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        </div>
        <DialogFooter>
          <Button type="submit" disabled={busy}>{busy ? "Lagrer…" : "Lagre post"}</Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
