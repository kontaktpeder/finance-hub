# Module Contract v1 — Finance Core Compliance

Finance Core is the **reference implementation** of the Platform Core
Module Contract v1. Spec (frozen): `platform-nexus/docs/MODULE_CONTRACT.v1.md`.

Contract version: **1.0**
Module slug: **finance**

## Endpoints

All endpoints live under `/api/public/v1/module/*` and return
`contract_version: "1.0"` in every response (success and error).

| Endpoint | Method | Scope required |
| --- | --- | --- |
| `/module/health` | GET | — (public) |
| `/module/info` | GET | — (public) |
| `/module/organization` | GET | `platform:read` |
| `/module/organization/{org_id}` | GET | `platform:verify` |
| `/module/widgets?ids=...` | GET | `platform:read` |

## Widgets endpoint

`GET /api/public/v1/module/widgets?ids=unpaid_invoices,month_revenue`

- Requires `platform:read`.
- `ids` is a comma-separated list; unknown ids are silently dropped.
  Omit `ids` to get every known widget.
- Response: `{ contract_version: "1.0", widgets: [{ id, data }] }`.

Widget payloads:

- `unpaid_invoices` → `{ count: number }` (invoices with `status = 'sent'`).
- `month_revenue` → `{ amount, currency: "NOK", period_start, period_end }`
  summing `finance_entries.amount_gross` where `entry_type = 'income'`
  and `entry_date` falls inside the current month in `Europe/Oslo`.


### Verify semantics

`GET /module/organization/{org_id}` returns **404** (not 403) when
`org_id` does not match the API key's organization. This avoids leaking
membership of other organizations.

## Capabilities

`GET /module/info` returns:

```json
{
  "capabilities": [
    "finance.entries",
    "finance.invoices",
    "finance.attachments",
    "finance.reports",
    "finance.banking",
    "platform.organization.read",
    "platform.organization.verify"
  ]
}
```

## Deep links

`deep_links.org_home` → `{base_url}/orgs/{org_id}`
`deep_links.org_entries` → `{base_url}/orgs/{org_id}/entries`
`deep_links.org_reports` → `{base_url}/orgs/{org_id}/reports`

## Widgets (Platform dashboard)

`GET /module/info` includes `widgets[]` per MODULE_CONTRACT.v1.

All widgets are `placeholder: true` in v1 — Platform shows titles only; live data comes later.

| id | title | deep_link |
| --- | --- | --- |
| `unpaid_invoices` | Unpaid invoices | `org_home` |
| `month_revenue` | Monthly revenue | `org_reports` |

## curl examples

```bash
BASE="https://<finance-url>"
KEY="fc_live_..."   # must include platform:read + platform:verify

# Public
curl -s "$BASE/api/public/v1/module/health" | jq .contract_version   # "1.0"
curl -s "$BASE/api/public/v1/module/info"   | jq .module_slug        # "finance"

# Authenticated — read own org
curl -s "$BASE/api/public/v1/module/organization" \
  -H "Authorization: Bearer $KEY" | jq .

# Verify own org
ORG=$(curl -s "$BASE/api/public/v1/module/organization" \
  -H "Authorization: Bearer $KEY" | jq -r .organization.id)

curl -s "$BASE/api/public/v1/module/organization/$ORG" \
  -H "Authorization: Bearer $KEY" | jq .verified   # true

# Wrong org → 404
curl -s -o /dev/null -w "%{http_code}\n" \
  "$BASE/api/public/v1/module/organization/00000000-0000-4000-8000-000000000001" \
  -H "Authorization: Bearer $KEY"                                   # 404
```

## Error shape

```json
{
  "contract_version": "1.0",
  "error": { "code": "organization_not_found", "message": "..." }
}
```

## Issuing a Platform verify key

In the Finance UI: **Org → API-nøkler → Ny nøkkel**, name it
`platform-verify`, and grant only `platform:read` + `platform:verify`.
