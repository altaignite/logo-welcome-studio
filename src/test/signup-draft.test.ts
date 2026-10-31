import { describe, expect, it } from "vitest";
import { DRAFT_DAYS, parseDraft, resumeStep } from "@/lib/signup-draft";

const base = { savedAt: Date.now(), step: 3, planId: "growth", personal: { firstName: "Ana", lastName: "Lee", company: "Co", country: "NL", phone: "+31 6 12345678" }, phoneCountry: "NL", email: "ana@co.com", accountNumber: "1234567890", existingAccount: false };

describe("signup draft", () => {
  it("restores saved details and never contains a password", () => {
    const d = parseDraft(JSON.stringify({ ...base, password: "secret", confirmPassword: "secret" }))!;
    expect(d.personal.firstName).toBe("Ana");
    expect(JSON.stringify(d)).not.toContain("secret");
  });
  it("expires after the retention period and rejects unknown plans or junk", () => {
    expect(parseDraft(JSON.stringify({ ...base, savedAt: Date.now() - (DRAFT_DAYS + 1) * 864e5 }))).toBeNull();
    expect(parseDraft(JSON.stringify({ ...base, planId: "free" }))).toBeNull();
    expect(parseDraft("not json")).toBeNull();
    expect(parseDraft(JSON.stringify({ ...base, accountNumber: "abc" }))!.accountNumber).toBe("");
  });
  it("resumes at the password step once past the details, and at sign-in for existing clients", () => {
    expect(resumeStep(parseDraft(JSON.stringify(base))!)).toEqual({ step: 2, gate: null });
    expect(resumeStep(parseDraft(JSON.stringify({ ...base, step: 1 }))!)).toEqual({ step: 1, gate: null });
    expect(resumeStep(parseDraft(JSON.stringify({ ...base, email: "" }))!)).toEqual({ step: 1, gate: "email" });
    expect(resumeStep(parseDraft(JSON.stringify({ ...base, existingAccount: true }))!)).toEqual({ step: 1, gate: "password" });
  });
  it("returns to the pay step for a signed application, keeping only the account id", () => {
    const id = "11111111-2222-3333-4444-555555555555";
    const d = parseDraft(JSON.stringify({ ...base, step: 6, payUserId: id }))!;
    expect(d.payUserId).toBe(id);
    expect(resumeStep(d)).toEqual({ step: 6, gate: null });
    // A junk id is dropped, and without one a draft never claims to be past the password step.
    expect(parseDraft(JSON.stringify({ ...base, step: 6, payUserId: "x' OR 1=1" }))!.payUserId).toBe("");
    expect(parseDraft(JSON.stringify({ ...base, step: 6 }))!.step).toBe(4);
  });
});
