/** Checks a rate limit in the database. Server only. Fails open (and logs) if the check itself can't run, for example
 * before the migration is applied, so a database problem never locks everyone out. */
import { rateLimits, type LimitName } from "@/lib/limits";

export class RateLimitError extends Error {}

export async function enforceLimit(name: LimitName, subject: string) {
  const rule = rateLimits[name];
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin.rpc("hit_rate_limit", { _key: `${name}:${subject}`, _max: rule.max, _window_seconds: rule.windowSec });
  if (error) { console.error("Rate limit check failed", name, error.message); return; }
  if (data === false) throw new RateLimitError(rule.message);
}
