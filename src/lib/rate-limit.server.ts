/** Checks a rate limit in the database. Server only. Fails open (and logs) if the check itself can't run, for example
 * before the migration is applied, so a database problem never locks everyone out. */
import { rateLimits, type LimitName } from "@/lib/limits";

export class RateLimitError extends Error {}

export async function enforceLimit(name: LimitName, subject: string) {
  const rule = rateLimits[name];
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin.rpc("hit_rate_limit", { _key: `${name}:${subject}`, _max: rule.max, _window_seconds: rule.windowSec });
  if (error) { console.error("Rate limit check failed", name, error.message); return; }
  if (data === false) {
    const { logSecurityEvent } = await import("@/lib/security-log.server");
    const uuidLike = /^[0-9a-f-]{36}$/.test(subject);
    await logSecurityEvent({ kind: "rate_limited", severity: name === "request" || name.startsWith("accountCheck") ? "medium" : "low", group: `${name}:${subject}`,
      userId: uuidLike ? subject : null, summary: `Rate limit "${name}" exceeded (${rule.max} per ${Math.round(rule.windowSec / 60)} min).`, detail: { limit: name } });
    throw new RateLimitError(rule.message);
  }
}
