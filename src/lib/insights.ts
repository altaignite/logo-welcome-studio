/** Aggregates for the admin overview. Pure, so the numbers are tested. */
import { round2 } from "@/lib/billing";

type Sub = { status: string; monthly_fee: number | string; monthly_hours: number | string; hours_used: number | string; renews_at: string | null; cancel_at_period_end?: boolean | null; archived_at?: string | null };
type Inv = { status: string; amount: number | string; interest_accrued?: number | string | null; fees_accrued?: number | string | null; collection_stage?: string | null; due_at: string | null; kind?: string | null };
type Tx = { amount: number | string; status: string; created_at: string };

const n = (v: unknown) => Number(v ?? 0) || 0;
const DAY = 864e5;

export const monthlyRecurring = (subs: Sub[]) => round2(subs.filter((s) => s.status === "active" && !s.archived_at).reduce((a, s) => a + n(s.monthly_fee), 0));
export const invoiceOwed = (i: Inv) => round2(n(i.amount) + n(i.interest_accrued) + n(i.fees_accrued));
export const unpaid = (invs: Inv[]) => invs.filter((i) => i.status === "open" || i.status === "overdue");

export function receivables(invs: Inv[], now = new Date()) {
  const open = unpaid(invs);
  const today = now.toISOString().slice(0, 10);
  const overdue = open.filter((i) => i.status === "overdue" || (!!i.due_at && i.due_at < today));
  const collections = open.filter((i) => ["debt_recovery", "legal", "court"].includes(String(i.collection_stage)));
  const sum = (xs: Inv[]) => round2(xs.reduce((a, i) => a + invoiceOwed(i), 0));
  return { outstanding: sum(open), overdue: sum(overdue), overdueCount: overdue.length, collections: sum(collections), collectionsCount: collections.length,
    firstUnpaid: open.filter((i) => i.kind === "first").length };
}

/** Hours used against allowance across active plans. */
export function hoursUse(subs: Sub[]) {
  const live = subs.filter((s) => s.status === "active");
  const used = round2(live.reduce((a, s) => a + n(s.hours_used), 0)), allowance = round2(live.reduce((a, s) => a + n(s.monthly_hours), 0));
  return { used, allowance, over: live.filter((s) => n(s.hours_used) > n(s.monthly_hours)).length };
}

export const renewingWithin = (subs: Sub[], days: number, now = new Date()) =>
  subs.filter((s) => s.status === "active" && !!s.renews_at && new Date(s.renews_at).getTime() - now.getTime() <= days * DAY && new Date(s.renews_at) >= now);

/** Completed payments (refunds are negative) for each of the last `months` calendar months, oldest first. */
export function revenueByMonth(txs: Tx[], months = 6, now = new Date()) {
  const keys: string[] = [];
  for (let i = months - 1; i >= 0; i--) { const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1)); keys.push(d.toISOString().slice(0, 7)); }
  const totals = Object.fromEntries(keys.map((k) => [k, 0])) as Record<string, number>;
  for (const t of txs) {
    if (t.status !== "completed") continue;
    const k = t.created_at.slice(0, 7);
    if (k in totals) totals[k] = round2(totals[k]! + n(t.amount));
  }
  return keys.map((k) => ({ month: k, label: new Date(`${k}-01T00:00:00Z`).toLocaleDateString("en-GB", { month: "short", timeZone: "UTC" }), total: totals[k]! }));
}

export const countSince = (rows: { created_at: string }[], days: number, now = new Date()) => rows.filter((r) => now.getTime() - new Date(r.created_at).getTime() <= days * DAY).length;
