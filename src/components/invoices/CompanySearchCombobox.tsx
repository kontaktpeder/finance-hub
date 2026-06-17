import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { searchCompaniesFn } from "@/lib/brreg.functions";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Search, Loader2 } from "lucide-react";
import { toast } from "sonner";
import type { CompanyLookup } from "@/lib/brreg.server";

type Props = {
  onSelect: (company: CompanyLookup) => void;
  disabled?: boolean;
  placeholder?: string;
};

export function CompanySearchCombobox({ onSelect, disabled, placeholder }: Props) {
  const search = useServerFn(searchCompaniesFn);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<CompanyLookup[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reqIdRef = useRef(0);

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    timerRef.current = setTimeout(async () => {
      const myId = ++reqIdRef.current;
      try {
        const res = await search({ data: { q } });
        if (myId !== reqIdRef.current) return;
        if (res.ok) {
          setResults(res.companies);
          setOpen(true);
        } else {
          toast.error("Kunne ikke hente virksomheter akkurat nå. Fyll inn manuelt.");
          setResults([]);
        }
      } catch {
        if (myId !== reqIdRef.current) return;
        toast.error("Kunne ikke hente virksomheter akkurat nå. Fyll inn manuelt.");
      } finally {
        if (myId === reqIdRef.current) setLoading(false);
      }
    }, 300);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [query, search]);

  function pick(c: CompanyLookup) {
    onSelect(c);
    setOpen(false);
    setQuery("");
    setResults([]);
  }

  return (
    <Popover open={open && results.length > 0} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => results.length > 0 && setOpen(true)}
            placeholder={placeholder ?? "Søk firmanavn eller org.nr."}
            disabled={disabled}
            className="pl-8"
          />
          {loading && (
            <Loader2 className="absolute right-2.5 top-2.5 h-4 w-4 animate-spin text-muted-foreground" />
          )}
        </div>
      </PopoverTrigger>
      <PopoverContent
        className="p-0 w-[--radix-popover-trigger-width] max-h-80 overflow-auto"
        align="start"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <ul className="py-1">
          {results.map((c) => (
            <li key={c.orgNumber}>
              <button
                type="button"
                onClick={() => pick(c)}
                className="w-full text-left px-3 py-2 hover:bg-accent focus:bg-accent focus:outline-none"
              >
                <div className="text-sm font-medium">{c.name}</div>
                <div className="text-xs text-muted-foreground">
                  {c.orgNumber}
                  {c.address ? ` · ${c.address}` : ""}
                  {c.postalCode ? `, ${c.postalCode} ${c.city ?? ""}` : ""}
                </div>
              </button>
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
