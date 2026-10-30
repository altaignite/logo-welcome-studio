import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { limited, requireSession } from "@/lib/session.middleware";
import { accountStatuses, signInBlocked, subscriptionEffect } from "@/lib/admin";

const input = z.object({
  userIds: z.array(z.string().uuid()).min(1).max(200),
  status: z.enum(accountStatuses),
  reason: z.string().trim().min(3).max(1000),
});

/** Changes client account status and applies everything it means: sign-in is blocked and every session ended for suspended and
 * closed accounts, plans are paused (on hold, suspended) or cancelled (cancelled, closed) in Stripe first, and plans paused by an
 * earlier hold resume when the account becomes active again. Returns what was done so staff can see it. */
export const setAccountStatus = createServerFn({ method: "POST" })
  .middleware([limited("accountStatus")])
  .inputValidator((d: unknown) => input.parse(d))
  .handler(async ({ data, context }) => {
    const { requirePerm } = await import("@/lib/access.server");
    await requirePerm(context, "accounts");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { must } = await import("@/lib/billing.server");
    const { applyAccountStatusEffects } = await import("@/lib/account-status.server");
    const { audit } = await import("@/lib/stripe.server");
    const actor = String(context.claims?.email ?? "Staff");
    const skipped: string[] = [];
    const done = { accounts: 0, sessionsEnded: 0, plansPaused: 0, plansCancelled: 0, plansResumed: 0 };
    for (const userId of data.userIds) {
      if (userId === context.userId) { skipped.push(userId); continue; }
      const { data: target } = await context.supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
      if (target) { skipped.push(userId); continue; }
      const prof = must(await supabaseAdmin.from("profiles").select("status").eq("id", userId).maybeSingle());
      if (!prof) { skipped.push(userId); continue; }
      const blocked = signInBlocked(data.status);
      const ban = await supabaseAdmin.auth.admin.updateUserById(userId, { ban_duration: blocked ? "876000h" : "none" });
      if (ban.error) throw new Error("Couldn't update sign-in access.");
      must(await supabaseAdmin.from("profiles").update({ status: data.status, status_reason: data.reason, status_changed_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", userId));
      if (blocked) done.sessionsEnded += Number(must(await supabaseAdmin.rpc("revoke_user_sessions", { _user: userId })) ?? 0);
      const why = `Account ${data.status}: ${data.reason}`;
      const r = await applyAccountStatusEffects(supabaseAdmin, userId, data.status, why, context.userId, actor);
      done.plansPaused += r.plansPaused; done.plansCancelled += r.plansCancelled; done.plansResumed += r.plansResumed;
      await audit(supabaseAdmin, userId, "profiles", userId, "status_changed", { status: { from: prof.status, to: data.status }, reason: data.reason, sessions_ended: blocked }, context.userId, actor);
      done.accounts++;
    }
    return { ok: true, skipped: skipped.length, ...done };
  });

const inviteInput = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email address.").max(254),
  first_name: z.string().trim().min(1, "Enter a first name.").max(80),
  last_name: z.string().trim().min(1, "Enter a last name.").max(80),
  company: z.string().trim().max(160).optional(),
  phone: z.string().trim().max(40).optional(),
});

/** Staff add a client by email: Supabase sends an invitation to set a password, and the signup trigger builds the profile. */
export const inviteClient = createServerFn({ method: "POST" })
  .middleware([limited("invite")])
  .inputValidator((d: unknown) => inviteInput.parse(d))
  .handler(async ({ data, context }) => {
    const { requirePerm } = await import("@/lib/access.server");
    await requirePerm(context, "accounts");
    const { isBlockedDomain } = await import("@/lib/disposable-domains");
    if (isBlockedDomain(data.email)) throw new Error("Disposable email addresses can't be used.");
    if (/@firstpersonmarketing\.com$/i.test(data.email)) throw new Error("Staff accounts are created from the staff sign-in page.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { audit } = await import("@/lib/stripe.server");
    const { getRequest } = await import("@tanstack/react-start/server");
    const origin = process.env["APP_URL"] ?? new URL(getRequest().url).origin;
    const r = await supabaseAdmin.auth.admin.inviteUserByEmail(data.email, {
      redirectTo: `${origin}/reset-password`,
      data: { first_name: data.first_name, last_name: data.last_name, company: data.company ?? null, phone: data.phone ?? null },
    });
    if (r.error || !r.data.user) throw new Error(/already/i.test(r.error?.message ?? "") ? "An account with this email already exists." : "Couldn't send the invitation.");
    await audit(supabaseAdmin, r.data.user.id, "profiles", r.data.user.id, "invited", { email: data.email }, context.userId, String(context.claims?.email ?? "Staff"));
    return { userId: r.data.user.id };
  });
