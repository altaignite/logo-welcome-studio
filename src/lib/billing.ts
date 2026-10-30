/** Pure billing, overage, guarantee and debt-recovery rules shared by server and UI. */
import { GUARANTEE_CLAIM_DAYS, GUARANTEE_DAYS } from "@/lib/admin";

export type BillingRules = {
  overage_rates: Record<string, number>;
  overage_needs_approval: boolean;
  monthly_interest_pct: number;
  legal_after_days: number;
  legal_fee_pct: number;
  legal_fee_min: number;
  court_fees: { name: string; amount: number }[];
};

export const defaultRules: BillingRules = {
  overage_rates: { Starter: 60, Growth: 55, Scale: 50 },
  overage_needs_approval: true,
  monthly_interest_pct: 5,
  legal_after_days: 90,
  legal_fee_pct: 15,
  legal_fee_min: 40,
  court_fees: [{ name: "Court filing fee", amount: 350 }, { name: "Summons service", amount: 95 }, { name: "Hearing fee", amount: 150 }],
};

const DAY = 864e5;
export const round2 = (n: number) => Math.round(n * 100) / 100;
export const daysOverdue = (dueAt: string | Date, now = new Date()) => Math.max(0, Math.floor((now.getTime() - new Date(dueAt).getTime()) / DAY));

/** Whole months elapsed since the due date (interest compounds once per full month). */
export function monthsOverdue(dueAt: string | Date, now = new Date()) {
  const d = new Date(dueAt);
  let m = (now.getUTCFullYear() - d.getUTCFullYear()) * 12 + (now.getUTCMonth() - d.getUTCMonth());
  if (now.getUTCDate() < d.getUTCDate()) m -= 1;
  return Math.max(0, m);
}

/** Total interest owed on a principal after n months at a monthly rate, compounded monthly. */
export const compoundInterest = (principal: number, months: number, monthlyPct = 5) =>
  round2(principal * Math.pow(1 + monthlyPct / 100, months) - principal);

export const legalFee = (outstanding: number, rules: Pick<BillingRules, "legal_fee_pct" | "legal_fee_min"> = defaultRules) =>
  round2(Math.max(rules.legal_fee_min, (outstanding * rules.legal_fee_pct) / 100));

export const collectionStages = ["none", "overdue", "debt_recovery", "legal", "court", "settled", "written_off"] as const;
export type CollectionStage = (typeof collectionStages)[number];
export const stageLabel: Record<CollectionStage, string> = {
  none: "Current", overdue: "Overdue", debt_recovery: "Debt recovery", legal: "Legal", court: "Court", settled: "Settled", written_off: "Written off",
};

/** Automatic stage for an unpaid invoice. Staff-only stages (debt recovery, court) never move backwards. */
export function autoStage(current: CollectionStage, days: number, legalAfter = 90): CollectionStage {
  if (current === "settled" || current === "written_off" || current === "court") return current;
  if (days >= legalAfter) return "legal";
  if (current === "debt_recovery") return current;
  if (days > 0) return "overdue";
  return current;
}

/** Hours beyond the allowance not billed yet. */
export const unbilledOverage = (used: number, allowance: number, billed: number) => round2(Math.max(0, used - allowance - billed));
export const overageAmount = (hours: number, plan: string, rules: Pick<BillingRules, "overage_rates"> = defaultRules) =>
  round2(hours * (rules.overage_rates[plan] ?? 60));

/** Pausing inside the guarantee window voids the money-back guarantee. */
export function pauseVoidsGuarantee(startedAt: string | null, now = new Date()) {
  if (!startedAt) return false;
  return now.getTime() - new Date(startedAt).getTime() < GUARANTEE_DAYS * DAY;
}
/** A failed payment after the first successful one voids the guarantee. */
export const failedPaymentVoidsGuarantee = (firstPaidAt: string | null) => !!firstPaidAt;

type StripeInvoiceLike = {
  metadata?: Record<string, string> | null;
  billing_reason?: string | null;
  lines?: { data?: { period?: { end?: number } }[] } | null;
};
/** Local kind of a Stripe invoice: our own metadata first, then Stripe's billing reason. Only "renewal" starts a new hours period. */
export function invoiceKind(o: StripeInvoiceLike): string {
  const own = o.metadata?.["kind"];
  if (own) return own;
  if (o.billing_reason === "subscription_cycle") return "renewal";
  if (o.billing_reason === "subscription_update") return "plan_change";
  return "service";
}
/** Next renewal after a paid renewal invoice: the end of the period it bills, or one month from now. */
export function nextRenewalAt(o: StripeInvoiceLike, now = new Date()) {
  const end = o.lines?.data?.[0]?.period?.end;
  if (end && end * 1000 > now.getTime()) return new Date(end * 1000);
  const d = new Date(now); d.setMonth(d.getMonth() + 1); return d;
}

/** New refund to record for a charge: Stripe reports the running total refunded (cents), so subtract refunds already recorded. */
export const refundDelta = (amountRefundedCents: number, recorded: number[]) =>
  round2(Math.max(0, amountRefundedCents / 100 - recorded.reduce((s, a) => s + Math.abs(a), 0)));

/** Splits a refund (cents) across payments by what each still has refundable. Null when they can't cover it. */
export function planRefund(amountCents: number, sources: { pi: string; refundable: number; refunded: number }[]) {
  const plan: { pi: string; amount: number; refunded: number }[] = [];
  let left = amountCents;
  for (const s of sources) {
    if (left <= 0) break;
    const amount = Math.min(left, s.refundable);
    if (amount > 0) { plan.push({ pi: s.pi, amount, refunded: s.refunded }); left -= amount; }
  }
  return left > 0 ? null : plan;
}

/** Collection actions that move an invoice's debt need it to still be unpaid. */
export function collectionActionAllowed(action: string, status: string) {
  const unpaid = status === "open" || status === "overdue";
  return unpaid || !["flag", "court", "settle", "write_off"].includes(action);
}

type GuaranteeSub = { status: string; started_at: string | null; guarantee_status: string; guarantee_void_reason?: string | null; sales_received: boolean };
type GuaranteeInvoice = { status: string; collection_stage?: string | null; failed_payment_at?: string | null };
export type GuaranteeCheck = { eligible: boolean; opensAt: Date | null; closesAt: Date | null; checks: { label: string; ok: boolean; detail: string }[] };

/** Money-back guarantee rules: the plan has run for 90 days, the request is made within 30 days after that, no invoice on the
 * plan ever failed or went late, the guarantee wasn't voided (for example by a pause in the first 90 days) and no sales were received. */
export function guaranteeCheck(sub: GuaranteeSub, invoices: GuaranteeInvoice[], now = new Date()): GuaranteeCheck {
  const opensAt = sub.started_at ? new Date(new Date(sub.started_at).getTime() + GUARANTEE_DAYS * DAY) : null;
  const closesAt = opensAt ? new Date(opensAt.getTime() + GUARANTEE_CLAIM_DAYS * DAY) : null;
  const failed = invoices.filter((i) => !!i.failed_payment_at || ["overdue", "uncollectible"].includes(i.status) || (!!i.collection_stage && i.collection_stage !== "none"));
  const day = (d: Date) => d.toLocaleDateString("en-GB", { dateStyle: "medium" });
  const checks = [
    { label: "Your plan has run for 90 days", ok: !!opensAt && now >= opensAt, detail: opensAt ? (now >= opensAt ? `Since ${day(opensAt)}` : `From ${day(opensAt)}`) : "Starts when your first invoice is paid" },
    { label: "Requested within 30 days after day 90", ok: !!closesAt && now <= closesAt, detail: closesAt ? `Until ${day(closesAt)}` : "—" },
    { label: "No failed or late invoices on this plan", ok: failed.length === 0, detail: failed.length ? `${failed.length} invoice${failed.length > 1 ? "s" : ""} failed or went overdue` : "All paid on time" },
    { label: "Guarantee still active", ok: sub.guarantee_status === "running", detail: sub.guarantee_status === "running" ? "Active" : sub.guarantee_void_reason ?? sub.guarantee_status.replaceAll("_", " ") },
    { label: "No sales received", ok: !sub.sales_received, detail: sub.sales_received ? "Sales were recorded on this plan" : "You confirm this when you ask" },
    { label: "Plan isn't cancelled", ok: ["active", "past_due", "paused"].includes(sub.status), detail: sub.status.replaceAll("_", " ") },
  ];
  return { eligible: checks.every((c) => c.ok), opensAt, closesAt, checks };
}

/** Local invoice status for a Stripe invoice. Drafts aren't imported (null). */
export function localInvoiceStatus(o: { status?: string | null; due_date?: number | null }, now = new Date()): string | null {
  switch (o.status) {
    case "paid": return "paid";
    case "void": return "void";
    case "uncollectible": return "uncollectible";
    case "open": return o.due_date && o.due_date * 1000 < now.getTime() ? "overdue" : "open";
    default: return null;
  }
}

/** Local subscription status for a Stripe subscription. */
export function localSubscriptionStatus(s: { status?: string | null; pause_collection?: unknown }): string {
  if (s.status === "canceled" || s.status === "incomplete_expired") return "cancelled";
  if (s.status === "paused" || s.pause_collection) return "paused";
  switch (s.status) {
    case "active": case "trialing": return "active";
    case "past_due": return "past_due";
    case "unpaid": return "suspended";
    case "canceled": case "incomplete_expired": return "cancelled";
    default: return "pending";
  }
}

/** Matches a Stripe monthly price to one of our plans by amount; anything else is kept as a custom plan with the Stripe product name. */
export function planFromStripe(unitAmountCents: number | null | undefined, productName: string | null | undefined, plans: readonly { name: string; monthlyFee: number; monthlyHours: number }[]) {
  const fee = round2((unitAmountCents ?? 0) / 100);
  const match = plans.find((p) => p.monthlyFee === fee);
  return match ? { plan_name: match.name, monthly_fee: match.monthlyFee, monthly_hours: match.monthlyHours, custom: false }
    : { plan_name: (productName?.trim() || "Custom plan").replace(/ plan$/i, "").slice(0, 80), monthly_fee: fee, monthly_hours: 0, custom: true };
}

export type Standing = "active" | "past_due" | "suspended" | "abandoned";
type StandingInvoice = { status: string; kind?: string | null; due_at: string | null; collection_stage?: string | null; failed_payment_at?: string | null; stripe_status?: string | null };

/** Where a subscription should stand given its invoices. Null means its status isn't decided by invoices (cancelled, paused by
 * the client or a hold, or a new order still waiting for its first payment). "abandoned" is a new order whose first invoice was
 * voided without ever being paid, so it will never start. */
export function subscriptionStanding(sub: { status: string; started_at: string | null; stripe_status?: string | null }, invoices: StandingInvoice[], today = new Date().toISOString().slice(0, 10)): Standing | null {
  if (sub.status === "cancelled" || sub.status === "paused") return null;
  if (!sub.started_at) {
    const firsts = invoices.filter((i) => i.kind === "first");
    if (firsts.length > 0 && firsts.every((i) => i.status === "void")) return "abandoned";
  }
  const unpaid = invoices.filter((i) => ["open", "overdue", "uncollectible"].includes(i.status) && i.collection_stage !== "written_off");
  if (unpaid.some((i) => i.status === "uncollectible" || i.stripe_status === "uncollectible")) return "suspended";
  // Stripe gave up collecting (retries exhausted) or the debt is in recovery.
  if (unpaid.length && sub.stripe_status === "unpaid") return "suspended";
  if (unpaid.some((i) => ["debt_recovery", "legal", "court"].includes(String(i.collection_stage)))) return "suspended";
  if (unpaid.some((i) => i.status === "overdue" || !!i.failed_payment_at || (!!i.due_at && i.due_at < today))) return "past_due";
  // A new order waiting for its first payment stays pending until that invoice is late.
  if (unpaid.length) return sub.started_at ? "past_due" : null;
  if (!sub.started_at) return null;
  return "active";
}
