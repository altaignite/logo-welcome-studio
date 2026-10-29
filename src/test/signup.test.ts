import { describe, expect, it } from "vitest";
import { accountSchema, countries, createSignatureCode, isSignatureMatch, personalSchema, refundEligible, subscription, plans, planTerms } from "@/lib/signup";

describe("Marketing subscription rules", () => {
  it("starts at $199 per month", () => expect(subscription.monthlyFee).toBe(199));
  it("offers three plans with finite assigned monthly hours", () => {
    expect(plans.map(({ id, monthlyFee, monthlyHours }) => ({ id, monthlyFee, monthlyHours }))).toEqual([
      { id: "starter", monthlyFee: 199, monthlyHours: 5 },
      { id: "growth", monthlyFee: 499, monthlyHours: 15 },
      { id: "scale", monthlyFee: 999, monthlyHours: 35 },
    ]);
  });
  it("carries each chosen plan into the agreement terms", () => {
    for (const plan of plans) {
      const terms = planTerms(plan);
      expect(terms).toContain(`$${plan.monthlyFee} / month`);
      expect(terms).toContain(`${plan.monthlyHours} assigned service hours per month`);
    }
  });
  it("covers marketing, design and development", () => expect(subscription.services).toEqual(["Marketing", "Design", "Development"]));
  it("excludes advertising budgets", () => expect(subscription.advertisingBudgetIncluded).toBe(false));
  it("guarantees service fees for zero sales within 90 days", () => {
    expect(refundEligible(90, 0, "service")).toBe(true);
    expect(refundEligible(91, 0, "service")).toBe(false);
  });
  it("excludes advertising fees from the guarantee", () => expect(refundEligible(30, 0, "advertising")).toBe(false));
  it("requires zero sales for the guarantee", () => expect(refundEligible(30, 1, "service")).toBe(false));
  it("generates six digits different on every attempt", () => {
    const used = new Set<string>();
    for (let i = 0; i < 100; i++) {
      const code = createSignatureCode(used);
      expect(code).toMatch(/^[1-9]\d{5}$/);
      expect(used.has(code)).toBe(false);
      used.add(code);
    }
  });
  it("only accepts an exact six-digit match", () => {
    expect(isSignatureMatch("123456", "123456")).toBe(true);
    expect(isSignatureMatch("123456", "123455")).toBe(false);
    expect(isSignatureMatch("123456", "12345")).toBe(false);
  });
  it("orders countries A–Z and includes dial codes", () => {
    expect(countries.length).toBeGreaterThan(200);
    expect(countries.map((c) => c.name)).toEqual(countries.map((c) => c.name).sort((a, b) => a.localeCompare(b, "en")));
    expect(countries.find((c) => c.code === "NL")?.dial).toBe("+31");
  });
  it("validates personal details and international numbers", () => {
    const details = { firstName: "Bao", lastName: "Test", company: "Studio", country: "NL", phone: "+31612345678" };
    expect(personalSchema.safeParse(details).success).toBe(true);
    expect(personalSchema.safeParse({ ...details, phone: "123" }).success).toBe(false);
  });
  it("validates email and matching account passwords", () => {
    expect(accountSchema.safeParse({ email: "bao@example.com", password: "Testing123", confirmPassword: "Testing123" }).success).toBe(true);
    expect(accountSchema.safeParse({ email: "not-email", password: "Testing123", confirmPassword: "other" }).success).toBe(false);
  });
});