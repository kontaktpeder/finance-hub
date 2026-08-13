import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  LedgerError,
  correctEntry,
  lockPeriod,
  recordPayment,
  unlockPeriod,
  voidEntry,
} from "@/lib/ledger.server";

async function requireEditor(supabase: any, organizationId: string, userId: string) {
  const { data: membership } = await supabase
    .from("organization_members")
    .select("role")
    .eq("organization_id", organizationId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!membership || !["owner", "admin", "editor"].includes((membership as any).role)) {
    throw new Error("Du har ikke tilgang.");
  }
  return (membership as any).role as string;
}

async function requireAdmin(supabase: any, organizationId: string, userId: string) {
  const role = await requireEditor(supabase, organizationId, userId);
  if (!["owner", "admin"].includes(role)) {
    throw new Error("Kun eier/admin kan låse eller låse opp perioder.");
  }
}

const VoidInput = z.object({
  organizationId: z.string().uuid(),
  entryId: z.string().uuid(),
  reason: z.string().min(3).max(2000),
  privateExpense: z.boolean().optional(),
});

export const voidEntryFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => VoidInput.parse(input))
  .handler(async ({ data, context }) => {
    await requireEditor(context.supabase, data.organizationId, context.userId);
    try {
      return await voidEntry(context.supabase, {
        organizationId: data.organizationId,
        entryId: data.entryId,
        reason: data.reason,
        actorId: context.userId,
        privateExpense: data.privateExpense,
        createdVia: "ui-void",
      });
    } catch (err) {
      if (err instanceof LedgerError) throw new Error(err.message);
      throw err;
    }
  });

const CorrectInput = z.object({
  organizationId: z.string().uuid(),
  entryId: z.string().uuid(),
  reason: z.string().min(3).max(2000),
  description: z.string().min(1).max(500),
  category: z.string().max(100).nullable().optional(),
  counterparty: z.string().max(200).nullable().optional(),
  amount_gross: z.number(),
  vat_rate: z.number().min(0).max(100),
  vat_amount: z.number().optional(),
  amount_net: z.number().optional(),
});

export const correctEntryFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => CorrectInput.parse(input))
  .handler(async ({ data, context }) => {
    await requireEditor(context.supabase, data.organizationId, context.userId);
    try {
      return await correctEntry(context.supabase, {
        organizationId: data.organizationId,
        entryId: data.entryId,
        reason: data.reason,
        actorId: context.userId,
        description: data.description,
        category: data.category,
        counterparty: data.counterparty,
        amount_gross: data.amount_gross,
        vat_rate: data.vat_rate,
        vat_amount: data.vat_amount,
        amount_net: data.amount_net,
        createdVia: "ui-correct",
      });
    } catch (err) {
      if (err instanceof LedgerError) throw new Error(err.message);
      throw err;
    }
  });

const PaymentInput = z.object({
  organizationId: z.string().uuid(),
  entryId: z.string().uuid(),
  amount: z.number().positive(),
  paidOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  kind: z.enum(["payment", "refund", "credit_note"]).optional(),
  paidBy: z.string().max(200).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
});

export const recordPaymentFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => PaymentInput.parse(input))
  .handler(async ({ data, context }) => {
    await requireEditor(context.supabase, data.organizationId, context.userId);
    try {
      return await recordPayment(context.supabase, {
        organizationId: data.organizationId,
        entryId: data.entryId,
        amount: data.amount,
        paidOn: data.paidOn,
        kind: data.kind,
        paidBy: data.paidBy,
        notes: data.notes,
        actorId: context.userId,
      });
    } catch (err) {
      if (err instanceof LedgerError) throw new Error(err.message);
      throw err;
    }
  });

const LockInput = z.object({
  organizationId: z.string().uuid(),
  year: z.number().int().min(2000).max(2100),
  month: z.number().int().min(1).max(12),
  reason: z.string().max(2000).optional(),
});

export const lockPeriodFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => LockInput.parse(input))
  .handler(async ({ data, context }) => {
    await requireAdmin(context.supabase, data.organizationId, context.userId);
    try {
      return await lockPeriod(context.supabase, {
        organizationId: data.organizationId,
        year: data.year,
        month: data.month,
        actorId: context.userId,
        reason: data.reason,
      });
    } catch (err) {
      if (err instanceof LedgerError) throw new Error(err.message);
      throw err;
    }
  });

const UnlockInput = z.object({
  organizationId: z.string().uuid(),
  year: z.number().int().min(2000).max(2100),
  month: z.number().int().min(1).max(12),
  reason: z.string().min(3).max(2000),
});

export const unlockPeriodFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => UnlockInput.parse(input))
  .handler(async ({ data, context }) => {
    await requireAdmin(context.supabase, data.organizationId, context.userId);
    try {
      return await unlockPeriod(context.supabase, {
        organizationId: data.organizationId,
        year: data.year,
        month: data.month,
        actorId: context.userId,
        reason: data.reason,
      });
    } catch (err) {
      if (err instanceof LedgerError) throw new Error(err.message);
      throw err;
    }
  });
