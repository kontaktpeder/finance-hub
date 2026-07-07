import type {
  ConfidenceSeverity,
  ConfidenceSummary,
  ModuleAlert,
} from "./confidence.types";

function severityToPriority(s: ConfidenceSeverity, tie: number): number {
  const base = s === "critical" ? 1 : s === "warning" ? 10 : 20;
  return base + tie;
}

export function confidenceToAlerts(
  summary: ConfidenceSummary,
  baseUrl: string,
  orgId: string,
): ModuleAlert[] {
  if (summary.issues.length === 0) return [];
  return summary.issues.map((issue, idx) => {
    const raw = issue.action_url ?? `/orgs/${orgId}/dashboard`;
    const absolute = raw.startsWith("http") ? raw : `${baseUrl}${raw}`;
    return {
      id: `finance.${issue.id}`,
      severity: issue.severity,
      title: issue.title,
      description: issue.description ?? "",
      action_url: absolute,
      priority: severityToPriority(issue.severity, idx),
      source_module: "finance",
    };
  });
}
