import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { limited, requireSession } from "@/lib/session.middleware";
import { plans } from "@/lib/signup";
import { planChangeTiming, profileUpdateSchema } from "@/lib/client";
import { orderingBlocked } from "@/lib/admin";

const uuid = z.string().uuid();
const label = (c: { claims: any }) => String(c.claims?.email ?? "Client");

async function ownSub(admin: any, id: string, userId: string) {
  const { data: sub } = await admin.from("subscriptions").select("*").eq("id", id).maybeSingle();
  if (!sub || sub.user_id !== userId) throw new Error("Subscription not found.");
  return sub;
}

/** Client edits their own profile; only whitelisted fields pass validation. */
export const updateMyProfile = createServerFn({ method: "POST" })
  .middleware([limited("profile")])
  .inputValidator((d: unknown) => profileUpdateSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { getAdmin } = await import("@/lib/billing.server");
    const admin = await getAdmin();
    const up = await admin.from("profiles").update({ ...data, updated_at: new Date().toISOString() }).eq("id", context.userId);
    if (up.error) throw new Error("Couldn't save your details.");
    return { ok: true };
  });

/** Client orders an additional plan: pending subscription, project and a Stripe invoice. Activation on payment. */
export const orderAdditionalPlan = createServerFn({ method: "POST" })
  .middleware([limited("order")])
  // The client signs the plan's agreements in the order flow before ordering.
  .inputValidator((d: unknown) => z.object({ planId: z.enum(["starter", "growth", "scale"]), signed: z.literal(true) }).parse(d))
  .handler(async ({ data, context }) => {
    const { getAdmin, issueStripeInvoice } = await import("@/lib/billing.server");
    const admin = await getAdmin();
    const plan = plans.find((p) => p.id === data.planId)!;
    const { data: prof } = await admin.from("profiles").select("account_number, company, first_name, last_name, status").eq("id", context.userId).single();
    if (!prof || orderingBlocked(prof.status)) throw new Error("Your account can't place orders right now. Please contact support.");
    const { count } = await admin.from("subscriptions").select("id", { count: "exact", head: true }).eq("user_id", context.userId).eq("status", "pending");
    if ((count ?? 0) >= 2) throw new Error("Please pay your open plan invoices before ordering another plan.");
    // Make sure Stripe is reachable and the client has a Stripe customer before anything is created locally.
    const { ensureCustomer } = await import("@/lib/stripe.server");
    await ensureCustomer(admin, context.userId);
    const app = await admin.from("applications").insert({ user_id: context.userId, account_number: prof.account_number, plan_id: plan.id, plan_name: plan.name, monthly_fee: plan.monthlyFee, monthly_hours: plan.monthlyHours, status: "approved", decided_at: new Date().toISOString(), signed_at: new Date().toISOString() }).select("id").single();
    if (app.error) throw new Error("Couldn't create the order.");
    await admin.from("application_events").insert({ application_id: app.data.id, actor_id: context.userId, actor_label: label(context), action: "Additional plan ordered and agreements signed digitally; invoice sent", to_status: "approved", note: `Plan: ${plan.name}` });
    const sub = await admin.from("subscriptions").insert({ user_id: context.userId, plan_name: plan.name, monthly_fee: plan.monthlyFee, monthly_hours: plan.monthlyHours, status: "pending", application_id: app.data.id, notes: "Awaiting payment of first invoice" }).select("id").single();
    if (sub.error) throw new Error("Couldn't create the subscription.");
    await admin.from("projects").insert({ user_id: context.userId, subscription_id: sub.data.id, name: `${prof.company || "Client"} ${plan.name}`, service: "Marketing", status: "planned", description: `${plan.name} plan` });
    let inv;
    try {
      inv = await issueStripeInvoice(admin, {
      userId: context.userId, subscriptionId: sub.data.id, kind: "first", description: `${plan.name} plan, first month`,
      lines: [{ description: `${plan.name} plan, ${plan.monthlyHours} service hours per month`, amount: plan.monthlyFee }], idem: `client-order-${sub.data.id}`,
    });
    } catch (e) {
      // No half-made orders: if Stripe didn't take the invoice, the plan never starts.
      await admin.from("subscriptions").update({ status: "cancelled", cancelled_at: new Date().toISOString(), notes: `Order not completed: ${(e as Error).message}` }).eq("id", sub.data.id);
      await admin.from("projects").update({ status: "cancelled" }).eq("subscription_id", sub.data.id);
      await admin.from("applications").update({ archived_at: new Date().toISOString(), internal_notes: "Order not completed: Stripe invoice failed" }).eq("id", app.data.id);
      throw e;
    }
    return { subscriptionId: sub.data.id as string, invoiceId: inv.id as string };
  });

/** Upgrade now (prorated through Stripe) or schedule a downgrade for renewal. */
export const changePlan = createServerFn({ method: "POST" })
  .middleware([limited("planChange")])
  .inputValidator((d: unknown) => z.object({ subscriptionId: uuid, planId: z.enum(["starter", "growth", "scale"]) }).parse(d))
  .handler(async ({ data, context }) => {
    const { getAdmin, assertClientMayAct } = await import("@/lib/billing.server");
    const { stripe, planPrice, audit } = await import("@/lib/stripe.server");
    const admin = await getAdmin();
    const sub = await ownSub(admin, data.subscriptionId, context.userId);
    await assertClientMayAct(admin, context.userId);
    if (sub.status !== "active") throw new Error("Only active plans can be changed.");
    const plan = plans.find((p) => p.id === data.planId)!;
    const timing = planChangeTiming(sub.plan_name, plan.id);
    if (timing === "same" && !sub.pending_plan_id) return { timing };
    if (sub.stripe_subscription_id) {
        const s = await stripe("GET", `subscriptions/${sub.stripe_subscription_id}`);
        const item = s.items?.data?.[0]?.id;
        if (!item) throw new Error("Couldn't find the plan in billing.");
        await stripe("POST", `subscriptions/${sub.stripe_subscription_id}`, { "items[0][id]": item, "items[0][price]": await planPrice(plan.name, plan.monthlyFee), proration_behavior: timing === "now" ? "always_invoice" : "none" });
    }
    if (timing === "now") {
      await admin.from("subscriptions").update({ plan_name: plan.name, monthly_fee: plan.monthlyFee, monthly_hours: plan.monthlyHours, pending_plan_id: null }).eq("id", sub.id);
    } else {
      await admin.from("subscriptions").update({ pending_plan_id: timing === "same" ? null : plan.id }).eq("id", sub.id);
    }
    await audit(admin, sub.user_id, "subscriptions", sub.id, timing === "now" ? "plan_upgraded" : "plan_downgrade_scheduled", { plan: { from: sub.plan_name, to: plan.name } }, context.userId, label(context));
    return { timing };
  });

/** Keep a plan that was set to cancel at the end of the period. */
export const undoCancel = createServerFn({ method: "POST" })
  .middleware([limited("planChange")])
  .inputValidator((d: unknown) => z.object({ subscriptionId: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    const { getAdmin } = await import("@/lib/billing.server");
    const { stripe, audit } = await import("@/lib/stripe.server");
    const admin = await getAdmin();
    const sub = await ownSub(admin, data.subscriptionId, context.userId);
    if (!sub.cancel_at_period_end) throw new Error("This plan isn't set to cancel.");
    if (sub.stripe_subscription_id) await stripe("POST", `subscriptions/${sub.stripe_subscription_id}`, { cancel_at_period_end: false });
    await admin.from("subscriptions").update({ cancel_at_period_end: false }).eq("id", sub.id);
    await audit(admin, sub.user_id, "subscriptions", sub.id, "cancel_undone", {}, context.userId, label(context));
    return { ok: true };
  });

/** Client asks for a data export or account closure; staff handle it within 30 days. */
export const requestPrivacy = createServerFn({ method: "POST" })
  .middleware([limited("privacy")])
  .inputValidator((d: unknown) => z.object({ kind: z.enum(["access", "deletion"]), details: z.string().trim().max(1000).optional() }).parse(d))
  .handler(async ({ data, context }) => {
    const { getAdmin } = await import("@/lib/billing.server");
    const admin = await getAdmin();
    const { count } = await admin.from("compliance_requests").select("id", { count: "exact", head: true }).eq("user_id", context.userId).eq("kind", data.kind).neq("status", "completed");
    if ((count ?? 0) > 0) throw new Error("You already have an open request of this type.");
    const due = new Date(); due.setDate(due.getDate() + 30);
    const r = await admin.from("compliance_requests").insert({ user_id: context.userId, kind: data.kind, details: data.details ?? null, due_at: due.toISOString().slice(0, 10), actor_label: label(context) });
    if (r.error) throw new Error("Couldn't send your request.");
    return { ok: true };
  });
