import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { FileText, Image as ImageIcon, ExternalLink } from "lucide-react";
import { formatDate, formatNOK } from "@/lib/format";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/orgs/$orgId/attachments")({
  component: AttachmentsPage,
});

type AttachmentRow = {
  id: string;
  file_name: string;
  storage_path: string;
  mime_type: string | null;
  size_bytes: number | null;
  created_at: string;
  entry_id: string | null;
  finance_entries: {
    id: string;
    voucher_number: string | null;
    counterparty: string | null;
    description: string;
    amount_gross: number | string;
    entry_date: string;
  } | null;
};

function AttachmentsPage() {
  const { orgId } = Route.useParams();

  const { data, isLoading } = useQuery({
    queryKey: ["attachments", orgId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("finance_attachments")
        .select(
          "id, file_name, storage_path, mime_type, size_bytes, created_at, entry_id, finance_entries:entry_id ( id, voucher_number, counterparty, description, amount_gross, entry_date )",
        )
        .eq("organization_id", orgId)
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return data as unknown as AttachmentRow[];
    },
  });

  async function open(path: string) {
    const { data, error } = await supabase.storage
      .from("finance-attachments")
      .createSignedUrl(path, 60 * 10);
    if (error) {
      toast.error("Klarte ikke åpne bilag");
      return;
    }
    window.open(data.signedUrl, "_blank");
  }

  return (
    <div className="p-4 sm:p-6 md:p-8 max-w-6xl">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Bilagsbibliotek</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Alle kvitteringer og fakturaer som er lastet opp.
        </p>
      </header>

      {isLoading && <p className="text-sm text-muted-foreground">Laster…</p>}
      {!isLoading && (!data || data.length === 0) && (
        <div className="rounded-md border bg-card p-10 text-center text-sm text-muted-foreground">
          Ingen bilag ennå.
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {data?.map((a) => {
          const isImage = (a.mime_type ?? "").startsWith("image/");
          return (
            <button
              key={a.id}
              type="button"
              onClick={() => open(a.storage_path)}
              className="text-left rounded-lg border bg-card hover:border-primary/50 hover:shadow-sm transition-all p-4 group"
            >
              <div className="flex items-start gap-3">
                <div className="h-10 w-10 rounded bg-muted flex items-center justify-center shrink-0">
                  {isImage ? (
                    <ImageIcon className="h-5 w-5 text-muted-foreground" />
                  ) : (
                    <FileText className="h-5 w-5 text-muted-foreground" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="font-medium text-sm truncate group-hover:text-primary">
                    {a.file_name}
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {formatDate(a.created_at)} · {Math.round((a.size_bytes ?? 0) / 1024)} kB
                  </div>
                </div>
                <ExternalLink className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>

              {a.finance_entries ? (
                <div className="mt-3 pt-3 border-t text-xs space-y-0.5">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground tabular">
                      {a.finance_entries.voucher_number}
                    </span>
                    <span className="tabular font-medium">
                      {formatNOK(a.finance_entries.amount_gross)} kr
                    </span>
                  </div>
                  <div className="truncate">
                    {a.finance_entries.counterparty ?? a.finance_entries.description}
                  </div>
                </div>
              ) : (
                <div className="mt-3 pt-3 border-t text-xs text-muted-foreground">
                  Ikke koblet til post
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
