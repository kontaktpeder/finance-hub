import type { SupabaseClient } from "@supabase/supabase-js";

export type SellerSnapshot = {
  name: string;
  org_number: string | null;
  address: string | null;
  postal_code: string | null;
  city: string | null;
  country: string;
  bank_account: string | null;
};

export async function buildSellerSnapshot(
  supabase: SupabaseClient<any, any, any>,
  organizationId: string,
): Promise<SellerSnapshot> {
  const { data, error } = await supabase
    .from("organizations")
    .select("name, org_number, address, postal_code, city, country, bank_account")
    .eq("id", organizationId)
    .single();
  if (error || !data) throw new Error("Organisasjon ikke funnet");

  return {
    name: (data as any).name,
    org_number: (data as any).org_number ?? null,
    address: (data as any).address ?? null,
    postal_code: (data as any).postal_code ?? null,
    city: (data as any).city ?? null,
    country: (data as any).country ?? "Norge",
    bank_account: (data as any).bank_account ?? null,
  };
}

export function sellerSnapshotComplete(s: Partial<SellerSnapshot>): boolean {
  return Boolean(s.name && s.address && s.postal_code && s.city && s.bank_account);
}
