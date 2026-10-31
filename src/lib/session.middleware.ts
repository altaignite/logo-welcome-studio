import { createMiddleware } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { KYC_ERROR, kycRestricted, signInBlocked } from "@/lib/admin";
import type { LimitName } from "@/lib/limits";

/** Every server function runs through this. It refuses suspended and closed accounts (even with a token issued before the change),
 * refuses a session that hasn't entered its two-factor code when the user set two-factor up (two-factor is optional), and records
 * the sign-in location once per session. */
export const requireSession = createMiddleware({ type: "function" })
  .middleware([requireSupabaseAuth])
  .server(async ({ next, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { enforceLimit } = await import("@/lib/rate-limit.server");
    // Every server action counts towards a per-user limit.
    await enforceLimit("request", context.userId);
    const [prof, role] = await Promise.all([
      supabaseAdmin.from("profiles").select("status").eq("id", context.userId).maybeSingle(),
      supabaseAdmin.from("user_roles").select("user_id").eq("user_id", context.userId).eq("role", "admin").maybeSingle(),
    ]);
    if (!role.data && prof.data && (signInBlocked(prof.data.status) || kycRestricted(prof.data.status))) {
      const { logSecurityEvent } = await import("@/lib/security-log.server");
      await logSecurityEvent({ kind: "blocked_account_activity", severity: "medium", userId: context.userId, summary: `A ${prof.data.status.replace("_", " ")} account tried to use the app.`, detail: { status: prof.data.status } });
      throw new Error(kycRestricted(prof.data.status) ? KYC_ERROR : "This account is suspended or closed. Please contact support.");
    }
    if (context.claims?.aal !== "aal2") {
      const { data, error } = await supabaseAdmin.auth.admin.mfa.listFactors({ userId: context.userId });
      // Refuse only on clear evidence of an unpassed authenticator; a lookup failure must not block every save.
      if (error) console.error("Two-factor lookup failed", error.message);
      else if (data.factors.some((f) => f.status === "verified")) throw new Error("Finish signing in with your two-factor code.");
    }
    try {
      const { recordSignIn } = await import("@/lib/signin.server");
      await recordSignIn(supabaseAdmin, context.userId, context.claims?.session_id);
    } catch (e) { console.error("Sign-in record failed", e); }
    // The sign-in check may have just restricted the account.
    if (!role.data) { const { assertNotKyc } = await import("@/lib/kyc.server"); await assertNotKyc(supabaseAdmin, context.userId); }
    return next();
  });

/** requireSession plus a per-user limit for one kind of action (see src/lib/limits.ts). */
const cache = new Map<LimitName, ReturnType<typeof make>>();
function make(name: LimitName) {
  return createMiddleware({ type: "function" }).middleware([requireSession]).server(async ({ next, context }) => {
    const { enforceLimit } = await import("@/lib/rate-limit.server");
    await enforceLimit(name, context.userId);
    try { return await next(); }
    catch (e) { throw await toPublicError(e, name, context.userId); }
  });
}
export function limited(name: LimitName) {
  if (!cache.has(name)) cache.set(name, make(name));
  return cache.get(name)!;
}

/** Errors leaving a server function: redirects pass through, validation errors keep their first message, messages written for
 * people pass through, and anything that could reveal internals (database, Stripe ids, URLs, code errors) becomes a generic
 * message with a reference. The full error is logged on the server under that reference. */
async function toPublicError(e: unknown, fn: string, userId: string): Promise<unknown> {
  if (e instanceof Response || (e && typeof e === "object" && ("isRedirect" in e || "isNotFound" in e || "routerCode" in e))) return e;
  const raw = e instanceof Error ? e.message : String((e as { message?: unknown })?.message ?? e ?? "");
  if (raw.trim().startsWith("[")) {
    try { const first = (JSON.parse(raw) as { message?: string }[])[0]?.message; if (first) return new Error(first.slice(0, 300)); } catch { /* not validation JSON */ }
  }
  const { publicMessage, GENERIC_ERROR } = await import("@/lib/public-errors");
  const safe = publicMessage(raw);
  if (safe) return new Error(safe);
  const ref = Math.random().toString(36).slice(2, 8).toUpperCase();
  console.error(`[${ref}] ${fn} failed for ${userId}:`, e);
  try {
    const { logSecurityEvent } = await import("@/lib/security-log.server");
    await logSecurityEvent({ kind: "server_error", severity: "low", group: fn, userId, summary: `The ${fn} action failed with an internal error (reference ${ref}).`, detail: { ref, fn, error: raw.slice(0, 500) } });
  } catch { /* logging must never hide the original failure */ }
  return new Error(`${GENERIC_ERROR} with reference ${ref}.`);
}
