import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { isVarekost } from "@/lib/categories";

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export const Route = createFileRoute("/api/public/v1/reports/summary")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const token = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
        if (!token) return new Response("Unauthorized", { status: 401 });
        const hash = await sha256Hex(token);
        const { data: key } = await supabaseAdmin
          .from("api_keys")
          .select("revoked_at, api_clients(organization_id, allowed_scopes, revoked_at)")
          .eq("key_hash", hash)
          .maybeSingle();
        const client = key?.api_clients as any;
        if (!key || key.revoked_at || !client || client.revoked_at) return new Response("Invalid API key", { status: 401 });
        if (!client.allowed_scopes.includes("reports:read")) return new Response("Forbidden", { status: 403 });

        const url = new URL(request.url);
        const year = Number(url.searchParams.get("year") ?? new Date().getFullYear());
        const { data: entries, error } = await supabaseAdmin
          .from("finance_entries")
          .select("entry_type, entry_date, amount_gross, vat_amount, category, category_group")
          .eq("organization_id", client.organization_id)
          .gte("entry_date", `${year}-01-01`)
          .lt("entry_date", `${year + 1}-01-01`);
        if (error) return Response.json({ error: error.message }, { status: 500 });

        const months: Record<
          number,
          { income: number; expense: number; varekost: number; vat: number }
        > = {};
        for (let m = 1; m <= 12; m++) months[m] = { income: 0, expense: 0, varekost: 0, vat: 0 };

        let incomeTotal = 0;
        let expenseTotal = 0;
        let varekostTotal = 0;

        for (const e of entries ?? []) {
          const m = new Date(e.entry_date).getMonth() + 1;
          const amt = Number(e.amount_gross);
          if (e.entry_type === "income") {
            months[m].income += amt;
            incomeTotal += amt;
          } else {
            months[m].expense += amt;
            expenseTotal += amt;
            if (isVarekost(e.category) || isVarekost(e.category_group)) {
              months[m].varekost += amt;
              varekostTotal += amt;
            }
          }
          months[m].vat += Number(e.vat_amount);
        }

        const grossProfit = incomeTotal - varekostTotal;
        const grossMargin = incomeTotal > 0 ? grossProfit / incomeTotal : null;

        return Response.json({
          year,
          months,
          totals: {
            income: incomeTotal,
            expense: expenseTotal,
            varekost: varekostTotal,
            gross_profit: grossProfit,
            gross_margin: grossMargin,
          },
        });
      },
    },
  },
});
