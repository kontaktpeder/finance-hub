import { ArrowLeft } from "lucide-react";

/**
 * Small back-link shown when Finance was entered from a Platform Mission
 * deep link. `return` is a full URL; only http(s) is allowed. Returns null
 * for missing or unsafe values so callers can render it unconditionally.
 */
export function MissionReturnLink({ returnUrl }: { returnUrl?: string }) {
  if (!returnUrl) return null;
  let parsed: URL;
  try {
    parsed = new URL(returnUrl);
  } catch {
    return null;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;

  return (
    <a
      href={parsed.toString()}
      className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
    >
      <ArrowLeft className="h-3.5 w-3.5" />
      Tilbake til Mission
    </a>
  );
}
