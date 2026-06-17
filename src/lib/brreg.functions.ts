import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const Input = z.object({ q: z.string().min(1).max(120) });

export const searchCompaniesFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => Input.parse(input))
  .handler(async ({ data }) => {
    const { searchCompanies, BrregUnavailableError } = await import("./brreg.server");
    try {
      const companies = await searchCompanies(data.q);
      return { ok: true as const, companies };
    } catch (err: any) {
      if (err instanceof BrregUnavailableError) {
        return {
          ok: false as const,
          error: "unavailable" as const,
          message: err.message,
        };
      }
      throw err;
    }
  });
