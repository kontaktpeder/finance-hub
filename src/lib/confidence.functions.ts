import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { ConfidenceSummary } from "./confidence/confidence.types";

const Input = z.object({ orgId: z.string().uuid() });

export const getFinanceConfidenceFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => Input.parse(input))
  .handler(async ({ data, context }): Promise<ConfidenceSummary> => {
    // Verify caller is a member of the org before running checks.
    const { data: member, error: mErr } = await context.supabase
      .from("organization_members")
      .select("user_id")
      .eq("organization_id", data.orgId)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (mErr) throw new Error(mErr.message);
    if (!member) throw new Error("Forbidden");

    const { runFinanceConfidence } = await import(
      "./confidence/confidence.service.server"
    );
    return runFinanceConfidence({
      supabase: context.supabase,
      organizationId: data.orgId,
      actionBase: "",
    });
  });
