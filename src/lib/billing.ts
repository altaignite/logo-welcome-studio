/** Pure billing, overage, guarantee and debt-recovery rules shared by server and UI. */
import { GUARANTEE_DAYS } from "@/lib/admin";

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
