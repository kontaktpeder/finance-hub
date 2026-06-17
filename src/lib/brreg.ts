export type CompanyLookup = {
  name: string;
  orgNumber: string;
  address: string | null;
  postalCode: string | null;
  city: string | null;
  country: string;
  organizationForm: string | null;
  vatRegistered: boolean | null;
  email: string | null;
};

export function formatCompanyAddress(
  c: Pick<CompanyLookup, "address" | "postalCode" | "city">,
): string {
  const left = c.address?.trim() ?? "";
  const right = [c.postalCode, c.city].filter(Boolean).join(" ").trim();
  if (left && right) return `${left}, ${right}`;
  return left || right;
}
