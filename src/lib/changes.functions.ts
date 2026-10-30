import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { limited } from "@/lib/session.middleware";
import { isReason, type ChangeKind } from "@/lib/changes";

const uuid = z.string().uuid();
const label = (c: { claims: any }) => String(c.claims?.email ?? "Client");
const application = {
  reason: z.string().trim().min(2).max(80),
  details: z.string().trim().max(3000).optional(),
  feedback: z.record(z.string().max(40), z.string().trim().max(1000)).optional(),
  // The client signs the application with a one-time code in the flow before submitting.
  signed: z.literal(true),
};

async function ownSub(admin: any, id: string, userId: string) {
  const { data: sub } = await admin.from("subscriptions").select("*").eq("id", id).maybeSingle();
  if (!sub || sub.user_id !== userId) throw new Error("Subscription not found.");
  return sub;
}

async function record(admin: any, row: { user_id: string; subscription_id?: string | null; kind: ChangeKind; from_plan?: string | null; to_plan?: string | null; reason: string; details?: string | undefined; feedback?: Record<string, string> | undefined; effective_at?: string | null; actor_label: string }) {
  if (!isReason(row.kind, row.reason)) throw new Error("Choose a reason from the list.");
  const { must } = await import("@/lib/billing.server");
  return must(await admin.from("account_change_requests").insert({ ...row, details: row.details || null, feedback: row.feedback ?? {}, signed_at: new Date().toISOString() }).select("id").single()) as { id: string };
}

/** Upgrade or downgrade as a signed application: upgrades start now (prorated), downgrades at the next renewal. */
export const submitPlanChange = createServerFn({ method: "POST" })
  .middleware([limited("planChange")])
  .inputValidator((d: unknown) => z.object({ subscriptionId: uuid, planId: z.enum(["starter", "growth", "scale"]), ...application }).parse(d))
  .handler(async ({ data, context }) => {
    const { getAdmin, assertClientMayAct } = await import("@/lib/billing.server");
    const { applyPlanChange, planById } = await import("@/lib/changes.server");
    const { planChangeTiming } = await import("@/lib/client");
    const admin = await getAdmin();
    const sub = await ownSub(admin, data.subscriptionId, context.userId);
    await assertClientMayAct(admin, context.userId);
    if (sub.status !== "active") throw new Error("Only active plans can be changed.");
    if (sub.cancel_at_period_end) throw new Error("This plan is set to cancel. Keep the plan first, then change it.");
    const plan = planById(data.planId)!;
    const timing = planChangeTiming(sub.plan_name, plan.id);
    if (timing === "same") throw new Error("You're already on this plan.");
    const kind: ChangeKind = timing === "now" ? "upgrade" : "downgrade";
    const r = await applyPlanChange(admin, sub, plan, context.userId, label(context));
    const req = await record(admin, { user_id: context.userId, subscription_id: sub.id, kind, from_plan: sub.plan_name, to_plan: plan.name, reason: data.reason, details: data.details, feedback: data.feedback, effective_at: timing === "now" ? new Date().toISOString() : sub.renews_at, actor_label: label(context) });
    return { ...r, requestId: req.id, effectiveAt: timing === "now" ? null : (sub.renews_at as string | null) };
  });

/** Cancellation as a signed application. Started plans end at the end of the paid period; only an unpaid new order ends at once. */
export const submitCancellation = createServerFn({ method: "POST" })
  .middleware([limited("subscriptionAction")])
  .inputValidator((d: unknown) => z.object({ subscriptionId: uuid, ...application }).parse(d))
  .handler(async ({ data, context }) => {
    const { getAdmin, applyStripeStatus, voidOpenFirstInvoices, must } = await import("@/lib/billing.server");
    const { stripe, audit } = await import("@/lib/stripe.server");
    const { cancelNowAllowed } = await import("@/lib/billing");
    const admin = await getAdmin();
    const sub = await ownSub(admin, data.subscriptionId, context.userId);
    if (sub.status === "cancelled") throw new Error("This plan is already cancelled.");
    if (sub.cancel_at_period_end) throw new Error("This plan is already set to cancel at the end of the billing period.");
    const why = `Cancellation requested by the client: ${data.reason}`;
    let effective: string | null;
    if (cancelNowAllowed(sub)) {
      // An order that never started: nothing was billed, so it ends now and its unpaid first invoice is voided.
      await applyStripeStatus(sub, "cancelled");
      await voidOpenFirstInvoices(admin, sub.id, why);
      must(await admin.from("subscriptions").update({ status: "cancelled", cancelled_at: new Date().toISOString() }).eq("id", sub.id));
      must(await admin.from("projects").update({ status: "cancelled" }).eq("subscription_id", sub.id).in("status", ["planned", "active", "on_hold"]));
      effective = new Date().toISOString();
    } else {
      if (sub.stripe_subscription_id) await stripe("POST", `subscriptions/${sub.stripe_subscription_id}`, { cancel_at_period_end: true });
      must(await admin.from("subscriptions").update({ cancel_at_period_end: true, notes: [sub.notes, `${new Date().toISOString().slice(0, 10)} cancels at period end: ${data.reason}`].filter(Boolean).join("\n") }).eq("id", sub.id));
      effective = sub.renews_at ?? null;
    }
    await audit(admin, sub.user_id, "subscriptions", sub.id, "cancellation_requested", { reason: data.reason, effective_at: effective }, context.userId, label(context));
    const req = await record(admin, { user_id: context.userId, subscription_id: sub.id, kind: "cancel", from_plan: sub.plan_name, reason: data.reason, details: data.details, feedback: data.feedback, effective_at: effective, actor_label: label(context) });
    return { requestId: req.id, effectiveAt: effective, immediate: cancelNowAllowed(sub) };
  });

/** Account closure as a signed application: every plan is cancelled in Stripe at the end of its paid period, unpaid new orders end
 * now, invoices stay payable, and the account is closed (shadow closed: kept, never deleted) with sign-in blocked. */
export const submitAccountClosure = createServerFn({ method: "POST" })
  .middleware([limited("accountStatus")])
  .inputValidator((d: unknown) => z.object({ ...application }).parse(d))
  .handler(async ({ data, context }) => {
    const { getAdmin, must } = await import("@/lib/billing.server");
    const { applyAccountStatusEffects } = await import("@/lib/account-status.server");
    const { audit } = await import("@/lib/stripe.server");
    const admin = await getAdmin();
    const { data: prof } = await admin.from("profiles").select("status").eq("id", context.userId).maybeSingle();
    if (!prof || prof.status === "closed") throw new Error("This account is already closed.");
    const why = `Account closure requested by the client: ${data.reason}`;
    const subs = (must(await admin.from("subscriptions").select("id, plan_name, renews_at, status, started_at").eq("user_id", context.userId).neq("status", "cancelled")) ?? []) as { id: string; plan_name: string; renews_at: string | null }[];
    // Record first, so the application exists even if a Stripe call fails part-way.
    const req = await record(admin, { user_id: context.userId, kind: "close_account", reason: data.reason, details: data.details, feedback: { ...(data.feedback ?? {}), plans: subs.map((s) => `${s.plan_name} until ${s.renews_at?.slice(0, 10) ?? "now"}`).join(", ") }, effective_at: new Date().toISOString(), actor_label: label(context) });
    await applyAccountStatusEffects(admin, context.userId, "closed", why, context.userId, label(context));
    must(await admin.from("profiles").update({ status: "closed", status_reason: why, status_changed_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", context.userId));
    await admin.auth.admin.updateUserById(context.userId, { ban_duration: "876000h" });
    await admin.rpc("revoke_user_sessions", { _user: context.userId });
    await audit(admin, context.userId, "profiles", context.userId, "status_changed", { status: { from: prof.status, to: "closed" }, reason: why }, context.userId, label(context));
    return { requestId: req.id, plans: subs.length };
  });

/** Staff mark a change application as reviewed, with an optional note. The change itself was already actioned. */
export const reviewAccountChange = createServerFn({ method: "POST" })
  .middleware([limited("accountStatus")])
  .inputValidator((d: unknown) => z.object({ id: uuid, note: z.string().trim().max(2000).optional() }).parse(d))
  .handler(async ({ data, context }) => {
    const { requirePerm } = await import("@/lib/access.server");
    await requirePerm(context, "accounts");
    const { getAdmin, must } = await import("@/lib/billing.server");
    const admin = await getAdmin();
    must(await admin.from("account_change_requests").update({ status: "reviewed", reviewed_at: new Date().toISOString(), reviewed_by_label: label(context), review_note: data.note || null }).eq("id", data.id));
    return { ok: true };
  });

