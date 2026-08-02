// App AI via Google Gemini (direct) — same setup as Nexus.
import { createGoogleGenerativeAI } from "@ai-sdk/google";

export type GeminiTier = "flash" | "flash-lite";

const MODEL_IDS: Record<GeminiTier, string> = {
  /** Receipt scan and richer generation */
  flash: "gemini-3.6-flash",
  /** High volume / cheap */
  "flash-lite": "gemini-3.5-flash-lite",
};

/** Prefer GOOGLE_GENERATIVE_AI_API_KEY (AI SDK default); GEMINI_API_KEY also accepted. */
export function getGeminiApiKey(): string | null {
  const key =
    process.env.GOOGLE_GENERATIVE_AI_API_KEY?.trim() || process.env.GEMINI_API_KEY?.trim() || "";
  return key || null;
}

export function createGeminiProvider(apiKey?: string) {
  const key = apiKey ?? getGeminiApiKey();
  if (!key) {
    throw new Error(
      "Missing GOOGLE_GENERATIVE_AI_API_KEY (or GEMINI_API_KEY). Create a key in Google AI Studio.",
    );
  }
  return createGoogleGenerativeAI({ apiKey: key });
}

export type GeminiProvider = ReturnType<typeof createGeminiProvider>;

export function getGeminiModel(tier: GeminiTier = "flash") {
  const google = createGeminiProvider();
  return google(MODEL_IDS[tier]);
}

export function geminiModelId(tier: GeminiTier = "flash"): string {
  return MODEL_IDS[tier];
}
