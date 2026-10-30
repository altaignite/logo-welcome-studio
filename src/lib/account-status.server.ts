/** What an account status does to the account's plans and projects, shared by staff status changes and automatic security
 * flags: holds, suspensions and KYC restrictions pause plans in Stripe (marked so reactivation resumes them), cancellations and
 * closures cancel them, and a return to good standing resumes only the plans a hold paused. Server only. */
import { subscriptionEffect } from "@/lib/admin";
import { applyStripeStatus, must, voidOpenFirstInvoices } from "@/lib/billing.server";
import { audit } from "@/lib/stripe.server";

type Admin = any;

export async function applyAccountStatusEffects(admin: Admin, userId: string, status: string, why: string, actorId: string | null, actor: string) {
  const out = { plansPaused: 0, plansCancelled: 0, plansResumed: 0 };
  const effect = subscriptionEffect(status);
  if (effect) {
    // Stripe first, so a held or closed account stops being charged; then the local row (service role, as billing columns are guarded).
    const affected = must(await admin.from("subscriptions").select("*").eq("user_id", userId)
      .in("status", ["active", "past_due", "pending", ...(effect === "cancelled" ? ["paused", "suspended"] : [])])) ?? [];
    for (const sub of affected) {
      await applyStripeStatus(sub, effect);
      if (effect === "cancelled" && sub.status === "pending") await voidOpenFirstInvoices(admin, sub.id, why);
      must(await admin.from("subscriptions").update({ status: effect, paused_by_account_status: effect === "paused", ...(effect === "cancelled" ? { cancelled_at: new Date().toISOString() } : {}) }).eq("id", sub.id));
      if (effect === "cancelled") must(await admin.from("projects").update({ status: "cancelled" }).eq("subscription_id", sub.id).in("status", ["planned", "active", "on_hold"]));
      else must(await admin.from("projects").update({ status: "on_hold" }).eq("subscription_id", sub.id).eq("status", "active"));
      await audit(admin, userId, "subscriptions", sub.id, effect, { status: { from: sub.status, to: effect }, reason: why }, actorId, actor);
      if (effect === "paused") out.plansPaused++; else out.plansCancelled++;
    }
  } else if (["active", "onboarding"].includes(status)) {
    // Back in good standing: resume only the plans this account's hold paused, never ones the client paused.
    const held = must(await admin.from("subscriptions").select("*").eq("user_id", userId).eq("status", "paused").eq("paused_by_account_status", true)) ?? [];
    for (const sub of held) {
      await applyStripeStatus(sub, "active");
      const to = sub.started_at ? "active" : "pending";
      must(await admin.from("subscriptions").update({ status: to, paused_by_account_status: false }).eq("id", sub.id));
      must(await admin.from("projects").update({ status: "active" }).eq("subscription_id", sub.id).eq("status", "on_hold"));
      await audit(admin, userId, "subscriptions", sub.id, "resume", { status: { from: "paused", to }, reason: why }, actorId, actor);
      out.plansResumed++;
    }
  }
  return out;
}
