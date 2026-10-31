import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { limited, requireSession } from "@/lib/session.middleware";

const uuid = z.string().uuid();
const label = (c: { claims: any }) => String(c.claims?.email ?? "Staff");

/** Staff with the accounts permission act on client accounts; staff accounts need the staff permission (owners). */
async function requireTarget(context: any, userId: string) {
  const { requirePerm } = await import("@/lib/access.server");
  const { data: targetIsStaff } = await context.supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
  await requirePerm(context, targetIsStaff ? "staff" : "accounts");
}

/** Sign-in details for the account Security tab: auth record, sessions, two-factor factors and recent sign-ins. Any staff may view. */
export const getAccountSecurity = createServerFn({ method: "POST" })
  .middleware([limited("lookup")])
  .inputValidator((d: unknown) => z.object({ userId: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    const { isStaff } = await import("@/lib/access.server");
    if (!(await isStaff(context))) throw new Error("Forbidden");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [u, factors, sessions, signIns] = await Promise.all([
      supabaseAdmin.auth.admin.getUserById(data.userId),
      supabaseAdmin.auth.admin.mfa.listFactors({ userId: data.userId }),
      context.supabase.rpc("user_sessions", { _user: data.userId }),
      supabaseAdmin.from("sign_in_events").select("*").eq("user_id", data.userId).order("created_at", { ascending: false }).limit(50),
    ]);
    if (u.error || !u.data.user) throw new Error("Couldn't load this user's sign-in details.");
    const user = u.data.user;
    const pick = (s: Record<string, unknown>) => ({ id: String(s["id"]), created_at: (s["created_at"] as string) ?? null, updated_at: (s["updated_at"] as string) ?? (s["refreshed_at"] as string) ?? null,
      ip: (s["ip"] as string) ?? null, user_agent: (s["user_agent"] as string) ?? null, aal: (s["aal"] as string) ?? null, not_after: (s["not_after"] as string) ?? null });
    return {
      user: { id: user.id, email: user.email ?? null, phone: user.phone ?? null, created_at: user.created_at, last_sign_in_at: user.last_sign_in_at ?? null,
        email_confirmed_at: user.email_confirmed_at ?? null, banned_until: (user as { banned_until?: string }).banned_until ?? null,
        providers: ((user.app_metadata?.["providers"] as string[] | undefined) ?? [user.app_metadata?.["provider"]].filter(Boolean)) as string[],
        user_metadata: (user.user_metadata ?? {}) as Record<string, string | number | boolean | null> },
      factors: (factors.data?.factors ?? []).map((f) => ({ id: f.id, type: f.factor_type, status: f.status, name: f.friendly_name ?? null, created_at: f.created_at })),
      sessions: ((sessions.data ?? []) as Record<string, unknown>[]).map(pick),
      signIns: (signIns.data ?? []) as { id: string; ip: string | null; country: string | null; region: string | null; city: string | null; user_agent: string | null; new_location: boolean; reviewed_at: string | null; reviewed_by_label: string | null; created_at: string }[],
    };
  });

/** Ends one session or every session of a user. Access tokens already issued expire within the hour, and suspended accounts are refused at once. */
export const revokeSessions = createServerFn({ method: "POST" })
  .middleware([limited("sessionAdmin")])
  .inputValidator((d: unknown) => z.object({ userId: uuid, sessionId: uuid.optional(), reason: z.string().trim().min(3).max(500) }).parse(d))
  .handler(async ({ data, context }) => {
    await requireTarget(context, data.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { audit } = await import("@/lib/stripe.server");
    const { data: n, error } = await supabaseAdmin.rpc("revoke_user_sessions", { _user: data.userId, ...(data.sessionId ? { _session: data.sessionId } : {}) });
    if (error) throw new Error("Couldn't end the sessions.");
    await audit(supabaseAdmin, data.userId, "auth_sessions", data.userId, data.sessionId ? "session_ended" : "all_sessions_ended", { reason: data.reason, sessions: n }, context.userId, label(context));
    return { ended: Number(n ?? 0) };
  });

/** Replaces the user's profile metadata (short flat values only). */
export const updateUserMetadata = createServerFn({ method: "POST" })
  .middleware([limited("sessionAdmin")])
  .inputValidator((d: unknown) => z.object({ userId: uuid, metadata: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])) }).parse(d))
  .handler(async ({ data, context }) => {
    await requireTarget(context, data.userId);
    const { metadataIssue } = await import("@/lib/security");
    const issue = metadataIssue(data.metadata);
    if (issue) throw new Error(issue);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { audit } = await import("@/lib/stripe.server");
    const before = await supabaseAdmin.auth.admin.getUserById(data.userId);
    const up = await supabaseAdmin.auth.admin.updateUserById(data.userId, { user_metadata: data.metadata });
    if (up.error) throw new Error("Couldn't save the metadata.");
    await audit(supabaseAdmin, data.userId, "auth_users", data.userId, "metadata_updated", { from: before.data.user?.user_metadata ?? null, to: data.metadata }, context.userId, label(context));
    return { ok: true };
  });

/** Removes a two-factor factor (for a client who lost their phone) and ends their sessions so they sign in again. */
export const removeMfaFactor = createServerFn({ method: "POST" })
  .middleware([limited("sessionAdmin")])
  .inputValidator((d: unknown) => z.object({ userId: uuid, factorId: uuid, reason: z.string().trim().min(3).max(500) }).parse(d))
  .handler(async ({ data, context }) => {
    await requireTarget(context, data.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { audit } = await import("@/lib/stripe.server");
    const del = await supabaseAdmin.auth.admin.mfa.deleteFactor({ userId: data.userId, id: data.factorId });
    if (del.error) throw new Error("Couldn't remove the authenticator.");
    await supabaseAdmin.rpc("revoke_user_sessions", { _user: data.userId });
    await audit(supabaseAdmin, data.userId, "auth_users", data.userId, "mfa_factor_removed", { reason: data.reason }, context.userId, label(context));
    return { ok: true };
  });

/** Emails the user a password reset link. */
export const sendPasswordReset = createServerFn({ method: "POST" })
  .middleware([limited("passwordReset")])
  .inputValidator((d: unknown) => z.object({ userId: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    await requireTarget(context, data.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { audit } = await import("@/lib/stripe.server");
    const { getRequest } = await import("@tanstack/react-start/server");
    const u = await supabaseAdmin.auth.admin.getUserById(data.userId);
    const email = u.data.user?.email;
    if (!email) throw new Error("This user has no email address.");
    const origin = process.env["APP_URL"] ?? new URL(getRequest().url).origin;
    const r = await supabaseAdmin.auth.resetPasswordForEmail(email, { redirectTo: `${origin}/reset-password` });
    if (r.error) throw new Error("Couldn't send the reset email.");
    await audit(supabaseAdmin, data.userId, "auth_users", data.userId, "password_reset_sent", {}, context.userId, label(context));
    return { ok: true };
  });

/** Signed-in check used when a page loads: records the sign-in and fails for suspended accounts, so the app can sign them out. */
export const touchSession = createServerFn({ method: "POST" })
  .middleware([requireSession])
  .handler(async () => ({ ok: true }));
