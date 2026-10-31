import { describe, expect, it } from "vitest";
import { cardExpiry } from "@/lib/cards";

describe("card expiry", () => {
  const now = new Date(2026, 9, 31, 12); // 31 October 2026
  it("keeps a card valid through the last day of its expiry month", () => {
    expect(cardExpiry(10, 2026, now)).toEqual({ expired: false, expiresSoon: true });
    expect(cardExpiry(9, 2026, now)).toEqual({ expired: true, expiresSoon: false });
  });
  it("warns this month and next, not later", () => {
    expect(cardExpiry(11, 2026, now).expiresSoon).toBe(true);
    expect(cardExpiry(12, 2026, now).expiresSoon).toBe(false);
    expect(cardExpiry(1, 2030, now)).toEqual({ expired: false, expiresSoon: false });
  });
  it("handles the year boundary", () => {
    const dec = new Date(2026, 11, 15);
    expect(cardExpiry(1, 2027, dec).expiresSoon).toBe(true);
    expect(cardExpiry(11, 2026, dec).expired).toBe(true);
  });
});
