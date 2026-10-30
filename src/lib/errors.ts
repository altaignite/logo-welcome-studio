import { reportLovableError } from "@/lib/lovable-error-reporting";

/** A message people can act on, from any thrown value: server function errors, validation errors, Supabase errors, network failures. */
export function friendlyError(e: unknown): string {
  const raw = e instanceof Error ? e.message : typeof e === "string" ? e : String((e as { message?: unknown })?.message ?? "");
  // Validation errors from server functions arrive as a JSON list of issues.
  if (raw.trim().startsWith("[")) {
    try { const issues = JSON.parse(raw) as { message?: string }[]; if (issues[0]?.message) return issues[0].message; } catch { /* not JSON */ }
  }
  if (/KYC_REQUIRED/.test(raw)) return "Your account is restricted until you complete identity verification.";
  if (/failed to fetch|networkerror|load failed|network request failed/i.test(raw)) return "We couldn't reach the server. Check your connection and try again.";
  if (/unauthorized|jwt expired|invalid token|no authorization/i.test(raw)) return "Your session has expired. Please sign in again.";
  if (/row-level security|permission denied/i.test(raw)) return "You don't have permission to do that.";
  if (/duplicate key|already exists/i.test(raw)) return "That already exists.";
  if (/timeout|timed out/i.test(raw)) return "That took too long. Please try again.";
  return raw && raw.length < 300 ? raw : "Something went wrong. Please try again.";
}

/** Short reference shown to the user and sent with the report, so a reported problem can be matched to what they saw. */
export const errorReference = () => Math.random().toString(36).slice(2, 8).toUpperCase();

/** Sends an error to Lovable's error reporting (editor and production telemetry). Never throws.
 * Pass handled = false only for crashes (the route error page), which the editor also flags as a runtime error. */
export function reportError(e: unknown, context: Record<string, unknown> = {}, severity: "error" | "warning" = "error", handled = true) {
  try { reportLovableError(e, context, { handled, severity }); } catch { /* reporting must never break the app */ }
}
