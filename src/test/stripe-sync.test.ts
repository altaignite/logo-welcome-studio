import { describe, expect, it } from "vitest";
import { localInvoiceStatus, localSubscriptionStatus, planFromStripe } from "@/lib/billing";
import { plans } from "@/lib/signup";

describe("Stripe status mapping", () => {
  const now = new Date("2026-10-30T12:00:00Z");
  it("maps invoice statuses, with past-due open invoices as overdue", () => {
    expect(localInvoiceStatus({ status: "paid" }, now)).toBe("paid");
    expect(localInvoiceStatus({ status: "void" }, now)).toBe("void");
    expect(localInvoiceStatus({ status: "uncollectible" }, now)).toBe("overdue");
    expect(localInvoiceStatus({ status: "open", due_date: Date.parse("2026-10-01") / 1000 }, now)).toBe("overdue");
    expect(localInvoiceStatus({ status: "open", due_date: Date.parse("2026-11-30") / 1000 }, now)).toBe("open");
    expect(localInvoiceStatus({ status: "draft" }, now)).toBeNull();
  });
  it("maps subscription statuses", () => {
    expect(localSubscriptionStatus({ status: "active" })).toBe("active");
    expect(localSubscriptionStatus({ status: "trialing" })).toBe("active");
    expect(localSubscriptionStatus({ status: "active", pause_collection: { behavior: "void" } })).toBe("paused");
    expect(localSubscriptionStatus({ status: "past_due" })).toBe("past_due");
    expect(localSubscriptionStatus({ status: "unpaid" })).toBe("suspended");
    expect(localSubscriptionStatus({ status: "canceled" })).toBe("cancelled");
    expect(localSubscriptionStatus({ status: "incomplete" })).toBe("pending");
  });
  it("matches Stripe prices to our plans, keeping others as custom plans", () => {
    expect(planFromStripe(49900, "Anything", plans)).toEqual({ plan_name: "Growth", monthly_fee: 499, monthly_hours: 15, custom: false });
    expect(planFromStripe(25000, "Retainer plan", plans)).toEqual({ plan_name: "Retainer", monthly_fee: 250, monthly_hours: 0, custom: true });
    expect(planFromStripe(null, null, plans).plan_name).toBe("Custom");
  });
});

import { subscriptionStanding } from "@/lib/billing";
describe("subscription standing follows its invoices", () => {
  const live = { status: "active", started_at: "2026-01-01T00:00:00Z" };
  const today = "2026-10-30";
  it("is active with nothing unpaid, past due with an overdue invoice, suspended in recovery", () => {
    expect(subscriptionStanding(live, [{ status: "paid", due_at: "2026-10-01" }, { status: "void", due_at: "2026-09-01" }], today)).toBe("active");
    expect(subscriptionStanding(live, [{ status: "open", due_at: "2026-11-05" }], today)).toBe("active");
    expect(subscriptionStanding(live, [{ status: "open", due_at: "2026-10-01" }], today)).toBe("past_due");
    expect(subscriptionStanding({ ...live, status: "suspended" }, [{ status: "overdue", due_at: "2026-08-01", collection_stage: "legal" }], today)).toBe("suspended");
    expect(subscriptionStanding({ ...live, stripe_status: "unpaid" }, [{ status: "overdue", due_at: "2026-10-01" }], today)).toBe("suspended");
  });
  it("reinstates once the last debt is voided or paid", () => {
    expect(subscriptionStanding({ ...live, status: "suspended" }, [{ status: "void", due_at: "2026-08-01", collection_stage: "legal" }], today)).toBe("active");
  });
  it("cancels a new order whose first invoice was voided, and leaves paused and cancelled plans alone", () => {
    expect(subscriptionStanding({ status: "pending", started_at: null }, [{ status: "void", kind: "first", due_at: today }], today)).toBe("abandoned");
    expect(subscriptionStanding({ status: "pending", started_at: null }, [{ status: "open", kind: "first", due_at: today }], today)).toBeNull();
    expect(subscriptionStanding({ ...live, status: "paused" }, [{ status: "overdue", due_at: "2026-01-01" }], today)).toBeNull();
    expect(subscriptionStanding({ ...live, status: "cancelled" }, [], today)).toBeNull();
  });
});
