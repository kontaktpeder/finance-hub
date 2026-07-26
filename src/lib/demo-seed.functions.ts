import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const InputSchema = z.object({
  organizationId: z.string().uuid(),
});

async function assertEditor(
  supabase: any,
  userId: string,
  organizationId: string,
): Promise<void> {
  const { data: membership, error } = await supabase
    .from("organization_members")
    .select("role")
    .eq("organization_id", organizationId)
    .eq("user_id", userId)
    .maybeSingle();
  if (
    error ||
    !membership ||
    !["owner", "admin", "editor"].includes(membership.role)
  ) {
    throw new Error("Du har ikke tilgang til å legge inn demodata.");
  }
}

function isoDaysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

/** Seed a small realistic dataset so Mission/dashboard are not empty. Idempotent per org. */
export const seedFinanceDemoData = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => InputSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertEditor(supabase, userId, data.organizationId);

    const { count, error: countErr } = await supabase
      .from("finance_entries")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", data.organizationId)
      .eq("source_app", "demo-seed");
    if (countErr) throw new Error(countErr.message);
    if ((count ?? 0) > 0) {
      return { seeded: false as const, reason: "already_seeded" as const };
    }

    const { data: book, error: bookErr } = await supabase
      .from("finance_books")
      .select("id")
      .eq("organization_id", data.organizationId)
      .eq("is_default", true)
      .maybeSingle();
    if (bookErr) throw new Error(bookErr.message);
    if (!book) throw new Error("Ingen standard-bok funnet. Opprett en bok først.");

    const rows = [
      {
        organization_id: data.organizationId,
        book_id: book.id,
        entry_type: "income" as const,
        description: "Demo: Faktura — Kunde Alpha (kampanje)",
        counterparty: "Kunde Alpha AS",
        category: "Consulting",
        category_group: "Kunde Alpha",
        entry_date: isoDaysAgo(12),
        amount_gross: 45000,
        vat_rate: 25,
        payment_status: "paid" as const,
        created_via: "manual",
        created_by: userId,
        source_app: "demo-seed",
        source_type: "demo",
        source_ref: "demo-income-1",
        notes: "Demodata — trygt å slette",
      },
      {
        organization_id: data.organizationId,
        book_id: book.id,
        entry_type: "income" as const,
        description: "Demo: Faktura — Kunde Beta (retainer)",
        counterparty: "Kunde Beta AS",
        category: "Retainer",
        category_group: "Kunde Beta",
        entry_date: isoDaysAgo(5),
        amount_gross: 28000,
        vat_rate: 25,
        payment_status: "unpaid" as const,
        due_date: isoDaysAgo(2),
        created_via: "manual",
        created_by: userId,
        source_app: "demo-seed",
        source_type: "demo",
        source_ref: "demo-income-2",
        notes: "Demodata — forfalt ubetalt for Mission-alert",
      },
      {
        organization_id: data.organizationId,
        book_id: book.id,
        entry_type: "expense" as const,
        description: "Demo: Annonsekostnad Meta",
        counterparty: "Meta Platforms",
        category: "Ads",
        category_group: "Kunde Alpha",
        entry_date: isoDaysAgo(8),
        amount_gross: 9200,
        vat_rate: 25,
        payment_status: "paid" as const,
        created_via: "manual",
        created_by: userId,
        source_app: "demo-seed",
        source_type: "demo",
        source_ref: "demo-expense-1",
        notes: "Demodata — mangler bilag med vilje",
      },
      {
        organization_id: data.organizationId,
        book_id: book.id,
        entry_type: "expense" as const,
        description: "Demo: Underleverandør foto",
        counterparty: "Studio Nord",
        category: "Production",
        category_group: "Kunde Beta",
        entry_date: isoDaysAgo(3),
        amount_gross: 15000,
        vat_rate: 25,
        payment_status: "unpaid" as const,
        created_via: "manual",
        created_by: userId,
        source_app: "demo-seed",
        source_type: "demo",
        source_ref: "demo-expense-2",
        notes: "Demodata",
      },
    ];

    const { error: insErr } = await supabase.from("finance_entries").insert(rows);
    if (insErr) throw new Error(insErr.message);

    return { seeded: true as const, count: rows.length };
  });
