import { describe, expect, it } from "vitest";
import { combineRisk, emailSyntaxOk, localSignals, typoSuggestion } from "@/lib/email-risk";
import { passwordIssue } from "@/lib/passwords";

describe("email risk", () => {
  const ok = { acceptsMail: true, ageDays: 4000, blockedInDb: false };
  it("blocks invalid, disposable and undeliverable addresses, and only flags brand-new domains", () => {
    expect(emailSyntaxOk("jane@example.com")).toBe(true);
    expect(localSignals("jane@@example").verdict).toBe("block");
    expect(localSignals("x@mailinator.com").verdict).toBe("block");
    expect(combineRisk(localSignals("jane@acme.com"), { ...ok, acceptsMail: false }).verdict).toBe("block");
    expect(combineRisk(localSignals("jane@acme.com"), { ...ok, ageDays: 2 }).verdict).toBe("review");
    expect(combineRisk(localSignals("jane@acme.com"), { ...ok, blockedInDb: true }).verdict).toBe("block");
  });
  it("flags risky signs for review and suggests typo fixes", () => {
    expect(combineRisk(localSignals("jane@acme.com"), { ...ok, ageDays: 12 }).verdict).toBe("review");
    expect(localSignals("info@acme.com").verdict).toBe("review");
    expect(localSignals("user8475629104@acme.com").verdict).toBe("review");
    expect(typoSuggestion("jane@gmial.com")).toBe("jane@gmail.com");
    expect(typoSuggestion("jane@gmail.com")).toBeUndefined();
  });
  it("lets ordinary addresses through, and never blocks when a lookup fails", () => {
    expect(combineRisk(localSignals("jane.doe@acme.com"), ok).verdict).toBe("ok");
    expect(combineRisk(localSignals("jane.doe@acme.com"), { acceptsMail: null, ageDays: null, blockedInDb: false }).verdict).toBe("ok");
  });
});

describe("password rules", () => {
  it("need length, letters and numbers, and nothing from the email; no symbol or case rules", () => {
    expect(passwordIssue("Short1")).toMatch(/8 characters/);
    expect(passwordIssue("onlyletterslong")).toMatch(/letters and numbers/);
    expect(passwordIssue("aaaaaaaaaaaa")).toMatch(/letters and numbers/);
    expect(passwordIssue("janedoe2026garden", "janedoe@acme.com")).toMatch(/email/);
    expect(passwordIssue("correct horse 42 battery")).toBeNull();
    expect(passwordIssue("bluegarden2026")).toBeNull();
  });
});
