# Finance Confidence v0

Finance Core kjører et sett automatiske kontroller mot organisasjonens data
og eksponerer resultatet både internt i Finance UI og eksternt via Platform
Module Contract v1 endepunktene `/module/confidence` og `/module/alerts`.

Formålet er å vise **mangler som bør sjekkes**, ikke å gi en godkjenning.

## Språkregler

Bruk:

- **Ingen kjente mangler funnet** — når `status = "ok"`.
- **Mangler som bør sjekkes** — når `status = "warning" | "critical"`.
- **Basert på automatiske kontroller. Erstatter ikke regnskapsfører.** —
  fotnote overalt hvor status vises.

Ikke bruk:

- «Klar til regnskapsfører»
- «Godkjent» / «Compliant» / «Compliance»
- Formuleringer som lover regnskapsmessig korrekthet.

## Sammendrag (ConfidenceSummary)

```ts
type ConfidenceStatus = "ok" | "warning" | "critical";

type ConfidenceIssue = {
  id: string;
  type: string;
  severity: "info" | "warning" | "critical";
  title: string;
  description?: string;
  count?: number;
  action_url?: string;
};

type ConfidenceSummary = {
  status: ConfidenceStatus;
  score: number;         // 0–100
  open_issues: number;
  issues: ConfidenceIssue[];
  checked_at: string;    // ISO
};
```

### Severity-tabell

| severity | betydning |
| --- | --- |
| `info` | Merknad, trenger ikkje handling nødvendigvis |
| `warning` | Bør sjekkast og rettast |
| `critical` | Sannsynleg datafeil eller manglande kobling — må sjåast på |

### Score-formel

Start på 100, trekk per issue:

| severity | trekk |
| --- | --- |
| info | 5 |
| warning | 10 |
| critical | 20 |

Score = `max(0, 100 - sum(trekk))`.

### Aggregert status

- `critical` hvis noen issue er critical
- ellers `warning` hvis noen issue er warning
- ellers `ok`

## v0 checks — SQL/logikk

Alle checks er scoped per `organization_id` og har ingen sideeffekter.

### 1. `missing_attachment` (warning)

**Formål:** Utgiftsposter utan bilag.

**Logikk:**
1. Hent `id` fra `finance_entries` der `entry_type = 'expense'`.
2. Slå opp `finance_attachments.entry_id` for desse id-ane.
3. Tell utgifter som ikkje har vedlegg.

```sql
-- steg 1
SELECT id FROM finance_entries
WHERE organization_id = :org_id AND entry_type = 'expense';

-- steg 2
SELECT entry_id FROM finance_attachments
WHERE organization_id = :org_id AND entry_id = ANY(:expense_ids);
```

**Handling:** Gå til utgiftspostar (`/orgs/:orgId/entries`).

### 2. `unbooked_bank_transaction` (critical)

**Formål:** Banktransaksjonar som ikkje er bokført.

**Logikk:**
1. Sjekk om organisasjonen har minst éin aktiv `bank_connections` (status = `active`).
   Hvis ikkje, skippes checken.
2. Tell `bank_transactions` der `finance_entry_id IS NULL`.

```sql
-- steg 1
SELECT id FROM bank_connections
WHERE organization_id = :org_id AND status = 'active' LIMIT 1;

-- steg 2
SELECT id FROM bank_transactions
WHERE organization_id = :org_id AND finance_entry_id IS NULL;
```

**Handling:** Gå til bank (`/orgs/:orgId/bank`).

### 3. `invoice_missing_accounting_link` (critical)

**Formål:** Sendte/betalte fakturaer manglar regnskap eller PDF.

**Logikk:**
1. Hent fakturaer der `status IN ('sent', 'paid')`.
2. Filtrer der `finance_entry_id IS NULL` eller `pdf_attachment_id IS NULL`.

```sql
SELECT id, finance_entry_id, pdf_attachment_id, status
FROM invoices
WHERE organization_id = :org_id
  AND status IN ('sent', 'paid')
  AND (finance_entry_id IS NULL OR pdf_attachment_id IS NULL);
```

**Handling:** Gå til fakturaer (`/orgs/:orgId/invoices`).

### 4. `stale_invoice_draft` (warning)

**Formål:** Fakturautkast som har ligge uendra meir enn 14 dager.

**Logikk:**
1. Sjekk `invoices.status = 'draft'` og `updated_at < nå - 14 dager`.

```sql
SELECT id FROM invoices
WHERE organization_id = :org_id
  AND status = 'draft'
  AND updated_at < (now() - interval '14 days');
```

**Handling:** Gå til fakturaer (`/orgs/:orgId/invoices`).

### 5. `income_without_documentation` (warning)

**Formål:** Inntektsposter som ikkje kjem frå faktura og manglar vedlegg.

**Logikk:**
1. Hent `id` fra `finance_entries` der `entry_type = 'income'`.
2. Ekskluder poster der `source_type = 'invoice'` og `source_ref` er satt (dei er allereie dokumenterte via faktura).
3. Slå opp `finance_attachments.entry_id` for resterande.
4. Tell inntekter utan vedlegg.

```sql
-- steg 1
SELECT id, source_type, source_ref FROM finance_entries
WHERE organization_id = :org_id AND entry_type = 'income';

-- steg 2
SELECT entry_id FROM finance_attachments
WHERE organization_id = :org_id AND entry_id = ANY(:income_ids);
```

**Handling:** Gå til inntektspostar (`/orgs/:orgId/entries`).

### 6. `duplicate_source_ref` (critical)

**Formål:** Dupliserte `(source_app, source_ref)` par i finance_entries.

**Logikk:**
1. Hent rader der `source_app` og `source_ref` begge er satt.
2. Grupper og tell. Par som finst meir enn éin gong er eit duplikat.

```sql
SELECT source_app, source_ref, COUNT(*) AS n
FROM finance_entries
WHERE organization_id = :org_id
  AND source_app IS NOT NULL
  AND source_ref IS NOT NULL
GROUP BY source_app, source_ref
HAVING COUNT(*) > 1;
```

**Handling:** Gå til postar (`/orgs/:orgId/entries`).

## Endepunkter

- `GET /api/public/v1/module/confidence` — returnerer `ConfidenceSummary`.
- `GET /api/public/v1/module/alerts` — mapper issues til Platform-kompatible `ModuleAlert`.
  Tom liste når det ikke er noen issues.

Begge krever `platform:read` scope. Org-id kommer alltid fra API-nøkkelen —
aldri fra query-parameter.

Se `docs/MODULE_COMPLIANCE.md` for endelige HTTP-signaturer.

## Hva Platform har lov til — og ikke lov til

### Platform får vise

- Alerts fra `/module/alerts` (tittel, beskrivelse, severity, action_url).
- Oppsummering fra `/module/confidence` (status, score, open_issues).
- Dype lenker til Finance (`org_confidence` deep link) så brukaren kan gå vidare.

### Platform får IKKE tolke eller vurdere

- Aldri presentere resultatet som «regnskapet er korrekt» eller «godkjent».
- Aldri bruke Finance-score til automatiske beslutningar som påverkar skatt, moms eller bokføring.
- Aldri vise `open_issues` utan samtidig å vise forklaringa og fotnoten om at dette er automatiske kontroller, ikkje regnskapsførar.
- Aldri vise `score` som ein prosent «riktighet» — kun som eit intern hjelpemiddel for prioritering.

Finance er ansvarlig for regnskapdata og tolkning. Platform er ansvarlig for å vise status og la brukaren navigere til Finance.
