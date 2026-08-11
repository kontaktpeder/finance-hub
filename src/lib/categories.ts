import { z } from "zod";

/** Controlled expense categories for margin and ops reporting. */
export const EXPENSE_CATEGORIES = [
  "Varekost",
  "Driftsutstyr",
  "Driftskostnader",
  "Administrasjon",
] as const;

/** Controlled income categories. */
export const INCOME_CATEGORIES = ["Salg"] as const;

export const CATEGORIES = [...INCOME_CATEGORIES, ...EXPENSE_CATEGORIES] as const;

export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];
export type IncomeCategory = (typeof INCOME_CATEGORIES)[number];
export type Category = (typeof CATEGORIES)[number];

export const CategorySchema = z.enum(CATEGORIES);
export const ExpenseCategorySchema = z.enum(EXPENSE_CATEGORIES);
export const IncomeCategorySchema = z.enum(INCOME_CATEGORIES);

/** Default category when type is known but value is missing. */
export function defaultCategoryForType(entryType: "income" | "expense"): Category {
  return entryType === "income" ? "Salg" : "Driftskostnader";
}

const ALIASES: Record<string, Category> = {
  varekost: "Varekost",
  "varekjøp": "Varekost",
  varekjop: "Varekost",
  råvarer: "Varekost",
  raavarer: "Varekost",
  ingredients: "Varekost",
  cogs: "Varekost",
  driftsutstyr: "Driftsutstyr",
  utstyr: "Driftsutstyr",
  equipment: "Driftsutstyr",
  driftskostnader: "Driftskostnader",
  driftskostnad: "Driftskostnader",
  drift: "Driftskostnader",
  opex: "Driftskostnader",
  administrasjon: "Administrasjon",
  admin: "Administrasjon",
  overhead: "Administrasjon",
  salg: "Salg",
  inntekter: "Salg",
  income: "Salg",
  revenue: "Salg",
};

/**
 * Map free-text / AI suggestions onto the controlled taxonomy.
 * Returns null if nothing confident can be inferred.
 */
export function normalizeCategory(raw: string | null | undefined): Category | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if ((CATEGORIES as readonly string[]).includes(trimmed)) return trimmed as Category;
  const key = trimmed.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "");
  return ALIASES[key] ?? ALIASES[trimmed.toLowerCase()] ?? null;
}

/** Ensure category_group mirrors the controlled category. */
export function syncCategoryGroup(category: Category | null | undefined): string | null {
  return category ?? null;
}

export function isVarekost(category: string | null | undefined): boolean {
  return normalizeCategory(category) === "Varekost" || category === "Varekost";
}

export const DOCUMENTATION_STATUSES = [
  "unknown",
  "missing",
  "incomplete",
  "complete",
] as const;

export type DocumentationStatus = (typeof DOCUMENTATION_STATUSES)[number];
export const DocumentationStatusSchema = z.enum(DOCUMENTATION_STATUSES);

export const DOCUMENTATION_STATUS_LABELS: Record<DocumentationStatus, string> = {
  unknown: "Ukjent",
  missing: "Mangler",
  incomplete: "Ufullstendig",
  complete: "Komplett",
};
