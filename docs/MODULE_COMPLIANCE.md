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
