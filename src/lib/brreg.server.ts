import { formatCompanyAddress, type CompanyLookup } from "./brreg";
export { formatCompanyAddress };
export type { CompanyLookup };

export class BrregUnavailableError extends Error {
  constructor(message = "Brønnøysund er ikke tilgjengelig akkurat nå") {
    super(message);
    this.name = "BrregUnavailableError";
  }
}

const BASE = "https://data.brreg.no/enhetsregisteret/api/enheter";

type CacheEntry<T> = { value: T; expiresAt: number };
const searchCache = new Map<string, CacheEntry<CompanyLookup[]>>();
const orgCache = new Map<string, CacheEntry<CompanyLookup | null>>();
const SEARCH_TTL_MS = 24 * 60 * 60 * 1000;
const ORG_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function getCached<T>(map: Map<string, CacheEntry<T>>, key: string): T | undefined {
  const hit = map.get(key);
  if (!hit) return undefined;
  if (Date.now() > hit.expiresAt) {
    map.delete(key);
    return undefined;
  }
  return hit.value;
}

function setCached<T>(map: Map<string, CacheEntry<T>>, key: string, value: T, ttl: number) {
  map.set(key, { value, expiresAt: Date.now() + ttl });
}

export function mapBrregEnhet(e: any): CompanyLookup {
  const adr = e?.forretningsadresse ?? e?.postadresse ?? {};
  const addrLine = Array.isArray(adr?.adresse)
    ? adr.adresse.filter(Boolean).join(", ")
    : (adr?.adresse ?? null);
  return {
    name: e?.navn ?? "",
    orgNumber: String(e?.organisasjonsnummer ?? ""),
    address: addrLine || null,
    postalCode: adr?.postnummer ?? null,
    city: adr?.poststed ?? null,
    country: adr?.land ?? "Norge",
    organizationForm: e?.organisasjonsform?.kode ?? null,
    vatRegistered: typeof e?.registrertIMvaregisteret === "boolean" ? e.registrertIMvaregisteret : null,
    email: e?.epostadresse ?? null,
  };
}

const ORG_RE = /^\d{9}$/;

async function fetchJson(url: string): Promise<any> {
  let res: Response;
  try {
    res = await fetch(url, { headers: { accept: "application/json" } });
  } catch (err: any) {
    throw new BrregUnavailableError(err?.message ?? "Nettverksfeil mot Brreg");
  }
  if (res.status === 404) return null;
  if (!res.ok) throw new BrregUnavailableError(`Brreg svarte ${res.status}`);
  return res.json();
}

export async function getCompany(orgNumber: string): Promise<CompanyLookup | null> {
  const key = orgNumber.replace(/\s+/g, "");
  if (!ORG_RE.test(key)) return null;
  const cached = getCached(orgCache, key);
  if (cached !== undefined) return cached;
  const json = await fetchJson(`${BASE}/${key}`);
  const result = json ? mapBrregEnhet(json) : null;
  setCached(orgCache, key, result, ORG_TTL_MS);
  return result;
}

export async function searchCompanies(query: string): Promise<CompanyLookup[]> {
  const q = query.trim();
  if (!q) return [];
  const digits = q.replace(/\s+/g, "");
  if (ORG_RE.test(digits)) {
    const one = await getCompany(digits);
    return one ? [one] : [];
  }
  const key = q.toLowerCase();
  const cached = getCached(searchCache, key);
  if (cached) return cached;
  const url = `${BASE}?navn=${encodeURIComponent(q)}&size=20`;
  const json = await fetchJson(url);
  const items = (json?._embedded?.enheter ?? []) as any[];
  const list = items.map(mapBrregEnhet);
  setCached(searchCache, key, list, SEARCH_TTL_MS);
  return list;
}
