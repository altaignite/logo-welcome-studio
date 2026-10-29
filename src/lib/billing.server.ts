/** Server-only billing workflows shared by server functions, the Stripe webhook and the daily collections job. */
import { audit, cents, ensureCustomer, planPrice, stripe } from "@/lib/stripe.server";
import { autoStage, compoundInterest, daysOverdue, defaultRules, failedPaymentVoidsGuarantee, legalFee, monthsOverdue, round2, type BillingRules, type CollectionStage } from "@/lib/billing";
import { guaranteeEnd } from "@/lib/admin";

type Admin = any;
const today = () => new Date().toISOString().slice(0, 10);

export async function getAdmin(): Promise<Admin> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

export async function loadRules(admin: Admin): Promise<BillingRules> {
  const { data } = await admin.from("billing_settings").select("*").eq("id", 1).maybeSingle();
  return data ? { ...defaultRules, ...data } : defaultRules;
}

/** Creates, finalizes and emails a one-off Stripe invoice, mirrors it locally and returns the local row. */
export async function issueStripeInvoice(admin: Admin, o: {
  userId: string; subscriptionId: string | null; kind: string; description: string;
  lines: { description: string; amount: number }[]; metadata?: Record<string, string>; idem: string; daysUntilDue?: number;
}) {
  const customer = await ensureCustomer(admin, o.userId);
  const meta: Record<string, string> = { kind: o.kind, user_id: o.userId, ...(o.subscriptionId ? { subscription_id: o.subscriptionId } : {}), ...(o.metadata ?? {}) };
  const metaParams = Object.fromEntries(Object.entries(meta).map(([k, v]) => [`metadata[${k}]`, v]));
  const inv = await stripe("POST", "invoices", {
    customer, collection_method: "send_invoice", days_until_due: o.daysUntilDue ?? 7, description: o.description,
    pending_invoice_items_behavior: "exclude", auto_advance: false, ...metaParams,
  }, `inv-${o.idem}`);
  for (const [i, l] of o.lines.entries()) {
    await stripe("POST", "invoiceitems", { customer, invoice: inv.id, currency: "usd", amount: cents(l.amount), description: l.description }, `ii-${o.idem}-${i}`);
  }
  const fin = await stripe("POST", `invoices/${inv.id}/finalize`, {}, `fin-${o.idem}`);
  await stripe("POST", `invoices/${inv.id}/send`, {}, `send-${o.idem}`).catch(() => null);
  const total = round2(o.lines.reduce((s, l) => s + l.amount, 0));
  const due = new Date(Date.now() + (o.daysUntilDue ?? 7) * 864e5).toISOString().slice(0, 10);
  const { data: row, error } = await admin.from("invoices").upsert({
    user_id: o.userId, subscription_id: o.subscriptionId, number: fin.number ?? inv.id, amount: total, description: o.description,
    due_at: due, status: "open", kind: o.kind, stripe_invoice_id: inv.id, hosted_url: fin.hosted_invoice_url, pdf_url: fin.invoice_pdf,
  }, { onConflict: "stripe_invoice_id" }).select("*").single();
  if (error) throw new Error("Invoice was sent but couldn't be saved locally.");
  return row;
}

/** Activation after the first invoice is paid: starts the Stripe subscription, project and guarantee window. */
export async function activateSubscription(admin: Admin, subId: string) {
  const { data: sub } = await admin.from("subscriptions").select("*").eq("id", subId).single();
  if (!sub || sub.status === "active") return;
  const now = new Date(); const next = new Date(now); next.setMonth(next.getMonth() + 1);
  let stripeSubId: string | null = sub.stripe_subscription_id;
  if (!stripeSubId) {
    const customer = await ensureCustomer(admin, sub.user_id);
    const price = await planPrice(sub.plan_name, Number(sub.monthly_fee));
    const pms = await stripe("GET", "payment_methods", { customer, type: "card", limit: 1 }).catch(() => ({ data: [] }));
    const pm = pms.data?.[0]?.id as string | undefined;
    const s = await stripe("POST", "subscriptions", {
      customer, "items[0][price]": price, trial_end: Math.floor(next.getTime() / 1000), "metadata[subscription_id]": subId, "metadata[user_id]": sub.user_id,
      ...(pm ? { default_payment_method: pm, collection_method: "charge_automatically" } : { collection_method: "send_invoice", days_until_due: 7 }),
    }, `sub-${subId}`);
    stripeSubId = s.id;
  }
  await admin.from("subscriptions").update({
    status: "active", started_at: now.toISOString(), first_paid_at: sub.first_paid_at ?? now.toISOString(), renews_at: next.toISOString(),
    guarantee_ends_at: guaranteeEnd(now).toISOString(), guarantee_status: "running", stripe_subscription_id: stripeSubId, payment_warning: null,
  }).eq("id", subId);
  await admin.from("projects").update({ status: "active", started_at: today() }).eq("subscription_id", subId).in("status", ["planned", "pending", "on_hold"]);
  if (sub.application_id) await admin.from("applications").update({ status: "approved", decided_at: now.toISOString() }).eq("id", sub.application_id).in("status", ["submitted", "in_review", "escalated", "info_requested"]);
  await audit(admin, sub.user_id, "subscriptions", subId, "activated", { status: { from: sub.status, to: "active" }, reason: "First invoice paid" }, null, "Stripe");
}

/** Suspends subscription, its projects and its application after payment failure retries end. */
export async function suspendForNonPayment(admin: Admin, subId: string, note: string) {
  const { data: sub } = await admin.from("subscriptions").select("*").eq("id", subId).single();
  if (!sub || sub.status === "suspended" || sub.status === "cancelled") return;
  const warning = `Suspended for non-payment: ${note}`;
  await admin.from("subscriptions").update({ status: "suspended", payment_warning: warning, notes: [sub.notes, `${today()} ${warning}`].filter(Boolean).join("\n") }).eq("id", subId);
  await admin.from("projects").update({ status: "on_hold" }).eq("subscription_id", subId).eq("status", "active");
  if (sub.application_id) {
    await admin.from("applications").update({ status: "suspended" }).eq("id", sub.application_id);
    await admin.from("application_events").insert({ application_id: sub.application_id, actor_label: "Stripe", action: "Suspended for non-payment", to_status: "suspended", note });
  }
  await audit(admin, sub.user_id, "subscriptions", subId, "suspended", { status: { from: sub.status, to: "suspended" }, reason: note }, null, "Stripe");
}

export async function reinstateAfterPayment(admin: Admin, subId: string) {
  const { data: sub } = await admin.from("subscriptions").select("*").eq("id", subId).single();
  if (!sub || (sub.status !== "suspended" && sub.status !== "past_due")) return;
  await admin.from("subscriptions").update({ status: "active", payment_warning: null }).eq("id", subId);
  await admin.from("projects").update({ status: "active" }).eq("subscription_id", subId).eq("status", "on_hold");
  if (sub.application_id && sub.status === "suspended") {
    await admin.from("applications").update({ status: "approved" }).eq("id", sub.application_id).eq("status", "suspended");
    await admin.from("application_events").insert({ application_id: sub.application_id, actor_label: "Stripe", action: "Reinstated after payment", to_status: "approved", note: "Outstanding invoice paid" });
  }
  await audit(admin, sub.user_id, "subscriptions", subId, "reinstated", { status: { from: sub.status, to: "active" }, reason: "Payment received" }, null, "Stripe");
}

export async function markPastDue(admin: Admin, subId: string, note: string) {
  const { data: sub } = await admin.from("subscriptions").select("*").eq("id", subId).single();
  if (!sub) return;
  const voids = failedPaymentVoidsGuarantee(sub.first_paid_at) && sub.guarantee_status === "running";
  await admin.from("subscriptions").update({
    status: sub.status === "suspended" ? "suspended" : "past_due", payment_warning: `Payment failed: ${note}`,
    ...(voids ? { guarantee_status: "void", guarantee_void_reason: "Failed payment after the initial successful payment" } : {}),
  }).eq("id", subId);
  await audit(admin, sub.user_id, "subscriptions", subId, "payment_failed", { note, ...(voids ? { guarantee: { from: "running", to: "void" } } : {}) }, null, "Stripe");
}

/** Daily run: accrue compound interest, move stages, add legal fees. Returns number of invoices touched. */
export async function runCollections(admin: Admin, now = new Date()) {
  const rules = await loadRules(admin);
  const { data: rows } = await admin.from("invoices").select("*").in("status", ["open", "overdue"]).neq("kind", "arrears").lt("due_at", now.toISOString().slice(0, 10));
  let touched = 0;
  for (const inv of rows ?? []) {
    const stage = inv.collection_stage as CollectionStage;
    if (stage === "settled" || stage === "written_off") continue;
    const patch: any = { status: "overdue" };
    if (!inv.interest_paused) {
      const target = compoundInterest(Number(inv.amount), monthsOverdue(inv.due_at, now), Number(rules.monthly_interest_pct));
      const delta = round2(target - Number(inv.interest_accrued));
      if (delta > 0) {
        await admin.from("invoice_charges").insert({ user_id: inv.user_id, invoice_id: inv.id, subscription_id: inv.subscription_id, kind: "interest", description: `Interest at ${rules.monthly_interest_pct}% monthly, compounded`, amount: delta });
        patch.interest_accrued = target;
      }
    }
    const next = autoStage(stage, daysOverdue(inv.due_at, now), rules.legal_after_days);
    if (next !== stage) {
      patch.collection_stage = next; patch.stage_changed_at = now.toISOString();
      if (next === "legal") {
        const fee = legalFee(Number(inv.amount) + Number(patch.interest_accrued ?? inv.interest_accrued), rules);
        await admin.from("invoice_charges").insert({ user_id: inv.user_id, invoice_id: inv.id, subscription_id: inv.subscription_id, kind: "legal_fee", description: `Legal and collection fee (${rules.legal_fee_pct}%, min $${rules.legal_fee_min})`, amount: fee });
        patch.fees_accrued = round2(Number(inv.fees_accrued) + fee);
        patch.collection_notes = [inv.collection_notes, `${now.toISOString().slice(0, 10)} Moved to legal after ${rules.legal_after_days} days unpaid. Legal fee $${fee} added.`].filter(Boolean).join("\n");
      }
      await audit(admin, inv.user_id, "invoices", inv.id, "collection_stage", { collection_stage: { from: stage, to: next } }, null, "Collections");
    }
    await admin.from("invoices").update(patch).eq("id", inv.id);
    touched++;
  }
  return touched;
}

/** Bills all unbilled ledger charges for an invoice as a new Stripe arrears invoice. */
export async function issueArrears(admin: Admin, invoiceId: string) {
  const { data: inv } = await admin.from("invoices").select("*").eq("id", invoiceId).single();
  const { data: charges } = await admin.from("invoice_charges").select("*").eq("invoice_id", invoiceId).is("billed_invoice_id", null);
  if (!inv || !charges?.length) throw new Error("There are no unbilled charges on this invoice.");
  const row = await issueStripeInvoice(admin, {
    userId: inv.user_id, subscriptionId: inv.subscription_id, kind: "arrears", description: `Arrears for ${inv.number}`,
    lines: charges.map((c: any) => ({ description: `${c.description} (${inv.number})`, amount: Number(c.amount) })),
    metadata: { original_invoice_id: invoiceId }, idem: `arrears-${invoiceId}-${charges.map((c: any) => c.id).join("").slice(0, 60)}`,
  });
  await admin.from("invoice_charges").update({ billed_invoice_id: row.id }).in("id", charges.map((c: any) => c.id));
  return row;
}
