import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/orgs/$orgId/")({
  beforeLoad: ({ params }) => {
    throw redirect({
      to: "/orgs/$orgId/scan",
      params: { orgId: params.orgId },
      replace: true,
    });
  },
});
