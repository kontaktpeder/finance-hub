export function formatNOK(value: number | string | null | undefined) {
  const n = typeof value === "string" ? Number(value) : (value ?? 0);
  if (!Number.isFinite(n)) return "0,00";
  return new Intl.NumberFormat("nb-NO", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}

export function formatDate(value: string | Date | null | undefined) {
  if (!value) return "";
  const d = typeof value === "string" ? new Date(value) : value;
  return new Intl.DateTimeFormat("nb-NO", {
    year: "numeric",
    month: "short",
    day: "2-digit",
  }).format(d);
}

export function monthLabel(year: number, month: number) {
  return new Intl.DateTimeFormat("nb-NO", { month: "long", year: "numeric" }).format(
    new Date(year, month - 1, 1),
  );
}
