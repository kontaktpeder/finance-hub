import type { ConfidenceIssue, ConfidenceStatus, ConfidenceSummary } from "./confidence.types";
import { ALL_CHECKS, type CheckCtx } from "./confidence-checks.server";

export function computeScore(issues: ConfidenceIssue[]): number {
  if (issues.length === 0) return 100;
  let score = 100;
  for (const i of issues) {
    if (i.severity === "warning") score -= 10;
    else if (i.severity === "critical") score -= 20;
    else if (i.severity === "info") score -= 5;
  }
  return Math.max(0, score);
}

export function aggregateStatus(issues: ConfidenceIssue[]): ConfidenceStatus {
  if (issues.some((i) => i.severity === "critical")) return "critical";
  if (issues.some((i) => i.severity === "warning")) return "warning";
  return "ok";
}

export async function runFinanceConfidence(
  ctx: CheckCtx,
): Promise<ConfidenceSummary> {
  const results = await Promise.all(ALL_CHECKS.map((c) => c(ctx)));
  const issues = results.filter((r): r is ConfidenceIssue => r !== null);
  return {
    status: aggregateStatus(issues),
    score: computeScore(issues),
    open_issues: issues.length,
    issues,
    checked_at: new Date().toISOString(),
  };
}
