import { describe, expect, it } from "vitest";
import { accountStatuses, canDelete, guaranteeEligible, guaranteeEnd, signInBlocked, subscriptionEffect } from "@/lib/admin";
import { toPatch } from "@/lib/records";

describe("account statuses", () => {
  it("offers the eight lifecycle statuses", () => expect(accountStatuses).toEqual(["prospect", "onboarding", "active", "past_due", "on_hold", "suspended", "cancelled", "closed"]));
  it("blocks sign-in only when suspended or closed", () => {
    expect(accountStatuses.filter(signInBlocked)).toEqual(["suspended", "closed"]);
  });
  it("pauses plans on hold or suspended and cancels them when cancelled or closed", () => {
    expect(subscriptionEffect("on_hold")).toBe("paused");
    expect(subscriptionEffect("suspended")).toBe("paused");
    expect(subscriptionEffect("cancelled")).toBe("cancelled");
    expect(subscriptionEffect("closed")).toBe("cancelled");
    expect(subscriptionEffect("past_due")).toBeNull();
  });
});

describe("90-day money-back guarantee", () => {
  it("ends 90 days after the start", () => expect(guaranteeEnd(new Date("2026-01-01T00:00:00Z")).toISOString().slice(0, 10)).toBe("2026-04-01"));
  it("is refundable only inside the window without sales", () => {
    const now = new Date("2026-02-01");
    expect(guaranteeEligible({ guarantee_ends_at: "2026-04-01", sales_received: false }, now)).toBe(true);
    expect(guaranteeEligible({ guarantee_ends_at: "2026-04-01", sales_received: true }, now)).toBe(false);
    expect(guaranteeEligible({ guarantee_ends_at: "2026-01-15", sales_received: false }, now)).toBe(false);
  });
});

describe("record deletion", () => {
  it("never deletes financial or legal records", () => {
    for (const t of ["invoices", "transactions", "applications", "subscriptions", "audit_log", "compliance_requests"]) expect(canDelete(t)).toBe(false);
  });
  it("lets staff delete contacts, tasks, activities and tickets", () => {
    for (const t of ["contacts", "tasks", "crm_activities", "support_tickets"]) expect(canDelete(t)).toBe(true);
  });
});

describe("form conversion", () => {
  it("turns yes/no into booleans, numbers into numbers and blanks into null", () => {
    expect(toPatch([{ name: "a", label: "A", type: "select", options: ["no", "yes"] }, { name: "b", label: "B", type: "number" }, { name: "c", label: "C" }], { a: "yes", b: "12", c: "" }))
      .toEqual({ a: true, b: 12, c: null });
  });
});
