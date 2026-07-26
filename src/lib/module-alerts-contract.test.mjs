import assert from "node:assert/strict";
import { describe, it } from "node:test";

/** Mirror of confidenceToAlerts field contract (Module Contract v1.1). */
function confidenceToAlerts(summary, baseUrl, orgId) {
  if (summary.issues.length === 0) return [];
  return summary.issues.map((issue, idx) => {
    const raw = issue.action_url ?? `/orgs/${orgId}/dashboard`;
    const absolute = raw.startsWith("http") ? raw : `${baseUrl}${raw}`;
    const base = issue.severity === "critical" ? 1 : issue.severity === "warning" ? 10 : 20;
    return {
      id: `finance.${issue.id}`,
      severity: issue.severity,
      title: issue.title,
      description: issue.description ?? "",
      action_url: absolute,
      priority: base + idx,
      source_module: "finance",
    };
  });
}

describe("Finance /module/alerts contract shape", () => {
  it("maps confidence issues to required alert fields", () => {
    const alerts = confidenceToAlerts(
      {
        issues: [
          {
            id: "unpaid-1",
            severity: "warning",
            title: "Ubetalt faktura",
            description: "Forfaller snart",
            action_url: "/orgs/abc/invoices",
          },
        ],
      },
      "https://finance.example.com",
      "abc",
    );
    assert.equal(alerts.length, 1);
    const a = alerts[0];
    assert.equal(a.id, "finance.unpaid-1");
    assert.equal(a.severity, "warning");
    assert.equal(a.source_module, "finance");
    assert.equal(typeof a.priority, "number");
    assert.equal(a.action_url, "https://finance.example.com/orgs/abc/invoices");
    assert.ok(a.title);
  });

  it("returns empty list when no issues", () => {
    assert.deepEqual(
      confidenceToAlerts({ issues: [] }, "https://finance.example.com", "abc"),
      [],
    );
  });
});
