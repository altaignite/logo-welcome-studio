import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { accountStatusLabel, clientActionsBlocked, kycRestricted, orderingBlocked, signInBlocked, subscriptionEffect, KYC_ERROR } from "@/lib/admin";
import { friendlyError } from "@/lib/errors";

describe("Fraud - KYC restriction", () => {
  it("lets the client sign in to see the KYC page but blocks every action and pauses plans", () => {
    expect(accountStatusLabel.fraud_kyc).toBe("Fraud - KYC");
    expect(signInBlocked("fraud_kyc")).toBe(false);
    expect(kycRestricted("fraud_kyc")).toBe(true);
    expect(clientActionsBlocked("fraud_kyc")).toBe(true);
    expect(orderingBlocked("fraud_kyc")).toBe(true);
    expect(subscriptionEffect("fraud_kyc")).toBe("paused");
    expect(friendlyError(new Error(KYC_ERROR))).toMatch(/identity verification/);
  });
  it("closes every table to restricted accounts and flags duplicate phone numbers in the database", () => {
    const sql = readFileSync("drizzle/migrations/0018_fraud_kyc.sql", "utf8");
    expect(sql).toMatch(/p\.status IN \('suspended','closed','fraud_kyc'\)/);
    expect(sql).toMatch(/AFTER INSERT OR UPDATE OF phone ON public\.profiles/);
    expect(sql).toMatch(/flagged due to duplication of phone number/);
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.flag_for_kyc\(uuid, text, text\) TO service_role/);
    expect(sql).not.toMatch(/flag_for_kyc\(uuid, text, text\) TO authenticated/);
  });
  it("refuses server actions for restricted accounts", () => {
    const mw = readFileSync("src/lib/session.middleware.ts", "utf8");
    expect(mw).toMatch(/kycRestricted\(prof\.data\.status\)\) throw new Error\(KYC_ERROR\)/);
  });
});
