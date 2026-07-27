import { Outlet, createFileRoute } from "@tanstack/react-router";

/** Layout so /auth/callback can render via <Outlet /> (not the login form). */
export const Route = createFileRoute("/auth")({
  ssr: false,
  component: () => <Outlet />,
});
