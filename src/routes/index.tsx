import { createFileRoute, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Finance Core – regnskap for flere organisasjoner" },
      { name: "description", content: "Selvstendig regnskaps- og bilagssystem med API for eksterne prosjekter." },
      { property: "og:title", content: "Finance Core" },
      { property: "og:description", content: "Regnskap, bilag og API for dine prosjekter." },
    ],
  }),
  ssr: false,
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw redirect({ to: "/auth" });
    throw redirect({ to: "/app" });
  },
  component: () => null,
});
