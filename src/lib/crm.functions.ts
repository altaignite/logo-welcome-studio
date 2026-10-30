import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSession } from "@/lib/session.middleware";
import { accountStatuses, signInBlocked, subscriptionEffect } from "@/lib/admin";

const input = z.object({
  userIds: z.array(z.string().uuid()).min(1).max(200),
  status: z.enum(accountStatuses),
  reason: z.string().trim().min(3).max(1000),
});

/** Changes client account status. Suspended and closed accounts are blocked from signing in. */
export const setAccountStatus = createServerFn({ method: "POST" })
  .middleware([requireSession])
  .inputValidator((d: unknown) => input.parse(d))
  .handler(async ({ data, context }) => {
    const { requirePerm } = await import("@/lib/access.server");
    await requirePerm(context, "accounts");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { applyStripeStatus, must, voidOpenFirstInvoices } = await import("@/lib/billing.server");
    const { audit } = await import("@/lib/stripe.server");
    const skipped: string[] = [];
    for (const userId of data.userIds) {
      if (userId === context.userId) { skipped.push(userId); continue; }
      const { data: target } = await context.supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
      if (target) { skipped.push(userId); continue; }
      const ban = await supabaseAdmin.auth.admin.updateUserById(userId, { ban_duration: signInBlocked(data.status) ? "876000h" : "none" });
      if (ban.error) throw new Error("Couldn't update sign-in access.");
      // Update through the staff session so the audit log records who did it.
      const up = await context.supabase.from("profiles").update({ status: data.status, status_reason: data.reason, status_changed_at: new Date().toISOString() }).eq("id", userId);
      if (up.error) throw new Error("Couldn't update the account.");
      const effect = subscriptionEffect(data.status);
      if (effect) {
        // Stripe first, so a held or closed account stops being charged; then the local row (service role, as billing columns are guarded).
        const affected = must(await supabaseAdmin.from("subscriptions").select("*").eq("user_id", userId)
          .in("status", ["active", "past_due", "pending", ...(effect === "cancelled" ? ["paused", "suspended"] : [])])) ?? [];
        for (const sub of affected) {
          await applyStripeStatus(sub, effect);
          if (effect === "cancelled" && sub.status === "pending") await voidOpenFirstInvoices(supabaseAdmin, sub.id, `Account ${data.status}: ${data.reason}`);
          must(await supabaseAdmin.from("subscriptions").update({ status: effect, ...(effect === "cancelled" ? { cancelled_at: new Date().toISOString() } : {}) }).eq("id", sub.id));
          await audit(supabaseAdmin, userId, "subscriptions", sub.id, effect, { status: { from: sub.status, to: effect }, reason: `Account ${data.status}: ${data.reason}` }, context.userId, String(context.claims?.email ?? "Staff"));
        }
      }
    }
    return { ok: true, skipped: skipped.length };
  });
