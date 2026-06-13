import { z } from "zod";

export const InvoiceLineSchema = z.object({
  description: z.string().min(1).max(500),
  quantity: z.number().positive(),
  unit_price: z.number(),
  vat_rate: z.number().min(0).max(100).default(25),
});

export const InvoiceCreateSchema = z.object({
  issue_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  customer_name: z.string().min(1).max(200),
  customer_org_number: z.string().max(32).nullable().optional(),
  customer_email: z.string().email().max(200).nullable().optional(),
  customer_address: z.string().max(500).nullable().optional(),
  lines: z.array(InvoiceLineSchema).min(1),
});

export const InvoicePatchSchema = z.object({
  issue_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  customer_name: z.string().min(1).max(200).optional(),
  customer_org_number: z.string().max(32).nullable().optional(),
  customer_email: z.string().email().max(200).nullable().optional(),
  customer_address: z.string().max(500).nullable().optional(),
  lines: z.array(InvoiceLineSchema).min(1).optional(),
});

export const MarkPaidSchema = z.object({
  status: z.literal("paid"),
});

export type InvoiceLineInput = z.infer<typeof InvoiceLineSchema>;
export type InvoiceCreateInput = z.infer<typeof InvoiceCreateSchema>;
export type InvoicePatchInput = z.infer<typeof InvoicePatchSchema>;
