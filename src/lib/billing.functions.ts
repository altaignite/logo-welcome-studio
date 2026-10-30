import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSession } from "@/lib/session.middleware";
import { plans } from "@/lib/signup";

type Ctx = { supabase: any; userId: string; claims: any };
/** Billing actions need the billing permission (see src/lib/staff.ts). */
async function requireAdmin(ctx: Ctx) {
  const { requirePerm } = await import("@/lib/access.server");
  await requirePerm(ctx, "billing");
}
/** Staff acting on a client's behalf: any staff member is treated as staff, but must hold the billing permission to act. */
async function staffActor(ctx: Ctx) {
  const { isStaff } = await import("@/lib/access.server");
  if (!(await isStaff(ctx))) return false;
  await requireAdmin(ctx);
  return true;
}
const actorLabel = (ctx: Ctx) => String(ctx.claims?.email ?? "Client");
const uuid = z.string().uuid();

/** Staff create an order: approved application, pending subscription and project, and a Stripe invoice emailed to the client. */
export const createOrder = createServerFn({ method: "POST" })
  .middleware([requireSession])
  .inputValidator((d: unknown) => z.object({ userId: uuid, planId: z.enum(["starter", "growth", "scale"]), notes: z.string().trim().max(1000).optional() }).parse(d))
  .handler(async ({ data, context }) => {
    await requireAdmin(context);
    const { getAdmin, issueStripeInvoice } = await import("@/lib/billing.server");
    const admin = await getAdmin();
    const plan = plans.find((p) => p.id === data.planId)!;
    const { data: prof } = await admin.from("profiles").select("account_number, company, first_name, last_name").eq("id", data.userId).single();
    if (!prof) throw new Error("Client not found.");
    const app = await admin.from("applications").insert({ user_id: data.userId, account_number: prof.account_number, plan_id: plan.id, plan_name: plan.name, monthly_fee: plan.monthlyFee, monthly_hours: plan.monthlyHours, status: "approved", decided_at: new Date().toISOString(), internal_notes: data.notes ?? null }).select("id").single();
    if (app.error) throw new Error("Couldn't create the application.");
    await admin.from("application_events").insert({ application_id: app.data.id, actor_id: context.userId, actor_label: actorLabel(context), action: "Order created by staff; invoice sent", to_status: "approved", note: data.notes ?? null });
    const sub = await admin.from("subscriptions").insert({ user_id: data.userId, plan_name: plan.name, monthly_fee: plan.monthlyFee, monthly_hours: plan.monthlyHours, status: "pending", application_id: app.data.id, notes: "Awaiting payment of first invoice" }).select("id").single();
    if (sub.error) throw new Error("Couldn't create the subscription.");
    await admin.from("projects").insert({ user_id: data.userId, subscription_id: sub.data.id, name: prof.company || `${prof.first_name ?? ""} ${prof.last_name ?? ""}`.trim() || "Client project", service: "Marketing", status: "planned", description: `${plan.name} plan` });
    const inv = await issueStripeInvoice(admin, {
      userId: data.userId, subscriptionId: sub.data.id, kind: "first", description: `${plan.name} plan, first month`,
      lines: [{ description: `${plan.name} plan, ${plan.monthlyHours} service hours per month`, amount: plan.monthlyFee }], idem: `order-${sub.data.id}`,
    });
    return { subscriptionId: sub.data.id, invoiceId: inv.id as string };
  });

/** Sends the first invoice for a pending subscription (e.g. after approving a signup). Activation happens on payment. */
export const sendFirstInvoice = createServerFn({ method: "POST" })
  .middleware([requireSession])
  .inputValidator((d: unknown) => z.object({ subscriptionId: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    await requireAdmin(context);
    const { getAdmin, issueStripeInvoice } = await import("@/lib/billing.server");
    const admin = await getAdmin();
    const { data: sub } = await admin.from("subscriptions").select("*").eq("id", data.subscriptionId).single();
    if (!sub || sub.status !== "pending") throw new Error("Only pending subscriptions can be invoiced.");
    const { data: existing } = await admin.from("invoices").select("id").eq("subscription_id", sub.id).eq("kind", "first").neq("status", "void").maybeSingle();
    if (existing) throw new Error("A first invoice was already sent.");
    const inv = await issueStripeInvoice(admin, {
      userId: sub.user_id, subscriptionId: sub.id, kind: "first", description: `${sub.plan_name} plan, first month`,
      lines: [{ description: `${sub.plan_name} plan, ${sub.monthly_hours} service hours per month`, amount: Number(sub.monthly_fee) }], idem: `first-${sub.id}`,
    });
    return { invoiceId: inv.id as string };
  });

/** Pause, resume or cancel a subscription. Clients may act on their own; staff on any. */
export const subscriptionAction = createServerFn({ method: "POST" })
  .middleware([requireSession])
  .inputValidator((d: unknown) => z.object({ subscriptionId: uuid, action: z.enum(["pause", "resume", "cancel_end", "cancel_now"]), reason: z.string().trim().min(3).max(1000) }).parse(d))
  .handler(async ({ data, context }) => {
    const staff = await staffActor(context);
    const { getAdmin, applyStripeStatus, assertClientMayAct, voidOpenFirstInvoices } = await import("@/lib/billing.server");
    const { stripe, audit } = await import("@/lib/stripe.server");
    const { pauseVoidsGuarantee } = await import("@/lib/billing");
    const admin = await getAdmin();
    const { data: sub } = await admin.from("subscriptions").select("*").eq("id", data.subscriptionId).single();
    if (!sub || (!staff && sub.user_id !== context.userId)) throw new Error("Subscription not found.");
    if (sub.status === "cancelled") throw new Error("This subscription is already cancelled.");
    if (!staff && sub.status === "suspended") throw new Error("Please settle the outstanding invoice or contact support.");
    // Clients may still cancel during a staff hold, but not resume their own billing.
    if (!staff && data.action === "resume") await assertClientMayAct(admin, context.userId);
    const sid = sub.stripe_subscription_id as string | null;
    const patch: any = {};
    const note = `${new Date().toISOString().slice(0, 10)} ${data.action.replace("_", " ")} by ${staff ? "staff" : "client"}: ${data.reason}`;
    if (data.action === "pause") {
      if (sub.status !== "active" && sub.status !== "past_due") throw new Error("Only active subscriptions can be paused.");
      await applyStripeStatus(sub, "paused");
      patch.status = "paused";
      if (sub.guarantee_status === "running" && pauseVoidsGuarantee(sub.started_at)) { patch.guarantee_status = "void"; patch.guarantee_void_reason = "Paused within the first 90 days"; }
    } else if (data.action === "resume") {
      if (sub.status !== "paused") throw new Error("Only paused subscriptions can be resumed.");
      await applyStripeStatus(sub, "active");
      // A plan paused before its first payment goes back to waiting for that payment, not straight to active.
      patch.status = sub.started_at ? "active" : "pending";
    } else if (data.action === "cancel_end") {
      if (sid) await stripe("POST", `subscriptions/${sid}`, { cancel_at_period_end: true });
      patch.cancel_at_period_end = true;
      patch.notes = [sub.notes, `Cancels at period end (${sub.renews_at?.slice(0, 10) ?? "next renewal"})`].filter(Boolean).join("\n");
    } else {
      await applyStripeStatus(sub, "cancelled");
      if (sub.status === "pending") await voidOpenFirstInvoices(admin, sub.id, `Subscription cancelled: ${data.reason}`);
      patch.status = "cancelled"; patch.cancelled_at = new Date().toISOString();
      await admin.from("projects").update({ status: "cancelled" }).eq("subscription_id", sub.id).in("status", ["planned", "active", "on_hold"]);
    }
    patch.notes = [patch.notes ?? sub.notes, note].filter(Boolean).join("\n");
    const up = await admin.from("subscriptions").update(patch).eq("id", sub.id);
    if (up.error) throw new Error("Couldn't update the subscription.");
    await audit(admin, sub.user_id, "subscriptions", sub.id, data.action, { reason: data.reason, ...(patch.status ? { status: { from: sub.status, to: patch.status } } : {}), ...(patch.guarantee_status ? { guarantee: { from: "running", to: "void" } } : {}) }, context.userId, actorLabel(context));
    return { ok: true, guaranteeVoided: patch.guarantee_status === "void" };
  });

/** Bill hours used beyond the plan allowance, either on the next invoice or immediately. */
export const billOverage = createServerFn({ method: "POST" })
  .middleware([requireSession])
  .inputValidator((d: unknown) => z.object({ subscriptionId: uuid, when: z.enum(["next_invoice", "now"]) }).parse(d))
  .handler(async ({ data, context }) => {
    await requireAdmin(context);
    const { getAdmin, issueStripeInvoice, loadRules, must } = await import("@/lib/billing.server");
    const { stripe, ensureCustomer, cents } = await import("@/lib/stripe.server");
    const { unbilledOverage, overageAmount } = await import("@/lib/billing");
    const admin = await getAdmin();
    const rules = await loadRules(admin);
    const { data: sub } = await admin.from("subscriptions").select("*").eq("id", data.subscriptionId).single();
    if (!sub) throw new Error("Subscription not found.");
    const hours = unbilledOverage(Number(sub.hours_used), Number(sub.monthly_hours), Number(sub.overage_billed_hours));
    if (hours <= 0) throw new Error("There are no unbilled extra hours.");
    if (data.when === "next_invoice" && !sub.stripe_subscription_id) throw new Error("This plan isn't billed monthly in Stripe yet. Bill the extra hours now instead.");
    const billedBefore = Number(sub.overage_billed_hours);
    // Claim the hours first so a double click or a second staff member can't bill them twice.
    const claimed = must(await admin.from("subscriptions").update({ overage_billed_hours: billedBefore + hours }).eq("id", sub.id).eq("overage_billed_hours", billedBefore).select("id"));
    if (!claimed?.length) throw new Error("These hours were just billed. Refresh to see the latest.");
    const release = () => admin.from("subscriptions").update({ overage_billed_hours: billedBefore }).eq("id", sub.id).eq("overage_billed_hours", billedBefore + hours);
    const amount = overageAmount(hours, sub.plan_name, rules);
    const desc = `${hours} extra hours at $${rules.overage_rates[sub.plan_name] ?? 60}/hour`;
    let stripeItem: string | null = null; let billed: string | null = null;
    try {
      if (data.when === "now") {
        const inv = await issueStripeInvoice(admin, { userId: sub.user_id, subscriptionId: sub.id, kind: "overage", description: "Extra service hours", lines: [{ description: desc, amount }], idem: `ovr-${sub.id}-${billedBefore}-${hours}` });
        billed = inv.id;
      } else {
        const customer = await ensureCustomer(admin, sub.user_id);
        const it = await stripe("POST", "invoiceitems", { customer, currency: "usd", amount: cents(amount), description: desc, subscription: sub.stripe_subscription_id }, `ovr-item-${sub.id}-${billedBefore}-${hours}`);
        stripeItem = it.id;
      }
    } catch (e) {
      await release();
      throw e;
    }
    must(await admin.from("invoice_charges").insert({ user_id: sub.user_id, subscription_id: sub.id, kind: "overage", description: desc, amount, stripe_item_id: stripeItem, billed_invoice_id: billed, actor_label: actorLabel(context) }));
    return { hours, amount };
  });

/** Client (own task) or staff approve extra-hours work on a task. */
export const approveOverage = createServerFn({ method: "POST" })
  .middleware([requireSession])
  .inputValidator((d: unknown) => z.object({ taskId: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    const staff = await staffActor(context);
    const { getAdmin, assertClientMayAct } = await import("@/lib/billing.server");
    const { audit } = await import("@/lib/stripe.server");
    const admin = await getAdmin();
    const { data: t } = await admin.from("tasks").select("id, user_id").eq("id", data.taskId).single();
    if (!t || (!staff && t.user_id !== context.userId)) throw new Error("Task not found.");
    if (!staff) await assertClientMayAct(admin, context.userId);
    await admin.from("tasks").update({ overage_approved: true }).eq("id", t.id);
    await audit(admin, t.user_id, "tasks", t.id, "overage_approved", { overage_approved: { from: false, to: true } }, context.userId, actorLabel(context));
    return { ok: true };
  });

/** Debt recovery actions on an unpaid invoice (staff only). */
export const collectionAction = createServerFn({ method: "POST" })
  .middleware([requireSession])
  .inputValidator((d: unknown) => z.object({
    invoiceId: uuid,
    action: z.enum(["flag", "court", "settle", "write_off", "pause_interest", "resume_interest", "issue_arrears"]),
    note: z.string().trim().min(3).max(2000),
    courtFees: z.array(z.object({ name: z.string().trim().min(2).max(120), amount: z.number().min(0).max(100000) })).max(10).optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    await requireAdmin(context);
    const { getAdmin, issueArrears } = await import("@/lib/billing.server");
    const { audit, stripe } = await import("@/lib/stripe.server");
    const { collectionActionAllowed } = await import("@/lib/billing");
    const admin = await getAdmin();
    const { data: inv } = await admin.from("invoices").select("*").eq("id", data.invoiceId).single();
    if (!inv) throw new Error("Invoice not found.");
    if (!collectionActionAllowed(data.action, inv.status)) throw new Error("Only unpaid invoices can be moved through collections.");
    const stamp = `${new Date().toISOString().slice(0, 10)} ${actorLabel(context)}: ${data.note}`;
    const patch: any = { collection_notes: [inv.collection_notes, stamp].filter(Boolean).join("\n") };
    const setStage = (s: string) => { patch.collection_stage = s; patch.stage_changed_at = new Date().toISOString(); };
    switch (data.action) {
      case "flag": setStage("debt_recovery"); break;
      case "court": {
        if (!["legal", "debt_recovery", "overdue"].includes(inv.collection_stage)) throw new Error("Only unpaid invoices in collections can go to court.");
        setStage("court");
        const fees = data.courtFees ?? [];
        let total = 0;
        for (const f of fees) if (f.amount > 0) { total += f.amount; await admin.from("invoice_charges").insert({ user_id: inv.user_id, invoice_id: inv.id, subscription_id: inv.subscription_id, kind: "court_fee", description: f.name, amount: f.amount, actor_label: actorLabel(context) }); }
        patch.fees_accrued = Number(inv.fees_accrued) + total;
        break;
      }
      case "settle": setStage("settled"); patch.interest_paused = true; break;
      case "write_off":
        setStage("written_off"); patch.interest_paused = true; patch.status = "void"; patch.void_reason = `Written off: ${data.note}`;
        if (inv.stripe_invoice_id) await stripe("POST", `invoices/${inv.stripe_invoice_id}/mark_uncollectible`).catch(() => null);
        break;
      case "pause_interest": patch.interest_paused = true; break;
      case "resume_interest": patch.interest_paused = false; break;
      case "issue_arrears": await issueArrears(admin, inv.id); break;
    }
    const up = await admin.from("invoices").update(patch).eq("id", inv.id);
    if (up.error) throw new Error("Couldn't update the invoice.");
    await audit(admin, inv.user_id, "invoices", inv.id, `collections_${data.action}`, { note: data.note, ...(patch.collection_stage ? { collection_stage: { from: inv.collection_stage, to: patch.collection_stage } } : {}) }, context.userId, actorLabel(context));
    return { ok: true };
  });

/** Opens Stripe's hosted billing portal for the signed-in client (update card, see receipts). */
export const billingPortal = createServerFn({ method: "POST" })
  .middleware([requireSession])
  .handler(async ({ context }) => {
    const { getAdmin } = await import("@/lib/billing.server");
    const { stripe, ensureCustomer } = await import("@/lib/stripe.server");
    const admin = await getAdmin();
    const { getRequest } = await import("@tanstack/react-start/server");
    const origin = new URL(getRequest().url).origin;
    const customer = await ensureCustomer(admin, context.userId);
    const s = await stripe("POST", "billing_portal/sessions", { customer, return_url: `${origin}/dashboard` });
    return { url: s.url as string };
  });

/** Staff run the collections job on demand (the same job runs daily). */
export const runCollectionsNow = createServerFn({ method: "POST" })
  .middleware([requireSession])
  .handler(async ({ context }) => {
    await requireAdmin(context);
    const { getAdmin, runCollections } = await import("@/lib/billing.server");
    return { touched: await runCollections(await getAdmin()) };
  });

/** Staff issue a one-off Stripe invoice against a subscription. */
export const createInvoice = createServerFn({ method: "POST" })
  .middleware([requireSession])
  .inputValidator((d: unknown) => z.object({ subscriptionId: uuid, description: z.string().trim().min(2).max(300), amount: z.number().positive().max(1000000) }).parse(d))
  .handler(async ({ data, context }) => {
    await requireAdmin(context);
    const { getAdmin, issueStripeInvoice } = await import("@/lib/billing.server");
    const admin = await getAdmin();
    const { data: sub } = await admin.from("subscriptions").select("id, user_id").eq("id", data.subscriptionId).single();
    if (!sub) throw new Error("Subscription not found.");
    const inv = await issueStripeInvoice(admin, { userId: sub.user_id, subscriptionId: sub.id, kind: "service", description: data.description, lines: [{ description: data.description, amount: data.amount }], idem: `svc-${sub.id}-${crypto.randomUUID()}` });
    return { invoiceId: inv.id as string };
  });

/** Refunds service fees through Stripe under the 90-day guarantee (only while it is still running). */
export const guaranteeRefund = createServerFn({ method: "POST" })
  .middleware([requireSession])
  .inputValidator((d: unknown) => z.object({ subscriptionId: uuid, amount: z.number().positive().max(100000), reason: z.string().trim().min(3).max(1000) }).parse(d))
  .handler(async ({ data, context }) => {
    await requireAdmin(context);
    const { getAdmin } = await import("@/lib/billing.server");
    const { stripe, cents, audit } = await import("@/lib/stripe.server");
    const { guaranteeCheck } = await import("@/lib/billing");
    const { planRefund } = await import("@/lib/billing");
    const admin = await getAdmin();
    const { data: sub } = await admin.from("subscriptions").select("*").eq("id", data.subscriptionId).single();
    const { data: subInvoices } = await admin.from("invoices").select("status, collection_stage, failed_payment_at").eq("subscription_id", data.subscriptionId);
    // A claim made while every rule passed can be refunded later; otherwise the rules must pass now.
    if (!sub || sub.sales_received || !(sub.guarantee_status === "claimed" || guaranteeCheck(sub, subInvoices ?? []).eligible)) throw new Error("This subscription isn't eligible for a guarantee refund.");
    const { data: paid } = await admin.from("invoices").select("stripe_invoice_id").eq("subscription_id", sub.id).eq("status", "paid").not("stripe_invoice_id", "is", null).in("kind", ["first", "renewal", "service"]);
    // What's still refundable comes from Stripe, so refunds made earlier (or by a retry after a partial failure) are never repeated.
    const sources: { pi: string; refundable: number; refunded: number }[] = [];
    for (const i of paid ?? []) {
      const inv = await stripe("GET", `invoices/${i.stripe_invoice_id}`, { "expand[]": "payments" });
      const raw = inv.payment_intent ?? inv.payments?.data?.[0]?.payment?.payment_intent;
      const pi = typeof raw === "string" ? raw : raw?.id;
      if (!pi) continue;
      const intent = await stripe("GET", `payment_intents/${pi}`, { "expand[]": "latest_charge" });
      const charge = intent.latest_charge;
      const refunded = Number(charge?.amount_refunded ?? 0);
      const refundable = Number(charge?.amount_captured ?? intent.amount_received ?? 0) - refunded;
      if (refundable > 0) sources.push({ pi, refundable, refunded });
    }
    const plan = planRefund(cents(data.amount), sources);
    if (!plan) throw new Error(`You can refund at most $${sources.reduce((s, x) => s + x.refundable, 0) / 100} of paid service fees.`);
    for (const p of plan) {
      await stripe("POST", "refunds", { payment_intent: p.pi, amount: p.amount, "metadata[reason]": "90-day guarantee", "metadata[subscription_id]": sub.id }, `refund-${p.pi}-${p.refunded}-${p.amount}`);
    }
    await admin.from("subscriptions").update({ guarantee_status: "refunded" }).eq("id", sub.id);
    await audit(admin, sub.user_id, "subscriptions", sub.id, "guarantee_refund", { amount: data.amount, reason: data.reason }, context.userId, actorLabel(context));
    return { ok: true };
  });

/** Voids unpaid invoices in Stripe first, then locally, so a voided invoice can't still be paid. Paid invoices are skipped. */
export const voidInvoices = createServerFn({ method: "POST" })
  .middleware([requireSession])
  .inputValidator((d: unknown) => z.object({ invoiceIds: z.array(uuid).min(1).max(100), reason: z.string().trim().min(3).max(1000) }).parse(d))
  .handler(async ({ data, context }) => {
    await requireAdmin(context);
    const { getAdmin, must, voidStripeInvoice } = await import("@/lib/billing.server");
    const { audit } = await import("@/lib/stripe.server");
    const admin = await getAdmin();
    const rows = must(await admin.from("invoices").select("*").in("id", data.invoiceIds)) ?? [];
    let voided = 0, skipped = 0;
    for (const inv of rows) {
      if (inv.status === "paid" || inv.status === "void") { skipped++; continue; }
      if (inv.stripe_invoice_id) await voidStripeInvoice(inv.stripe_invoice_id);
      must(await admin.from("invoices").update({ status: "void", void_reason: data.reason, interest_paused: true }).eq("id", inv.id));
      await audit(admin, inv.user_id, "invoices", inv.id, "void", { status: { from: inv.status, to: "void" }, reason: data.reason }, context.userId, actorLabel(context));
      voided++;
    }
    return { voided, skipped };
  });
