export type ConfidenceSeverity = "info" | "warning" | "critical";

export type ConfidenceStatus = "ok" | "warning" | "critical";

export type ConfidenceIssue = {
  id: string;
  type: string;
  severity: ConfidenceSeverity;
  title: string;
  description?: string;
  count?: number;
  action_url?: string;
};

export type ConfidenceSummary = {
  status: ConfidenceStatus;
  score: number;
  open_issues: number;
  issues: ConfidenceIssue[];
  checked_at: string;
};

export type ModuleAlert = {
  id: string;
  severity: ConfidenceSeverity;
  title: string;
  description: string;
  action_url: string;
  priority: number;
  source_module: "finance";
};
