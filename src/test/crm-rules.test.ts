import { describe, expect, it } from "vitest";
import { accountStatuses, canDelete, guaranteeEnd, signInBlocked, subscriptionEffect } from "@/lib/admin";
import { guaranteeCheck } from "@/lib/billing";
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
  it("opens after 90 days for 30 days, with every invoice paid on time and no sales", () => {
    const sub = { status: "active", started_at: "2026-01-01T00:00:00Z", guarantee_status: "running", sales_received: false };
    const paid = [{ status: "paid", collection_stage: "none", failed_payment_at: null }];
    expect(guaranteeCheck(sub, paid, new Date("2026-02-01")).eligible).toBe(false);
    expect(guaranteeCheck(sub, paid, new Date("2026-04-02")).eligible).toBe(true);
    expect(guaranteeCheck(sub, paid, new Date("2026-05-02")).eligible).toBe(false);
    expect(guaranteeCheck({ ...sub, sales_received: true }, paid, new Date("2026-04-02")).eligible).toBe(false);
    expect(guaranteeCheck({ ...sub, guarantee_status: "void" }, paid, new Date("2026-04-02")).eligible).toBe(false);
    expect(guaranteeCheck({ ...sub, status: "cancelled" }, paid, new Date("2026-04-02")).eligible).toBe(false);
  });
  it("is lost by any failed or late invoice, even one paid later", () => {
    const sub = { status: "active", started_at: "2026-01-01T00:00:00Z", guarantee_status: "running", sales_received: false };
    const at = new Date("2026-04-02");
    expect(guaranteeCheck(sub, [{ status: "paid", collection_stage: "settled" }], at).eligible).toBe(false);
    expect(guaranteeCheck(sub, [{ status: "paid", failed_payment_at: "2026-02-01" }], at).eligible).toBe(false);
    expect(guaranteeCheck(sub, [{ status: "overdue" }], at).checks.find((c) => c.label.startsWith("No failed"))?.ok).toBe(false);
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
