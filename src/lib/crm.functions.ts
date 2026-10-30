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
    const { applyStripeStatus, must, voidOpenFirstInvoices } = await import("@/lib/billing.server");
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
      const effect = subscriptionEffect(data.status);
      const why = `Account ${data.status}: ${data.reason}`;
      if (effect) {
        // Stripe first, so a held or closed account stops being charged; then the local row (service role, as billing columns are guarded).
        const affected = must(await supabaseAdmin.from("subscriptions").select("*").eq("user_id", userId)
          .in("status", ["active", "past_due", "pending", ...(effect === "cancelled" ? ["paused", "suspended"] : [])])) ?? [];
        for (const sub of affected) {
          await applyStripeStatus(sub, effect);
          if (effect === "cancelled" && sub.status === "pending") await voidOpenFirstInvoices(supabaseAdmin, sub.id, why);
          must(await supabaseAdmin.from("subscriptions").update({ status: effect, paused_by_account_status: effect === "paused", ...(effect === "cancelled" ? { cancelled_at: new Date().toISOString() } : {}) }).eq("id", sub.id));
          if (effect === "cancelled") must(await supabaseAdmin.from("projects").update({ status: "cancelled" }).eq("subscription_id", sub.id).in("status", ["planned", "active", "on_hold"]));
          else must(await supabaseAdmin.from("projects").update({ status: "on_hold" }).eq("subscription_id", sub.id).eq("status", "active"));
          await audit(supabaseAdmin, userId, "subscriptions", sub.id, effect, { status: { from: sub.status, to: effect }, reason: why }, context.userId, actor);
          if (effect === "paused") done.plansPaused++; else done.plansCancelled++;
        }
      } else if (["active", "onboarding"].includes(data.status)) {
        // Back in good standing: resume only the plans this account's hold paused, never ones the client paused.
        const held = must(await supabaseAdmin.from("subscriptions").select("*").eq("user_id", userId).eq("status", "paused").eq("paused_by_account_status", true)) ?? [];
        for (const sub of held) {
          await applyStripeStatus(sub, "active");
          const to = sub.started_at ? "active" : "pending";
          must(await supabaseAdmin.from("subscriptions").update({ status: to, paused_by_account_status: false }).eq("id", sub.id));
          must(await supabaseAdmin.from("projects").update({ status: "active" }).eq("subscription_id", sub.id).eq("status", "on_hold"));
          await audit(supabaseAdmin, userId, "subscriptions", sub.id, "resume", { status: { from: "paused", to }, reason: why }, context.userId, actor);
          done.plansResumed++;
        }
      }
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
