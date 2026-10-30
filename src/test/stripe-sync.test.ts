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
