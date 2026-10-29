import { describe, expect, it } from "vitest";
import { autoStage, compoundInterest, failedPaymentVoidsGuarantee, legalFee, monthsOverdue, overageAmount, pauseVoidsGuarantee, unbilledOverage } from "@/lib/billing";

describe("interest on unpaid invoices", () => {
  it("compounds 5% monthly", () => {
    expect(compoundInterest(1000, 1)).toBe(50);
    expect(compoundInterest(1000, 2)).toBe(102.5);
    expect(compoundInterest(1000, 3)).toBe(157.63);
  });
  it("counts only full months", () => {
    expect(monthsOverdue("2026-01-15", new Date("2026-02-14"))).toBe(0);
    expect(monthsOverdue("2026-01-15", new Date("2026-02-15"))).toBe(1);
  });
});

describe("collection stages", () => {
  it("moves to legal after 90 days unpaid", () => {
    expect(autoStage("overdue", 89)).toBe("overdue");
    expect(autoStage("overdue", 90)).toBe("legal");
    expect(autoStage("debt_recovery", 90)).toBe("legal");
  });
  it("never moves court, settled or written off backwards", () => {
    expect(autoStage("court", 200)).toBe("court");
    expect(autoStage("settled", 200)).toBe("settled");
  });
  it("charges 15% legal fee with a $40 minimum", () => {
    expect(legalFee(1000)).toBe(150);
    expect(legalFee(100)).toBe(40);
  });
});

describe("hour overages", () => {
  it("bills only unbilled hours past the allowance", () => {
    expect(unbilledOverage(18, 15, 0)).toBe(3);
    expect(unbilledOverage(18, 15, 3)).toBe(0);
    expect(unbilledOverage(10, 15, 0)).toBe(0);
  });
  it("uses the plan rate", () => expect(overageAmount(3, "Growth")).toBe(165));
});

describe("guarantee voiding", () => {
  it("is voided by pausing within the first 90 days", () => {
    expect(pauseVoidsGuarantee("2026-01-01", new Date("2026-03-01"))).toBe(true);
    expect(pauseVoidsGuarantee("2026-01-01", new Date("2026-05-01"))).toBe(false);
  });
  it("is voided by a failed payment only after a successful first payment", () => {
    expect(failedPaymentVoidsGuarantee(null)).toBe(false);
    expect(failedPaymentVoidsGuarantee("2026-01-01")).toBe(true);
  });
});
