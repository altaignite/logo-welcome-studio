/** Server-only billing workflows shared by server functions, the Stripe webhook and the daily collections job. */
import { audit, cents, ensureCustomer, planPrice, stripe } from "@/lib/stripe.server";
import { invoiceKind, nextRenewalAt } from "@/lib/billing";
import { autoStage, compoundInterest, daysOverdue, defaultRules, failedPaymentVoidsGuarantee, legalFee, monthsOverdue, round2, type BillingRules, type CollectionStage } from "@/lib/billing";
import { clientActionsBlocked, guaranteeEnd } from "@/lib/admin";

type Admin = any;
const today = () => new Date().toISOString().slice(0, 10);

/** Unwraps a Supabase result. supabase-js returns errors instead of throwing, so writes must be checked to fail loudly (and let Stripe retry). */
export function must(res: { data: any; error: { message: string } | null }): any {
  if (res.error) throw new Error(`Database error: ${res.error.message}`);
  return res.data;
}

/** Stops clients changing plans while staff hold, suspend or close their account (sign-in bans take up to an hour to apply). */
export async function assertClientMayAct(admin: Admin, userId: string) {
  const p = must(await admin.from("profiles").select("status").eq("id", userId).maybeSingle()) as { status: string } | null;
  if (!p || clientActionsBlocked(p.status)) throw new Error("Your account is on hold. Please contact support.");
}

/** Applies a pause, resume or cancellation in Stripe before it's saved locally, so billing matches the local status. */
export async function applyStripeStatus(sub: { stripe_subscription_id: string | null }, to: "paused" | "active" | "cancelled") {
  const sid = sub.stripe_subscription_id;
  if (!sid) return;
  if (to === "paused") await stripe("POST", `subscriptions/${sid}`, { "pause_collection[behavior]": "void" });
  else if (to === "active") await stripe("POST", `subscriptions/${sid}`, { pause_collection: "" });
  else {
    try { await stripe("DELETE", `subscriptions/${sid}`); }
    catch (e) { if ((await stripe("GET", `subscriptions/${sid}`)).status !== "canceled") throw e; }
  }
}

/** Voids an open Stripe invoice (or deletes a draft) before the local copy is voided. Paid invoices can't be voided. */
export async function voidStripeInvoice(stripeInvoiceId: string) {
  const s = await stripe("GET", `invoices/${stripeInvoiceId}`);
  if (s.status === "void") return;
  if (s.status === "paid") throw new Error(`Invoice ${s.number ?? stripeInvoiceId} is already paid in Stripe and can't be voided.`);
  if (s.status === "draft") await stripe("DELETE", `invoices/${stripeInvoiceId}`);
  else await stripe("POST", `invoices/${stripeInvoiceId}/void`);
}

/** Voids unpaid first invoices of a subscription that won't start, so the client can't pay for it later. */
export async function voidOpenFirstInvoices(admin: Admin, subId: string, reason: string) {
  const rows = must(await admin.from("invoices").select("id, stripe_invoice_id").eq("subscription_id", subId).eq("kind", "first").in("status", ["open", "overdue"])) ?? [];
  for (const inv of rows) {
    if (inv.stripe_invoice_id) await voidStripeInvoice(inv.stripe_invoice_id);
    must(await admin.from("invoices").update({ status: "void", void_reason: reason, interest_paused: true }).eq("id", inv.id));
  }
}

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
  const sub = must(await admin.from("subscriptions").select("*").eq("id", subId).maybeSingle());
  if (!sub || sub.status === "active") return;
  if (sub.status !== "pending") {
    // Paid after staff paused or cancelled it: don't start billing, flag it for staff instead.
    const warning = `First invoice paid while the subscription was ${sub.status}. Review and refund or reactivate.`;
    must(await admin.from("subscriptions").update({ payment_warning: warning }).eq("id", subId));
    await audit(admin, sub.user_id, "subscriptions", subId, "payment_while_inactive", { status: sub.status, note: warning }, null, "Stripe");
    return;
  }
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
  must(await admin.from("subscriptions").update({
    status: "active", started_at: now.toISOString(), first_paid_at: sub.first_paid_at ?? now.toISOString(), renews_at: next.toISOString(),
    guarantee_ends_at: guaranteeEnd(now).toISOString(), guarantee_status: "running", stripe_subscription_id: stripeSubId, payment_warning: null,
  }).eq("id", subId));
  must(await admin.from("projects").update({ status: "active", started_at: today() }).eq("subscription_id", subId).in("status", ["planned", "pending", "on_hold"]));
  if (sub.application_id) must(await admin.from("applications").update({ status: "approved", decided_at: now.toISOString() }).eq("id", sub.application_id).in("status", ["submitted", "in_review", "escalated", "info_requested"]));
  await audit(admin, sub.user_id, "subscriptions", subId, "activated", { status: { from: sub.status, to: "active" }, reason: "First invoice paid" }, null, "Stripe");
}

/** Suspends subscription, its projects and its application after payment failure retries end. */
export async function suspendForNonPayment(admin: Admin, subId: string, note: string) {
  const sub = must(await admin.from("subscriptions").select("*").eq("id", subId).maybeSingle());
  if (!sub || sub.status === "suspended" || sub.status === "cancelled") return;
  const warning = `Suspended for non-payment: ${note}`;
  must(await admin.from("subscriptions").update({ status: "suspended", payment_warning: warning, notes: [sub.notes, `${today()} ${warning}`].filter(Boolean).join("\n") }).eq("id", subId));
  must(await admin.from("projects").update({ status: "on_hold" }).eq("subscription_id", subId).eq("status", "active"));
  if (sub.application_id) {
    must(await admin.from("applications").update({ status: "suspended" }).eq("id", sub.application_id));
    await admin.from("application_events").insert({ application_id: sub.application_id, actor_label: "Stripe", action: "Suspended for non-payment", to_status: "suspended", note });
  }
  await audit(admin, sub.user_id, "subscriptions", subId, "suspended", { status: { from: sub.status, to: "suspended" }, reason: note }, null, "Stripe");
}

export async function reinstateAfterPayment(admin: Admin, subId: string) {
  const sub = must(await admin.from("subscriptions").select("*").eq("id", subId).maybeSingle());
  if (!sub || (sub.status !== "suspended" && sub.status !== "past_due")) return;
  must(await admin.from("subscriptions").update({ status: "active", payment_warning: null }).eq("id", subId));
  must(await admin.from("projects").update({ status: "active" }).eq("subscription_id", subId).eq("status", "on_hold"));
  if (sub.application_id && sub.status === "suspended") {
    must(await admin.from("applications").update({ status: "approved" }).eq("id", sub.application_id).eq("status", "suspended"));
    await admin.from("application_events").insert({ application_id: sub.application_id, actor_label: "Stripe", action: "Reinstated after payment", to_status: "approved", note: "Outstanding invoice paid" });
  }
  await audit(admin, sub.user_id, "subscriptions", subId, "reinstated", { status: { from: sub.status, to: "active" }, reason: "Payment received" }, null, "Stripe");
}

export async function markPastDue(admin: Admin, subId: string, note: string) {
  const sub = must(await admin.from("subscriptions").select("*").eq("id", subId).maybeSingle());
  if (!sub) return;
  const voids = failedPaymentVoidsGuarantee(sub.first_paid_at) && sub.guarantee_status === "running";
  must(await admin.from("subscriptions").update({
    status: sub.status === "suspended" ? "suspended" : "past_due", payment_warning: `Payment failed: ${note}`,
    ...(voids ? { guarantee_status: "void", guarantee_void_reason: "Failed payment after the initial successful payment" } : {}),
  }).eq("id", subId));
  await audit(admin, sub.user_id, "subscriptions", subId, "payment_failed", { note, ...(voids ? { guarantee: { from: "running", to: "void" } } : {}) }, null, "Stripe");
}

/** Daily run: accrue compound interest, move stages, add legal fees. Returns number of invoices touched. */
export async function runCollections(admin: Admin, now = new Date()) {
  const rules = await loadRules(admin);
  const rows = must(await admin.from("invoices").select("*").in("status", ["open", "overdue"]).neq("kind", "arrears").lt("due_at", now.toISOString().slice(0, 10)));
  let touched = 0;
  for (const inv of rows ?? []) {
    const stage = inv.collection_stage as CollectionStage;
    if (stage === "settled" || stage === "written_off") continue;
    const patch: any = { status: "overdue" };
    if (!inv.interest_paused) {
      const target = compoundInterest(Number(inv.amount), monthsOverdue(inv.due_at, now), Number(rules.monthly_interest_pct));
      const delta = round2(target - Number(inv.interest_accrued));
      if (delta > 0) {
        must(await admin.from("invoice_charges").insert({ user_id: inv.user_id, invoice_id: inv.id, subscription_id: inv.subscription_id, kind: "interest", description: `Interest at ${rules.monthly_interest_pct}% monthly, compounded`, amount: delta }));
        patch.interest_accrued = target;
      }
    }
    const next = autoStage(stage, daysOverdue(inv.due_at, now), rules.legal_after_days);
    if (next !== stage) {
      patch.collection_stage = next; patch.stage_changed_at = now.toISOString();
      if (next === "legal") {
        const fee = legalFee(Number(inv.amount) + Number(patch.interest_accrued ?? inv.interest_accrued), rules);
        must(await admin.from("invoice_charges").insert({ user_id: inv.user_id, invoice_id: inv.id, subscription_id: inv.subscription_id, kind: "legal_fee", description: `Legal and collection fee (${rules.legal_fee_pct}%, min $${rules.legal_fee_min})`, amount: fee }));
        patch.fees_accrued = round2(Number(inv.fees_accrued) + fee);
        patch.collection_notes = [inv.collection_notes, `${now.toISOString().slice(0, 10)} Moved to legal after ${rules.legal_after_days} days unpaid. Legal fee $${fee} added.`].filter(Boolean).join("\n");
      }
      await audit(admin, inv.user_id, "invoices", inv.id, "collection_stage", { collection_stage: { from: stage, to: next } }, null, "Collections");
    }
    must(await admin.from("invoices").update(patch).eq("id", inv.id));
    if (inv.subscription_id) await applySubscriptionStanding(admin, inv.subscription_id, `Invoice ${inv.number} ${patch.collection_stage ? `moved to ${patch.collection_stage.replace("_", " ")}` : "overdue"}`, "Collections");
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
  must(await admin.from("invoice_charges").update({ billed_invoice_id: row.id }).in("id", charges.map((c: any) => c.id)));
  return row;
}

/** Applies Stripe's live subscription state to the local row: status, period, cancel-at-period-end. Used by the webhook and the
 * daily reconciliation, so the database follows Stripe whichever arrives first. */
export async function syncSubscriptionFromStripe(admin: Admin, subId: string, s: any) {
  const sub = must(await admin.from("subscriptions").select("*").eq("id", subId).maybeSingle());
  if (!sub) return;
  const paused = s.status === "paused" || !!s.pause_collection;
  const periodEnd = s.current_period_end ?? s.items?.data?.[0]?.current_period_end ?? null;
  const live = paused ? "paused" : String(s.status);
  must(await admin.from("subscriptions").update({
    stripe_status: live, stripe_synced_at: new Date().toISOString(), cancel_at_period_end: !!s.cancel_at_period_end,
    ...(periodEnd ? { current_period_end: new Date(periodEnd * 1000).toISOString(), renews_at: new Date(periodEnd * 1000).toISOString() } : {}),
  }).eq("id", subId));
  if (live === "canceled") {
    if (sub.status !== "cancelled") {
      must(await admin.from("subscriptions").update({ status: "cancelled", cancelled_at: new Date().toISOString() }).eq("id", subId));
      must(await admin.from("projects").update({ status: "cancelled" }).eq("subscription_id", subId).in("status", ["planned", "active", "on_hold"]));
      await audit(admin, sub.user_id, "subscriptions", subId, "cancelled", { status: { from: sub.status, to: "cancelled" }, reason: "Cancelled in Stripe" }, null, "Stripe");
    }
  } else if (live === "unpaid") await suspendForNonPayment(admin, subId, "Payment retries exhausted");
  else if (live === "past_due") { if (sub.status === "active") await markPastDue(admin, subId, "Renewal payment overdue"); }
  else if (live === "paused") {
    if (sub.status === "active" || sub.status === "past_due") {
      must(await admin.from("subscriptions").update({ status: "paused" }).eq("id", subId));
      await audit(admin, sub.user_id, "subscriptions", subId, "paused", { status: { from: sub.status, to: "paused" }, reason: "Paused in Stripe" }, null, "Stripe");
    }
  } else if (live === "active" || live === "trialing") {
    if (sub.status === "past_due" || sub.status === "suspended") await reinstateAfterPayment(admin, subId);
    else if (sub.status === "paused" && !sub.paused_by_account_status) {
      must(await admin.from("subscriptions").update({ status: "active" }).eq("id", subId));
      await audit(admin, sub.user_id, "subscriptions", subId, "resume", { status: { from: "paused", to: "active" }, reason: "Resumed in Stripe" }, null, "Stripe");
    }
  }
}

/** Daily check that local subscriptions and unpaid invoices match Stripe, for anything a missed webhook left behind.
 * Status comes from the Stripe API with the secret key, so paid invoices are recorded here too if a webhook was missed. */
export async function reconcileStripe(admin: Admin, limit = 200) {
  let subs = 0, invoices = 0;
  const rows = must(await admin.from("subscriptions").select("id, stripe_subscription_id").not("stripe_subscription_id", "is", null).neq("status", "cancelled").order("stripe_synced_at", { ascending: true, nullsFirst: true }).limit(limit)) ?? [];
  for (const r of rows) {
    try { await syncSubscriptionFromStripe(admin, r.id, await stripe("GET", `subscriptions/${r.stripe_subscription_id}`)); subs++; }
    catch (e) { console.error("Stripe subscription sync failed", r.id, e); }
  }
  const open = must(await admin.from("invoices").select("id, user_id, number, status, stripe_invoice_id, subscription_id").in("status", ["open", "overdue"]).not("stripe_invoice_id", "is", null).limit(limit)) ?? [];
  for (const inv of open) {
    try {
      const s = await stripe("GET", `invoices/${inv.stripe_invoice_id}`);
      must(await admin.from("invoices").update({ stripe_status: s.status, stripe_synced_at: new Date().toISOString(), hosted_url: s.hosted_invoice_url ?? undefined, pdf_url: s.invoice_pdf ?? undefined }).eq("id", inv.id));
      if (s.status === "void") {
        must(await admin.from("invoices").update({ status: "void", void_reason: "Voided in Stripe", interest_paused: true }).eq("id", inv.id));
        if (inv.subscription_id) await applySubscriptionStanding(admin, inv.subscription_id, `Invoice ${inv.number} voided in Stripe`, "Stripe");
      }
      else if (s.status === "uncollectible" && inv.subscription_id) await suspendForNonPayment(admin, inv.subscription_id, `Invoice ${inv.number} marked uncollectible`);
      else if (s.status === "paid") {
        const full = must(await admin.from("invoices").select("*").eq("id", inv.id).single());
        await recordInvoicePaid(admin, full, s, typeof s.payment_intent === "string" ? s.payment_intent : s.payment_intent?.id ?? null);
      }
      invoices++;
    } catch (e) { console.error("Stripe invoice sync failed", inv.id, e); }
  }
  // Pick up invoices Stripe created recently for linked clients, in case their webhook was missed.
  const { importInvoice } = await import("@/lib/stripe-import.server");
  try {
    const recent = await stripe("GET", "invoices", { limit: 100, "created[gte]": Math.floor(Date.now() / 1000) - 3 * 86400 });
    for (const o of recent.data ?? []) {
      const owner = must(await admin.from("profiles").select("id").eq("stripe_customer_id", o.customer).maybeSingle());
      if (owner) { await importInvoice(admin, owner.id, o); invoices++; }
    }
  } catch (e) { console.error("Stripe recent invoice import failed", e); }
  // Existing plans included: every running subscription is re-checked against its invoices.
  await resyncAllStanding(admin);
  return { subs, invoices };
}

/** Marks a local invoice paid from verified Stripe data (the signed webhook, or the Stripe API during sync and import),
 * records the payment, and applies its effects: activation, a new hours period on renewal, reinstatement. Idempotent. */
export async function recordInvoicePaid(admin: Admin, inv: any, o: any, paymentIntent: string | null = null) {
  if (inv.status === "paid") return;
  must(await admin.from("invoices").update({ status: "paid", paid_at: o.status_transitions?.paid_at ? new Date(o.status_transitions.paid_at * 1000).toISOString() : new Date().toISOString(),
    hosted_url: o.hosted_invoice_url, pdf_url: o.invoice_pdf, stripe_status: "paid", stripe_synced_at: new Date().toISOString(),
    collection_stage: Number(inv.interest_accrued) + Number(inv.fees_accrued) > 0 ? inv.collection_stage : (inv.collection_stage === "none" ? "none" : "settled") }).eq("id", inv.id).neq("status", "paid"));
  must(await admin.from("transactions").upsert({ user_id: inv.user_id, invoice_id: inv.id, subscription_id: inv.subscription_id, reference: o.number ?? o.id, description: `Payment for ${inv.number}`,
    amount: (o.amount_paid ?? 0) / 100, method: "stripe", status: "completed", stripe_id: `pay-${o.id}`, stripe_payment_intent: paymentIntent,
    created_at: o.status_transitions?.paid_at ? new Date(o.status_transitions.paid_at * 1000).toISOString() : undefined }, { onConflict: "stripe_id", ignoreDuplicates: true }));
  if (o.metadata?.original_invoice_id) must(await admin.from("invoices").update({ collection_stage: "settled", interest_paused: true }).eq("id", o.metadata.original_invoice_id).eq("status", "paid"));
  const subId = inv.subscription_id;
  if (subId) {
    if (inv.kind === "first") await activateSubscription(admin, subId);
    else {
      // Only a billing-cycle renewal starts a new hours period; proration and one-off invoices don't.
      if (inv.kind === "renewal") {
        const cur = must(await admin.from("subscriptions").select("pending_plan_id").eq("id", subId).single());
        const { plans } = await import("@/lib/signup");
        const np = cur?.pending_plan_id ? plans.find((p) => p.id === cur.pending_plan_id) : undefined;
        must(await admin.from("subscriptions").update({ hours_used: 0, overage_billed_hours: 0, renews_at: nextRenewalAt(o).toISOString(), ...(np ? { plan_name: np.name, monthly_fee: np.monthlyFee, monthly_hours: np.monthlyHours, pending_plan_id: null } : {}) }).eq("id", subId));
      }
      // Reinstate only if nothing else on the plan is still unpaid.
      await applySubscriptionStanding(admin, subId, `Invoice ${inv.number} paid`, "Stripe");
    }
  }
  await audit(admin, inv.user_id, "invoices", inv.id, "paid", { status: { from: inv.status, to: "paid" } }, null, "Stripe");
}

/** Brings a subscription, its Stripe subscription, its projects and its application in line with its invoices (see
 * subscriptionStanding). Called after every invoice change: paid, failed, voided, written off, collections steps, the daily
 * job, the Stripe sync and the import, so everything linked to a plan moves together. Safe to call repeatedly. */
export async function applySubscriptionStanding(admin: Admin, subId: string, reason: string, actorLabel = "Billing") {
  const { subscriptionStanding } = await import("@/lib/billing");
  const sub = must(await admin.from("subscriptions").select("*").eq("id", subId).maybeSingle());
  if (!sub) return null;
  const invoices = must(await admin.from("invoices").select("status, kind, due_at, collection_stage").eq("subscription_id", subId)) ?? [];
  const target = subscriptionStanding(sub, invoices);
  if (!target || target === sub.status) return target;
  if (target === "abandoned") {
    // The order never started: cancel it in Stripe (if it got that far) and close everything linked to it.
    await applyStripeStatus(sub, "cancelled");
    must(await admin.from("subscriptions").update({ status: "cancelled", cancelled_at: new Date().toISOString(), notes: [sub.notes, `${today()} Order cancelled: first invoice voided`].filter(Boolean).join("\n") }).eq("id", subId));
    must(await admin.from("projects").update({ status: "cancelled" }).eq("subscription_id", subId).in("status", ["planned", "active", "on_hold"]));
    if (sub.application_id) must(await admin.from("applications").update({ archived_at: new Date().toISOString() }).eq("id", sub.application_id).is("archived_at", null));
    await audit(admin, sub.user_id, "subscriptions", subId, "cancelled", { status: { from: sub.status, to: "cancelled" }, reason }, null, actorLabel);
    return target;
  }
  if (target === "suspended") {
    // Debt recovery: stop Stripe charging further renewals while the debt is recovered.
    if (sub.stripe_subscription_id && sub.stripe_status !== "paused") await applyStripeStatus(sub, "paused");
    await suspendForNonPayment(admin, subId, reason);
    return target;
  }
  if (target === "past_due") {
    if (sub.status === "suspended") {
      await reinstateAfterPayment(admin, subId);
      if (sub.stripe_subscription_id) await applyStripeStatus(sub, "active");
    }
    must(await admin.from("subscriptions").update({ status: "past_due", payment_warning: `Payment overdue: ${reason}` }).eq("id", subId));
    await audit(admin, sub.user_id, "subscriptions", subId, "past_due", { status: { from: sub.status, to: "past_due" }, reason }, null, actorLabel);
    return target;
  }
  // Nothing unpaid: back to active, with renewals charged again if recovery paused them.
  if (sub.stripe_subscription_id && (sub.status === "suspended" || sub.stripe_status === "paused") && !sub.paused_by_account_status) await applyStripeStatus(sub, "active");
  await reinstateAfterPayment(admin, subId);
  return target;
}

/** Re-checks every running subscription against its invoices (existing records included). */
export async function resyncAllStanding(admin: Admin) {
  const subs = must(await admin.from("subscriptions").select("id").in("status", ["active", "past_due", "suspended", "pending"])) ?? [];
  let changed = 0;
  for (const s of subs) {
    try { const before = await applySubscriptionStanding(admin, s.id, "Re-checked against invoices", "Sync"); if (before) changed++; }
    catch (e) { console.error("Standing sync failed", s.id, e); }
  }
  return { checked: subs.length };
}
