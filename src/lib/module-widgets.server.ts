// Live widget data for Finance Core module widgets.
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type WidgetPayload = {
  id: string;
  data: Record<string, unknown>;
};

// Compute [startISO, endISO) for the current month in Europe/Oslo.
function currentMonthRangeOslo(): { start: string; end: string } {
  const now = new Date();
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Oslo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const year = Number(parts.find((p) => p.type === "year")!.value);
  const month = Number(parts.find((p) => p.type === "month")!.value);
  const start = `${year}-${String(month).padStart(2, "0")}-01`;
  const nextYear = month === 12 ? year + 1 : year;
  const nextMonth = month === 12 ? 1 : month + 1;
  const end = `${nextYear}-${String(nextMonth).padStart(2, "0")}-01`;
  return { start, end };
}

export async function computeUnpaidInvoices(organizationId: string): Promise<WidgetPayload> {
  const { count, error } = await supabaseAdmin
    .from("invoices")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", organizationId)
    .eq("status", "sent");
  if (error) throw new Error(error.message);
  return { id: "unpaid_invoices", data: { count: count ?? 0 } };
}

export async function computeMonthRevenue(organizationId: string): Promise<WidgetPayload> {
  const { start, end } = currentMonthRangeOslo();
  const { data, error } = await supabaseAdmin
    .from("finance_entries")
    .select("amount_gross")
    .eq("organization_id", organizationId)
    .eq("entry_type", "income")
    .gte("entry_date", start)
    .lt("entry_date", end);
  if (error) throw new Error(error.message);
  const total = (data ?? []).reduce((sum, row: any) => sum + Number(row.amount_gross ?? 0), 0);
  return {
    id: "month_revenue",
    data: { amount: total, currency: "NOK", period_start: start, period_end: end },
  };
}

export async function computeWidget(
  id: string,
  organizationId: string,
): Promise<WidgetPayload | null> {
  switch (id) {
    case "unpaid_invoices":
      return computeUnpaidInvoices(organizationId);
    case "month_revenue":
      return computeMonthRevenue(organizationId);
    default:
      return null;
  }
}
