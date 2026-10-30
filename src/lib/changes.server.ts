/** Plan change core shared by the quick plan change and the full change application. Server only. */
import { planChangeTiming } from "@/lib/client";
import { plans, type Plan } from "@/lib/signup";

type Admin = any;

/** Upgrades start now with a prorated Stripe invoice; downgrades are scheduled for the next renewal. */
export async function applyPlanChange(admin: Admin, sub: any, plan: Plan, actorId: string, actor: string) {
  const { stripe, planPrice, audit } = await import("@/lib/stripe.server");
  const timing = planChangeTiming(sub.plan_name, plan.id);
  if (timing === "same" && !sub.pending_plan_id) return { timing };
  if (sub.stripe_subscription_id) {
    const s = await stripe("GET", `subscriptions/${sub.stripe_subscription_id}`);
    const item = s.items?.data?.[0]?.id;
    if (!item) throw new Error("Couldn't find the plan in billing.");
    await stripe("POST", `subscriptions/${sub.stripe_subscription_id}`, { "items[0][id]": item, "items[0][price]": await planPrice(plan.name, plan.monthlyFee), proration_behavior: timing === "now" ? "always_invoice" : "none" });
  }
  if (timing === "now") await admin.from("subscriptions").update({ plan_name: plan.name, monthly_fee: plan.monthlyFee, monthly_hours: plan.monthlyHours, pending_plan_id: null }).eq("id", sub.id);
  else await admin.from("subscriptions").update({ pending_plan_id: timing === "same" ? null : plan.id }).eq("id", sub.id);
  await audit(admin, sub.user_id, "subscriptions", sub.id, timing === "now" ? "plan_upgraded" : "plan_downgrade_scheduled", { plan: { from: sub.plan_name, to: plan.name } }, actorId, actor);
  return { timing };
}

export const planById = (id: string) => plans.find((p) => p.id === id);
