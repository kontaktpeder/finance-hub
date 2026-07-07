import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/orgs/$orgId/")({
  beforeLoad: ({ params }) => {
    throw redirect({
      to: "/orgs/$orgId/dashboard",
      params: { orgId: params.orgId },
      replace: true,
    });
  },
});
