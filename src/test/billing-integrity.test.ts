import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { collectionActionAllowed, invoiceKind, nextRenewalAt, planRefund, refundDelta } from "@/lib/billing";
import { clientActionsBlocked, orderingBlocked, workflowActions } from "@/lib/admin";

describe("Stripe invoice kinds", () => {
  it("keeps the kind our server set", () => {
    expect(invoiceKind({ metadata: { kind: "first" }, billing_reason: "manual" })).toBe("first");
    expect(invoiceKind({ metadata: { kind: "arrears" } })).toBe("arrears");
  });
  it("treats only billing-cycle invoices as renewals", () => {
    // The invoice that starts a subscription is the plan's first month, so paying it activates the plan.
    expect(invoiceKind({ metadata: {}, billing_reason: "subscription_create" })).toBe("first");
    expect(invoiceKind({ metadata: {}, billing_reason: "subscription_cycle" })).toBe("renewal");
    expect(invoiceKind({ metadata: {}, billing_reason: "subscription_update" })).toBe("plan_change");
    expect(invoiceKind({ billing_reason: "manual" })).toBe("service");
    expect(invoiceKind({})).toBe("service");
  });
  it("renews at the end of the billed period", () => {
    const now = new Date("2026-03-01T00:00:00Z");
    const end = Date.parse("2026-04-01T00:00:00Z") / 1000;
    expect(nextRenewalAt({ lines: { data: [{ period: { end } }] } }, now).toISOString()).toBe("2026-04-01T00:00:00.000Z");
    expect(nextRenewalAt({}, now).getMonth()).toBe(new Date("2026-04-01T00:00:00Z").getMonth());
  });
});

describe("refunds", () => {
  it("records only the new part of a running refund total", () => {
    expect(refundDelta(5000, [])).toBe(50);
    expect(refundDelta(10000, [-50])).toBe(50);
    expect(refundDelta(10000, [-50, -50])).toBe(0);
  });
  it("splits a refund across what each payment still has refundable", () => {
    const sources = [{ pi: "pi_1", refundable: 19900, refunded: 0 }, { pi: "pi_2", refundable: 4900, refunded: 15000 }];
    expect(planRefund(20000, sources)).toEqual([{ pi: "pi_1", amount: 19900, refunded: 0 }, { pi: "pi_2", amount: 100, refunded: 15000 }]);
    expect(planRefund(30000, sources)).toBeNull();
  });
});

describe("collections and client holds", () => {
  it("moves only unpaid invoices through collections", () => {
    expect(collectionActionAllowed("write_off", "paid")).toBe(false);
    expect(collectionActionAllowed("flag", "void")).toBe(false);
    expect(collectionActionAllowed("write_off", "overdue")).toBe(true);
    expect(collectionActionAllowed("issue_arrears", "paid")).toBe(true);
  });
  it("blocks client plan changes during holds and orders while past due", () => {
    expect(clientActionsBlocked("on_hold")).toBe(true);
    expect(clientActionsBlocked("active")).toBe(false);
    expect(orderingBlocked("past_due")).toBe(true);
    expect(orderingBlocked("onboarding")).toBe(false);
  });
});

describe("application status guard", () => {
  it("allows exactly the transitions in workflowActions", () => {
    const sql = readFileSync("drizzle/migrations/0010_billing_integrity.sql", "utf8");
    const body = sql.slice(sql.indexOf("guard_application_status"), sql.indexOf("RAISE EXCEPTION 'An application"));
    const fromSql = [...body.matchAll(/\('(\w+)','(\w+)'\)/g)].map((m) => `${m[1]}>${m[2]}`).sort();
    const fromMap = Object.entries(workflowActions).flatMap(([from, actions]) => actions.map((a) => `${from}>${a.to}`)).sort();
    expect(fromSql).toEqual(fromMap);
  });
});
