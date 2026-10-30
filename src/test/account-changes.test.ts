import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { cancelNowAllowed } from "@/lib/billing";
import { changeReasons, isReason } from "@/lib/changes";
import { recordKinds } from "@/lib/records";

describe("plan changes, cancellations and closures", () => {
  it("never cancel a started plan immediately; only an unpaid new order ends at once", () => {
    expect(cancelNowAllowed({ started_at: "2026-01-01T00:00:00Z", status: "active" })).toBe(false);
    expect(cancelNowAllowed({ started_at: "2026-01-01T00:00:00Z", status: "past_due" })).toBe(false);
    expect(cancelNowAllowed({ started_at: null, status: "pending" })).toBe(true);
  });
  it("close accounts by status (never deleting), cancel plans at period end in Stripe and keep invoices", () => {
    const fn = readFileSync("src/lib/changes.functions.ts", "utf8");
    const closure = fn.slice(fn.indexOf("export const submitAccountClosure"), fn.indexOf("export const reviewAccountChange"));
    expect(closure).toMatch(/status: "closed"/);
    expect(closure).not.toMatch(/\.delete\(|deleteUser/);
    expect(closure).not.toMatch(/invoices"\)\.update/);
    const effects = readFileSync("src/lib/account-status.server.ts", "utf8");
    expect(effects).toMatch(/cancel_at_period_end: true/);
  });
  it("record every change as a signed application with a reason from the list", () => {
    expect(isReason("cancel", "Budget")).toBe(true);
    expect(isReason("cancel", "made up")).toBe(false);
    for (const k of Object.keys(changeReasons)) expect(changeReasons[k as keyof typeof changeReasons]).toContain("Other");
    expect(recordKinds.account_change_requests.readonly).toBe(true);
  });
});
