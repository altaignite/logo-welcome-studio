import { describe, expect, it } from "vitest";
import { passwordIssue, planChangeTiming, profileUpdateSchema } from "@/lib/client";

describe("client profile edits", () => {
  it("allows safe fields", () => expect(profileUpdateSchema.safeParse({ first_name: "Ana", city: "Paris" }).success).toBe(true));
  it("rejects account number changes", () => expect(profileUpdateSchema.safeParse({ account_number: "1234567890" }).success).toBe(false));
  it("rejects status changes", () => expect(profileUpdateSchema.safeParse({ status: "active" }).success).toBe(false));
  it("rejects email changes", () => expect(profileUpdateSchema.safeParse({ email: "x@y.com" }).success).toBe(false));
});

describe("plan changes", () => {
  it("upgrades Starter to Growth immediately", () => expect(planChangeTiming("Starter", "growth")).toBe("now"));
  it("downgrades Scale to Starter at renewal", () => expect(planChangeTiming("Scale", "starter")).toBe("renewal"));
  it("detects the same plan", () => expect(planChangeTiming("Growth", "growth")).toBe("same"));
});

describe("password strength", () => {
  it("rejects under 8 characters", () => expect(passwordIssue("Ab12345")).not.toBeNull());
  it("requires a number", () => expect(passwordIssue("Abcdefghijkl")).not.toBeNull());
  it("accepts a strong password", () => expect(passwordIssue("Tr0ub4dor&Horse")).toBeNull());
});
