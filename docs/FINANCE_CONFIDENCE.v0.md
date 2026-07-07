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

### Score

Start på 100, trekk fra per issue:

| severity | trekk |
| --- | --- |
| info | 5 |
| warning | 10 |
| critical | 20 |

Minimum 0.

### Aggregert status

- `critical` hvis noen issue er critical
- ellers `warning` hvis noen issue er warning
- ellers `ok`

## v0 checks

| id | severity | betingelse |
| --- | --- | --- |
| `missing_attachment` | warning | Utgiftsposter uten noe vedlegg |
| `unbooked_bank_transaction` | critical | Bank-transaksjoner uten `finance_entry_id` (kun hvis org har aktiv `bank_connections`) |
| `invoice_missing_accounting_link` | critical | Fakturaer i `sent`/`paid` uten `finance_entry_id` eller `pdf_attachment_id` |
| `stale_invoice_draft` | warning | Fakturautkast eldre enn 14 dager |
| `income_without_documentation` | warning | Inntektsposter som ikke kommer fra faktura og mangler vedlegg |
| `duplicate_source_ref` | critical | Samme `(source_app, source_ref)` brukt flere ganger |

Alle checks er scoped per `organization_id` og har ingen sideeffekter.

## Endepunkter

Se `docs/MODULE_COMPLIANCE.md` for endelige signaturer.

- `GET /api/public/v1/module/confidence` — returnerer `ConfidenceSummary`.
- `GET /api/public/v1/module/alerts` — mapper issues til Platform-alerts.
  Tom liste når det ikke er noen issues.

Begge krever `platform:read` scope. Org-id kommer alltid fra API-nøkkelen —
aldri fra query-parameter.
