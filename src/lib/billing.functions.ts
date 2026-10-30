import { cancelNowAllowed } from "@/lib/billing";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { limited, requireSession } from "@/lib/session.middleware";
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
  .middleware([limited("order")])
  .inputValidator((d: unknown) => z.object({ userId: uuid, planId: z.enum(["starter", "growth", "scale"]), notes: z.string().trim().max(1000).optional() }).parse(d))
  .handler(async ({ data, context }) => {
    await requireAdmin(context);
    const { getAdmin, issueStripeInvoice } = await import("@/lib/billing.server");
    const admin = await getAdmin();
    const plan = plans.find((p) => p.id === data.planId);
    if (!plan) throw new Error("Unknown plan.");
    const { data: prof } = await admin.from("profiles").select("account_number, company, first_name, last_name, status").eq("id", data.userId).single();
    if (!prof) throw new Error("Client not found.");
    if (prof.status === "fraud_kyc") throw new Error("This account is restricted for KYC review. Reinstate it before placing orders.");
    // Make sure Stripe is reachable and the client has a Stripe customer before anything is created locally.
    const { ensureCustomer } = await import("@/lib/stripe.server");
    await ensureCustomer(admin, data.userId);
    const app = await admin.from("applications").insert({ user_id: data.userId, account_number: prof.account_number, plan_id: plan.id, plan_name: plan.name, monthly_fee: plan.monthlyFee, monthly_hours: plan.monthlyHours, status: "approved", decided_at: new Date().toISOString(), internal_notes: data.notes ?? null }).select("id").single();
    if (app.error) throw new Error("Couldn't create the application.");
    await admin.from("application_events").insert({ application_id: app.data.id, actor_id: context.userId, actor_label: actorLabel(context), action: "Order created by staff; invoice sent", to_status: "approved", note: data.notes ?? null });
    const sub = await admin.from("subscriptions").insert({ user_id: data.userId, plan_name: plan.name, monthly_fee: plan.monthlyFee, monthly_hours: plan.monthlyHours, status: "pending", application_id: app.data.id, notes: "Awaiting payment of first invoice" }).select("id").single();
    if (sub.error) throw new Error("Couldn't create the subscription.");
    await admin.from("projects").insert({ user_id: data.userId, subscription_id: sub.data.id, name: prof.company || `${prof.first_name ?? ""} ${prof.last_name ?? ""}`.trim() || "Client project", service: "Marketing", status: "planned", description: `${plan.name} plan` });
    let inv;
    try {
      inv = await issueStripeInvoice(admin, {
      userId: data.userId, subscriptionId: sub.data.id, kind: "first", description: `${plan.name} plan, first month`,
      lines: [{ description: `${plan.name} plan, ${plan.monthlyHours} service hours per month`, amount: plan.monthlyFee }], idem: `order-${sub.data.id}`,
    });
    } catch (e) {
      // No half-made orders: if Stripe didn't take the invoice, the plan never starts.
      await admin.from("subscriptions").update({ status: "cancelled", cancelled_at: new Date().toISOString(), notes: `Order not completed: ${(e as Error).message}` }).eq("id", sub.data.id);
      await admin.from("projects").update({ status: "cancelled" }).eq("subscription_id", sub.data.id);
      await admin.from("applications").update({ archived_at: new Date().toISOString(), internal_notes: "Order not completed: Stripe invoice failed" }).eq("id", app.data.id);
      throw e;
    }
    return { subscriptionId: sub.data.id, invoiceId: inv.id as string };
  });

/** Sends the first invoice for a pending subscription (e.g. after approving a signup). Activation happens on payment. */
export const sendFirstInvoice = createServerFn({ method: "POST" })
  .middleware([limited("invoice")])
  .inputValidator((d: unknown) => z.object({ subscriptionId: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    await requireAdmin(context);
    const { getAdmin, issueStripeInvoice } = await import("@/lib/billing.server");
    const admin = await getAdmin();
    const { data: sub } = await admin.from("subscriptions").select("*").eq("id", data.subscriptionId).single();
    if (!sub || sub.status !== "pending") throw new Error("Only pending subscriptions can be invoiced.");
    const { data: owner } = await admin.from("profiles").select("status").eq("id", sub.user_id).maybeSingle();
    if (owner?.status === "fraud_kyc") throw new Error("This account is restricted for KYC review. Reinstate it before sending invoices.");
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
  .middleware([limited("subscriptionAction")])
  .inputValidator((d: unknown) => z.object({ subscriptionId: uuid, action: z.enum(["pause", "resume", "cancel_end", "cancel_now"]), reason: z.string().trim().min(3).max(1000) }).parse(d))
  .handler(async ({ data, context }) => {
    const staff = await staffActor(context);
    const { getAdmin, applyStripeStatus, applySubscriptionStanding, assertClientMayAct, voidOpenFirstInvoices } = await import("@/lib/billing.server");
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
      // No immediate cancellations once a plan has started: it runs to the end of the paid period, like Stripe's cancel at period end.
      if (!cancelNowAllowed(sub)) throw new Error("Plans that have started are cancelled at the end of the billing period. Choose 'Cancel at period end'.");
      await applyStripeStatus(sub, "cancelled");
      if (sub.status === "pending") await voidOpenFirstInvoices(admin, sub.id, `Subscription cancelled: ${data.reason}`);
      patch.status = "cancelled"; patch.cancelled_at = new Date().toISOString();
      await admin.from("projects").update({ status: "cancelled" }).eq("subscription_id", sub.id).in("status", ["planned", "active", "on_hold"]);
    }
    patch.notes = [patch.notes ?? sub.notes, note].filter(Boolean).join("\n");
    const up = await admin.from("subscriptions").update(patch).eq("id", sub.id);
    if (up.error) throw new Error("Couldn't update the subscription.");
    await applySubscriptionStanding(admin, sub.id, `Subscription ${data.action}`, actorLabel(context));
    await audit(admin, sub.user_id, "subscriptions", sub.id, data.action, { reason: data.reason, ...(patch.status ? { status: { from: sub.status, to: patch.status } } : {}), ...(patch.guarantee_status ? { guarantee: { from: "running", to: "void" } } : {}) }, context.userId, actorLabel(context));
    return { ok: true, guaranteeVoided: patch.guarantee_status === "void" };
  });

/** Bill hours used beyond the plan allowance, either on the next invoice or immediately. */
export const billOverage = createServerFn({ method: "POST" })
  .middleware([limited("invoice")])
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
  .middleware([limited("overageApproval")])
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
  .middleware([limited("collections")])
  .inputValidator((d: unknown) => z.object({
    invoiceId: uuid,
    action: z.enum(["flag", "court", "settle", "write_off", "pause_interest", "resume_interest", "issue_arrears"]),
    note: z.string().trim().min(3).max(2000),
    courtFees: z.array(z.object({ name: z.string().trim().min(2).max(120), amount: z.number().min(0).max(100000) })).max(10).optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    await requireAdmin(context);
    const { applySubscriptionStanding, getAdmin, issueArrears } = await import("@/lib/billing.server");
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
        setStage("written_off"); patch.interest_paused = true; patch.status = "uncollectible"; patch.void_reason = `Written off: ${data.note}`;
        if (inv.stripe_invoice_id) await stripe("POST", `invoices/${inv.stripe_invoice_id}/mark_uncollectible`);
        break;
      case "pause_interest": patch.interest_paused = true; break;
      case "resume_interest": patch.interest_paused = false; break;
      case "issue_arrears": await issueArrears(admin, inv.id); break;
    }
    const up = await admin.from("invoices").update(patch).eq("id", inv.id);
    if (up.error) throw new Error("Couldn't update the invoice.");
    // Mirror the recovery stage on the Stripe invoice and customer, so Stripe shows the same picture.
    if (inv.stripe_invoice_id && patch.collection_stage) {
      await stripe("POST", `invoices/${inv.stripe_invoice_id}`, { "metadata[collection_stage]": patch.collection_stage, "metadata[collection_note]": data.note.slice(0, 450) }).catch((e: Error) => console.error("Stripe invoice metadata", e.message));
      const { data: prof } = await admin.from("profiles").select("stripe_customer_id").eq("id", inv.user_id).maybeSingle();
      if (prof?.stripe_customer_id) await stripe("POST", `customers/${prof.stripe_customer_id}`, { "metadata[collections]": ["debt_recovery", "legal", "court"].includes(patch.collection_stage) ? patch.collection_stage : "" }).catch(() => null);
    }
    // The subscription, its Stripe billing, projects and application follow the debt.
    if (inv.subscription_id) await applySubscriptionStanding(admin, inv.subscription_id, `Invoice ${inv.number}: ${data.action.replace("_", " ")}`, actorLabel(context));
    await audit(admin, inv.user_id, "invoices", inv.id, `collections_${data.action}`, { note: data.note, ...(patch.collection_stage ? { collection_stage: { from: inv.collection_stage, to: patch.collection_stage } } : {}) }, context.userId, actorLabel(context));
    return { ok: true };
  });

/** Opens Stripe's hosted billing portal for the signed-in client (update card, see receipts). */
export const billingPortal = createServerFn({ method: "POST" })
  .middleware([limited("billingPortal")])
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
  .middleware([limited("stripeSync")])
  .handler(async ({ context }) => {
    await requireAdmin(context);
    const { getAdmin, runCollections } = await import("@/lib/billing.server");
    return { touched: await runCollections(await getAdmin()) };
  });

/** Staff issue a one-off Stripe invoice against a subscription. */
export const createInvoice = createServerFn({ method: "POST" })
  .middleware([limited("invoice")])
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
  .middleware([limited("refund")])
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
  .middleware([limited("invoice")])
  .inputValidator((d: unknown) => z.object({ invoiceIds: z.array(uuid).min(1).max(100), reason: z.string().trim().min(3).max(1000) }).parse(d))
  .handler(async ({ data, context }) => {
    await requireAdmin(context);
    const { applySubscriptionStanding, getAdmin, must, voidStripeInvoice } = await import("@/lib/billing.server");
    const { audit } = await import("@/lib/stripe.server");
    const admin = await getAdmin();
    const rows = must(await admin.from("invoices").select("*").in("id", data.invoiceIds)) ?? [];
    let voided = 0, skipped = 0;
    for (const inv of rows) {
      if (inv.status === "paid" || inv.status === "void") { skipped++; continue; }
      if (inv.stripe_invoice_id) await voidStripeInvoice(inv.stripe_invoice_id);
      must(await admin.from("invoices").update({ status: "void", void_reason: data.reason, interest_paused: true }).eq("id", inv.id));
      await audit(admin, inv.user_id, "invoices", inv.id, "void", { status: { from: inv.status, to: "void" }, reason: data.reason }, context.userId, actorLabel(context));
      // The plan, Stripe, projects and application follow what's still owed.
      if (inv.subscription_id) await applySubscriptionStanding(admin, inv.subscription_id, `Invoice ${inv.number} voided: ${data.reason}`, actorLabel(context));
      voided++;
    }
    return { voided, skipped };
  });

/** Webhook events the app needs Stripe to send. */
export const requiredStripeEvents = [
  "invoice.finalized", "invoice.paid", "invoice.payment_failed", "invoice.marked_uncollectible", "invoice.voided", "invoice.updated",
  "customer.subscription.created", "customer.subscription.updated", "customer.subscription.paused", "customer.subscription.resumed", "customer.subscription.deleted",
  "charge.refunded", "radar.early_fraud_warning.created", "charge.dispute.created",
];

/** Billing setup check for staff: key, account, webhook endpoint and events, and plans left waiting for an invoice. */
export const stripeHealth = createServerFn({ method: "POST" })
  .middleware([limited("lookup")])
  .handler(async ({ context }) => {
    await requireAdmin(context);
    const { stripe, stripeKey } = await import("@/lib/stripe.server");
    const { getAdmin } = await import("@/lib/billing.server");
    const { getRequest } = await import("@tanstack/react-start/server");
    const admin = await getAdmin();
    const key = stripeKey();
    const hookUrl = `${process.env["APP_URL"] ?? new URL(getRequest().url).origin}/api/public/stripe/webhook`;
    const checks: { label: string; ok: boolean; detail: string }[] = [];
    checks.push({ label: "Stripe secret key", ok: !!key, detail: key ? `${key.startsWith("sk_live") || key.startsWith("rk_live") ? "Live" : "Test"} mode key found` : "Not set. Add STRIPE_SECRET_KEY in Lovable's secrets." });
    let account = false;
    if (key) {
      try { const a = await stripe("GET", "balance"); account = !!a; checks.push({ label: "Connection to Stripe", ok: true, detail: "Stripe accepted the key" }); }
      catch (e) { checks.push({ label: "Connection to Stripe", ok: false, detail: (e as Error).message }); }
    }
    const { webhookSecrets } = await import("@/lib/stripe.server");
    const hasSecret = (await webhookSecrets(admin)).length > 0;
    checks.push({ label: "Webhook signing secret", ok: hasSecret, detail: hasSecret ? "Set" : "Not set. Use \"Set up webhook automatically\" below." });
    if (account) {
      try {
        const hooks = await stripe("GET", "webhook_endpoints", { limit: 100 });
        const ours = (hooks.data ?? []).find((h: { url: string }) => h.url === hookUrl);
        const events: string[] = ours?.enabled_events ?? [];
        const missing = ours && !events.includes("*") ? requiredStripeEvents.filter((e) => !events.includes(e)) : requiredStripeEvents;
        checks.push({ label: "Webhook endpoint", ok: !!ours && ours.status === "enabled", detail: ours ? `${hookUrl} (${ours.status})` : `No endpoint for ${hookUrl}. Add it in Stripe, Developers, Webhooks.` });
        if (ours) checks.push({ label: "Webhook events", ok: missing.length === 0, detail: missing.length ? `Missing: ${missing.join(", ")}` : "All required events are sent" });
      } catch { checks.push({ label: "Webhook endpoint", ok: false, detail: `Couldn't read webhook settings with this key. Make sure ${hookUrl} is added in Stripe with the required events.` }); }
    }
    const { data: lastEvent } = await admin.from("stripe_events").select("type, received_at").order("received_at", { ascending: false }).limit(1).maybeSingle();
    checks.push({ label: "Last event received", ok: !!lastEvent, detail: lastEvent ? `${lastEvent.type}, ${new Date(lastEvent.received_at).toLocaleString("en-GB")}` : "None yet. Payments won't activate plans until Stripe events arrive." });
    // Plans waiting for a first invoice that was never created in Stripe.
    const { data: pending } = await admin.from("subscriptions").select("id, user_id, plan_name, created_at").eq("status", "pending");
    const { data: firsts } = await admin.from("invoices").select("subscription_id").eq("kind", "first").neq("status", "void");
    const invoiced = new Set((firsts ?? []).map((i: { subscription_id: string }) => i.subscription_id));
    const waiting = (pending ?? []).filter((p: { id: string }) => !invoiced.has(p.id));
    return { checks, webhookUrl: hookUrl, events: requiredStripeEvents, waiting: waiting as { id: string; user_id: string; plan_name: string; created_at: string }[] };
  });

/** Creates the Stripe webhook endpoint for this site and stores its signing secret server side (never sent to the browser).
 * Stripe only reveals a secret when an endpoint is created, so any existing endpoint for the same URL is replaced. */
export const setupStripeWebhook = createServerFn({ method: "POST" })
  .middleware([limited("stripeSetup")])
  .handler(async ({ context }) => {
    await requireAdmin(context);
    const { stripe, audit } = await import("@/lib/stripe.server");
    const { getAdmin, must } = await import("@/lib/billing.server");
    const { getRequest } = await import("@tanstack/react-start/server");
    const admin = await getAdmin();
    const url = `${process.env["APP_URL"] ?? new URL(getRequest().url).origin}/api/public/stripe/webhook`;
    if (!url.startsWith("https://")) throw new Error("Stripe webhooks need an https address. Open the published site to set this up.");
    const created = await stripe("POST", "webhook_endpoints", { url, description: "CRM billing sync", ...Object.fromEntries(requiredStripeEvents.map((e, i) => [`enabled_events[${i}]`, e])) });
    if (!created?.secret) throw new Error("Stripe didn't return a signing secret.");
    must(await admin.from("app_secrets").upsert({ name: "stripe_webhook_secret", value: created.secret, updated_at: new Date().toISOString() }));
    // Older endpoints for the same address would send every event twice; their secrets can't be read back, so remove them.
    const hooks = await stripe("GET", "webhook_endpoints", { limit: 100 });
    let replaced = 0;
    for (const h of hooks.data ?? []) if (h.url === url && h.id !== created.id) { await stripe("DELETE", `webhook_endpoints/${h.id}`); replaced++; }
    await audit(admin, context.userId, "stripe_webhook", context.userId, "stripe_webhook_setup", { url, endpoint: created.id, replaced }, context.userId, actorLabel(context));
    return { url, replaced };
  });

/** Imports one page of Stripe customers (clients, subscriptions, invoices, payments). Call again with `next` until it's null. */
export const importFromStripe = createServerFn({ method: "POST" })
  .middleware([limited("stripeImport")])
  .inputValidator((d: unknown) => z.object({ cursor: z.string().max(100).regex(/^cus_\w+$/).optional() }).parse(d))
  .handler(async ({ data, context }) => {
    await requireAdmin(context);
    const { getAdmin } = await import("@/lib/billing.server");
    const { importStripePage } = await import("@/lib/stripe-import.server");
    const { audit } = await import("@/lib/stripe.server");
    const admin = await getAdmin();
    const r = await importStripePage(admin, data.cursor);
    await audit(admin, context.userId, "stripe_import", context.userId, "stripe_import_page", { ...r.counts, skipped: r.counts.skipped.length }, context.userId, actorLabel(context));
    return r;
  });

/** Brings every local subscription and unpaid invoice in line with Stripe now (the same check runs daily). */
export const syncStripeNow = createServerFn({ method: "POST" })
  .middleware([limited("stripeSync")])
  .handler(async ({ context }) => {
    await requireAdmin(context);
    const { getAdmin, reconcileStripe } = await import("@/lib/billing.server");
    return reconcileStripe(await getAdmin(), 1000);
  });

/** Which database updates (migrations) are missing, so staff know to apply them in Lovable. */
export const schemaStatus = createServerFn({ method: "POST" })
  .middleware([limited("lookup")])
  .handler(async ({ context }) => {
    const { isStaff } = await import("@/lib/access.server");
    if (!(await isStaff(context))) throw new Error("Forbidden");
    const { getAdmin } = await import("@/lib/billing.server");
    const admin = await getAdmin();
    // One object each migration creates; a missing one means that migration hasn't run.
    const probes: [string, string, string][] = [
      ["0011_client_admin_flow_gaps", "notifications", "id"],
      ["0012_account_security_saas", "sign_in_events", "id"],
      ["0012_account_security_saas", "subscriptions", "paused_by_account_status"],
    ];
    const missing = new Set<string>();
    for (const [tag, table, column] of probes) {
      const { error } = await admin.from(table).select(column).limit(1);
      if (error) missing.add(tag);
    }
    return { missing: [...missing] };
  });
