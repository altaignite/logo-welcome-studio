import { describe, expect, it } from "vitest";
import { verifyStripePayment } from "@/lib/billing";

const paid = { status: "paid", amount_remaining: 0, currency: "usd", livemode: true, total: 49900, customer: "cus_1" };
const live = { liveKey: true, customerId: "cus_1" };

describe("payment verification", () => {
  it("accepts a fully paid live USD invoice for the right customer", () => {
    expect(verifyStripePayment(paid, live)).toEqual({ ok: true });
    expect(verifyStripePayment(paid, { ...live, minAmount: 499 })).toEqual({ ok: true });
    expect(verifyStripePayment({ ...paid, customer: { id: "cus_1" } }, live)).toEqual({ ok: true });
  });
  it("refuses anything Stripe doesn't show as fully paid", () => {
    expect(verifyStripePayment({ ...paid, status: "open" }, live)).toMatchObject({ ok: false, action: "refuse" });
    expect(verifyStripePayment({ ...paid, amount_remaining: 100 }, live)).toMatchObject({ ok: false, action: "refuse" });
  });
  it("refuses test-mode payments on live keys, other currencies and other customers", () => {
    expect(verifyStripePayment({ ...paid, livemode: false }, live)).toMatchObject({ action: "refuse" });
    expect(verifyStripePayment({ ...paid, currency: "eur" }, live)).toMatchObject({ action: "refuse" });
    expect(verifyStripePayment({ ...paid, customer: "cus_other" }, live)).toMatchObject({ action: "refuse" });
  });
  it("holds a first payment below the plan price instead of starting the plan", () => {
    expect(verifyStripePayment({ ...paid, total: 0 }, { ...live, minAmount: 499 })).toMatchObject({ ok: false, action: "hold" });
    expect(verifyStripePayment({ ...paid, total: 19900 }, { ...live, minAmount: 499 })).toMatchObject({ action: "hold" });
  });
});
