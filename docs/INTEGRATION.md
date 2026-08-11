# Finance Core – Integration Guide

Finance Core er **source of truth** for regnskap. Eksterne prosjekter (f.eks. Gold of Sicily) sender data inn via et public REST API med API-nøkkel.

## Base URL

```
https://project--71d47bcd-142c-4661-be6b-2d7bcddce79c.lovable.app
```

(Bytt til custom domain når satt opp.)

## Auth

Alle kall krever header:

```
Authorization: Bearer fc_live_xxxxxxxx_xxxxxxxxxxxxxxxxxxxxxxxx
```

Nøkkelen identifiserer én `api_client`, som er låst til **én organisasjon**. Alle skriv/lese gjelder kun denne organisasjonen.

## Scopes

| Scope | Tilgang |
|---|---|
| `entries:read` | `GET /api/public/v1/entries`, `GET /api/public/v1/reports/summary` |
| `entries:write` | `POST /api/public/v1/entries`, `DELETE /api/public/v1/entries/{entry_id}`, `POST /api/public/v1/ai/scan-receipt` |
| `reports:read` | `GET /api/public/v1/reports/summary` |
| `attachments:write` | `POST /api/public/v1/attachments`, `DELETE /api/public/v1/attachments/{attachment_id}` |
| `invoices:read` | `GET /invoices`, `GET /invoices/:id`, `GET /invoices/:id/pdf` |
| `invoices:write` | `POST /invoices`, `PATCH /invoices/:id`, `POST /invoices/:id/send` |
| `platform:read` | `GET /api/public/v1/module/organization` |
| `platform:verify` | `GET /api/public/v1/module/organization/{org_id}` |

## Module Contract v1

Finance implementerer Platform Core Module Contract v1 under `/api/public/v1/module/*` (`health`, `info`, `organization`, `organization/{org_id}`). Alle responser inkluderer `contract_version: "1.0"`. Verify-endepunktet returnerer **404** (ikke 403) når `org_id` ikke matcher API-nøkkelen. Se `docs/MODULE_COMPLIANCE.md`. Spesifikasjon: Platform Core `MODULE_CONTRACT.v1.md`.

## Faktura → regnskapspost (binders)

Når en faktura sendes (`POST /invoices/:id/send`), genereres PDF-en, lagres som `finance_attachments`-rad, og kobles automatisk til den nye `finance_entries`-raden via `entry_id`. Dette gjør at `GET /entries` returnerer `has_attachment: true` (binders vises i UI) for fakturaposter. En safety-net-repair kjøres etter send, og igjen når fakturaen markeres som betalt, slik at koblingen alltid er konsistent.



## Endpoints

### POST /api/public/v1/entries

Oppretter en regnskapspost (inntekt eller utgift). Hvis `book_id` utelates brukes default book for organisasjonen.

**Inntekt:**

```bash
curl -X POST "$BASE/api/public/v1/entries" \
  -H "Authorization: Bearer $KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "entry_type": "income",
    "entry_date": "2026-06-07",
    "description": "Klink popup Oslo juni",
    "amount_gross": 10000,
    "vat_rate": 25,
    "category": "Salg",
    "source_app": "gold-of-sicily",
    "source_type": "popup",
    "source_ref": "klink-oslo-2026-06"
  }'
```

**Utgift:**

```bash
curl -X POST "$BASE/api/public/v1/entries" \
  -H "Authorization: Bearer $KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "entry_type": "expense",
    "entry_date": "2026-06-07",
    "description": "Råvarer",
    "amount_gross": 2500,
    "vat_rate": 15,
    "category": "Varekost",
    "source_app": "gold-of-sicily",
    "source_ref": "raavarer-2026-06"
  }'
```

**Felt-regler:**
- `category` / `category_group` bruker kontrollert taksonomi: `Salg`, `Varekost`, `Driftsutstyr`, `Driftskostnader`, `Administrasjon`. `category_group` speiler `category`.
- Aliaser (f.eks. `Varekjøp`) normaliseres til taksonomien.
- `external_url` må være full URL (`https://...`) — relative paths feiler validering.
- `vat_rate` / `vat_amount`: utelat eller send tall, **ikke `null`**. Hvis `vat_amount` utelates beregnes det fra `amount_gross` og `vat_rate`.
- `amount_net` beregnes hvis utelatt.
- Pre-company: `pre_company_expense`, `paid_by`, `reimbursed`, `accountant_approved`, `documentation_status` (`unknown` | `missing` | `incomplete` | `complete`).

### PATCH /api/public/v1/entries/{entry_id}

Oppdaterer kategori, beskrivelse, før-stiftelse-felter m.m. Krever scope `entries:write`.

```bash
curl -X PATCH "$BASE/api/public/v1/entries/<uuid>" \
  -H "Authorization: Bearer $KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "category": "Varekost",
    "description": "Mozzarella — Smak av Italia",
    "pre_company_expense": true,
    "paid_by": "Peder",
    "documentation_status": "incomplete"
  }'
```

### GET /api/public/v1/entries

```bash
curl "$BASE/api/public/v1/entries?limit=100" -H "Authorization: Bearer $KEY"
```

Hver entry inkluderer `attachment_count` (number) og `has_attachment` (boolean) — bruk dette for paperclip-ikon og «mangler bilag»-visning.

### GET /api/public/v1/entries/{entry_id}/attachments

```bash
curl "$BASE/api/public/v1/entries/<entry-uuid>/attachments" \
  -H "Authorization: Bearer $KEY"
```

- Krever scope `entries:read`
- Returnerer `{ "data": [...] }` med signed `url` per bilag (TTL 10 minutter)
- Tom liste returneres som `{ "data": [] }` med 200
- 404 hvis entry ikke finnes i organisasjonen
- Hvert element inneholder: `id`, `entry_id`, `file_name` (+ alias `filename`), `mime_type`, `size_bytes` (+ alias `size`), `url`, `uploaded_at` (+ alias `created_at`)



### GET /api/public/v1/reports/summary

```bash
curl "$BASE/api/public/v1/reports/summary?year=2026" -H "Authorization: Bearer $KEY"
```

Returnerer månedlig sum av income/expense/varekost/vat, pluss `totals` med `gross_profit` og `gross_margin` (bruttofortjeneste / salgsinntekter).

### POST /api/public/v1/attachments

Last opp bilag/kvittering. `multipart/form-data` med felt `file` (påkrevd) og `entry_id` (valgfri uuid).

```bash
curl -X POST "$BASE/api/public/v1/attachments" \
  -H "Authorization: Bearer $KEY" \
  -F "file=@kvittering.pdf" \
  -F "entry_id=<uuid>"
```

Returnerer `{ "data": { ... attachment ... } }` med status 201.

### DELETE /api/public/v1/attachments/{attachment_id}

Sletter et bilag (storage-fil + metadata).

```bash
curl -X DELETE "$BASE/api/public/v1/attachments/<uuid>" \
  -H "Authorization: Bearer $KEY"
```

- Krever scope `attachments:write`
- Returnerer `{ "data": { "deleted": true, "id": "..." } }`
- 404 hvis bilaget ikke finnes i organisasjonen

### DELETE /api/public/v1/entries/{entry_id}

Sletter en regnskapspost og alle tilknyttede bilag.

```bash
curl -X DELETE "$BASE/api/public/v1/entries/<uuid>" \
  -H "Authorization: Bearer $KEY"
```

- Krever scope `entries:write`
- Returnerer `{ "data": { "deleted": true, "id": "...", "attachments_deleted": N } }`
- 404 hvis posten ikke finnes i organisasjonen

### POST /api/public/v1/ai/scan-receipt

Stateless AI-kvitteringsskanning. Returnerer kun et forslag — **ingen** entry, attachment eller draft opprettes i Finance Core.

- Krever scope `entries:write`
- Request: `multipart/form-data` med felt `file` (påkrevd)
- Støttede typer: JPEG, PNG, WebP, HEIC, PDF (maks 25 MB)

```bash
curl -X POST "$BASE/api/public/v1/ai/scan-receipt" \
  -H "Authorization: Bearer $KEY" \
  -F "file=@kvittering.jpg"
```

Response (200):

```json
{
  "data": {
    "entry_type": "expense",
    "entry_date": "2026-06-07",
    "counterparty": "Rema 1000",
    "description": "Råvarer",
    "category": "Varekost",
    "amount_gross": 249.0,
    "vat_rate": 0.15,
    "payment_status": "paid",
    "invoice_status": "received",
    "before_company_founded": false,
    "notes": null,
    "confidence": 0.87
  }
}
```

Merk: `vat_rate` returneres som desimal (0.15 = 15%). Typisk klientflyt: scan → bruker godkjenner → `POST /entries` → `POST /attachments` med `entry_id`.

Feil: `400 invalid_request` (mangler fil / ugyldig type / ugyldig multipart), `401` (auth), `403` (scope), `500 scan_failed` (AI feilet).


## Idempotens

Bruk `source_app` + `source_ref` for å unngå duplikater:

- `source_app = gold-of-sicily`
- `source_ref = klink-oslo-2026-06`

Det er en unique index på `(organization_id, source_app, source_ref)`. Duplikat-POST returnerer **200** med `{ "data": <eksisterende entry>, "duplicate": true }` — klient kan trygt re-kjøre eksport uten å håndtere 400. Ingen ny rad opprettes.

## Feilkoder

| Kode | Betydning |
|---|---|
| 400 | Valideringsfeil |
| 401 | Manglende eller ugyldig API-nøkkel |
| 403 | Nøkkelen mangler nødvendig scope |
| 404 | Ressurs ikke funnet (f.eks. `entry_id` i annen org) |
| 500 | Intern feil |

## Hva klienten IKKE skal bygge

Disse hører hjemme i Finance Core, ikke i klient-appen:

- Full regnskaps-UI (poster-liste, filtre, redigering)
- Medlemsstyring og roller
- CSV/SAF-T eksport
- API-nøkkel-administrasjon
- Bilag/attachment-galleri på tvers av poster

Klient-appen skal kun:
1. Sende **utgifter** og ad-hoc inntekter inn med `source_app` + `source_ref` via `/entries`
2. Sende **popup-salg / fakturerbar inntekt** via **Invoices API** (`POST /invoices` → `POST /invoices/:id/send`) — ikke direkte `/entries`
3. Hente `summary` for enkel status
4. Lenke brukeren videre til Finance Core for full visning

> **Gold of Sicily:** Popup-oppgjør mot JAJAJA AS går via faktura-flyten. Den eldre `popup_settlement`-posten via `/entries` er avviklet — se `supabase/scripts/cleanup-popup-settlement-duplicates.sql` for opprydding av historiske duplikater.

---

## Fakturaer (Invoices API)

Utgående fakturaer med automatisk nummerering, PDF-lagring og låsing ved utsendelse.

### Statusflyt

`draft` → `sent` → `paid`

- Fakturanummer tildeles ved overgang til `sent` (format `YYYY-NNNN`)
- PDF genereres én gang ved `send` og lagres i `finance-attachments`
- Etter `sent` kan kun `status` endres til `paid`
- Beløp, kunde, linjer og PDF kan ikke endres etter utsendelse

### POST /api/public/v1/invoices

Scope: `invoices:write`. Oppretter et utkast.

```json
{
  "issue_date": "2026-06-13",
  "due_date": "2026-06-27",
  "customer_name": "Kunde AS",
  "customer_org_number": "123456789",
  "customer_email": "faktura@kunde.no",
  "customer_address": "Gate 1, 0150 Oslo",
  "lines": [
    { "description": "Konsulenttimer", "quantity": 5, "unit_price": 1200, "vat_rate": 25 }
  ]
}
```

Returnerer `{ "data": { "id", "status": "draft", "invoice_number": null, ... } }`.

### GET /api/public/v1/invoices

Scope: `invoices:read`. Query: `?limit=100&status=sent`.

### GET /api/public/v1/invoices/:id

Scope: `invoices:read`. Returnerer faktura med `invoice_lines`.

### PATCH /api/public/v1/invoices/:id

Scope: `invoices:write`.

- **Draft:** send valgfrie header-felt og/eller `lines`-array. Hele linjelisten erstattes.
- **Mark paid:** `{ "status": "paid" }` (kun gyldig fra `sent`). Oppdaterer også den koblede `finance_entry` til `payment_status=paid` og setter `paid_at` (i dag).

### POST /api/public/v1/invoices/:id/send

Scope: `invoices:write`. Genererer fakturanummer, lager PDF, låser faktura.

Valgfri body: `{ "source_app": "gold-of-sicily" }`. Hvis utelatt brukes en slug av API-klientens navn.

**Automatisk regnskap:** Når en faktura sendes, opprettes det automatisk en `finance_entry` (inntekt, ubetalt) i organisasjonens standard `finance_book`. Posten kobles tilbake via `invoices.finance_entry_id`. Hvis en post med samme `(organization_id, source_app, source_type='invoice', source_ref=invoice_number)` allerede finnes, gjenbrukes den (idempotent). Krever at organisasjonen har en bok med `is_default=true`.

### GET /api/public/v1/invoices/:id/pdf

Scope: `invoices:read`. Returnerer den lagrede PDF-en (regenereres ikke).

