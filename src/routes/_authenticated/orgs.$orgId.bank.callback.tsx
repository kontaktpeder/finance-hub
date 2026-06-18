import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import { useServerFn } from "@tanstack/react-start";
import { completeBankConnectFn } from "@/lib/banking.functions";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";

const Search = z.object({
  connectionId: z.string().uuid().optional(),
  resource_id: z.string().optional(),
  result: z.string().optional(),
});

export const Route = createFileRoute("/_authenticated/orgs/$orgId/bank/callback")({
  validateSearch: (s) => Search.parse(s),
  component: BankCallback,
});

function BankCallback() {
  const { orgId } = Route.useParams();
  const search = Route.useSearch();
  const navigate = useNavigate();
  const complete = useServerFn(completeBankConnectFn);
  const ranRef = useRef(false);

  useEffect(() => {
    if (ranRef.current) return;
    ranRef.current = true;
    (async () => {
      if (!search.connectionId) {
        toast.error("Manglar connectionId i callback");
        navigate({ to: "/orgs/$orgId/bank", params: { orgId } });
        return;
      }
      if (search.result && search.result.toUpperCase() !== "OK") {
        toast.error(`Bank-consent feila: ${search.result}`);
        navigate({ to: "/orgs/$orgId/bank", params: { orgId } });
        return;
      }
      try {
        const r = await complete({ data: { orgId, connectionId: search.connectionId } });
        toast.success(`Bank tilkobla. ${r.accounts} konto(ar), ${r.transactions} transaksjon(ar) henta.`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        toast.error(`Kunne ikkje fullføre tilkobling: ${msg}`);
      } finally {
        navigate({ to: "/orgs/$orgId/bank", params: { orgId } });
      }
    })();
  }, [search, orgId, complete, navigate]);

  return (
    <div className="p-8 flex items-center gap-3 text-sm text-muted-foreground">
      <Loader2 className="h-4 w-4 animate-spin" /> Fullfører bank-tilkobling…
    </div>
  );
}
