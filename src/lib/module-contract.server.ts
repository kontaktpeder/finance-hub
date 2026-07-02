// Finance Core — Platform Module Contract v1 implementation.
// Spec (frozen): platform-nexus/docs/MODULE_CONTRACT.v1.md

export const MODULE_CONTRACT_VERSION = "1.0" as const;

export const financeModuleInfo = {
  module_slug: "finance",
  module_name: "Finance Core",
  module_version: "1.0.0",
  contract_version: MODULE_CONTRACT_VERSION,
  capabilities: [
    "finance.entries",
    "finance.invoices",
    "finance.attachments",
    "finance.reports",
    "finance.banking",
    "platform.organization.read",
    "platform.organization.verify",
  ],
} as const;

export const financeModuleDeepLinks = {
  org_home: "/orgs/{org_id}",
  org_entries: "/orgs/{org_id}/entries",
  org_reports: "/orgs/{org_id}/reports",
} as const;

export const financeModuleWidgets = [
  {
    id: "unpaid_invoices",
    title: "Unpaid invoices",
    description: "Open invoices awaiting payment.",
    deep_link: "org_home",
    capabilities_required: ["finance.invoices"],
    placeholder: false,
  },
  {
    id: "month_revenue",
    title: "Monthly revenue",
    description: "Revenue summary for the current month.",
    deep_link: "org_reports",
    capabilities_required: ["finance.reports"],
    placeholder: false,
  },
] as const;


export function moduleAppBaseUrl(request: Request): string {
  const envUrl = process.env.PUBLIC_APP_URL;
  if (envUrl) return envUrl.replace(/\/$/, "");
  const url = new URL(request.url);
  return `${url.protocol}//${url.host}`;
}

export function isUuid(v: unknown): v is string {
  return (
    typeof v === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v)
  );
}

export function jsonError(status: number, code: string, message: string): Response {
  return Response.json(
    {
      contract_version: MODULE_CONTRACT_VERSION,
      error: { code, message },
    },
    { status },
  );
}

export function withContract<T extends Record<string, unknown>>(body: T) {
  return { contract_version: MODULE_CONTRACT_VERSION, ...body };
}

export function orgHomeDeepLink(baseUrl: string, orgId: string): string {
  return `${baseUrl}/orgs/${orgId}`;
}
