import { describe, expect, it } from "vitest";
import { RESET_WINDOW_SECONDS, recoveryAllowed } from "@/lib/passwords";

const token = (amr: unknown) => `h.${btoa(JSON.stringify({ amr })).replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_")}.s`;
const now = 1_800_000_000;

describe("password reset links expire", () => {
  it("accepts a session from a reset link opened within the hour", () => {
    expect(recoveryAllowed(token([{ method: "recovery", timestamp: now - 60 }]), now)).toBe(true);
    expect(recoveryAllowed(token([{ method: "otp", timestamp: now - RESET_WINDOW_SECONDS }]), now)).toBe(true);
  });
  it("refuses expired links, normal sign-ins and junk", () => {
    expect(recoveryAllowed(token([{ method: "recovery", timestamp: now - RESET_WINDOW_SECONDS - 1 }]), now)).toBe(false);
    expect(recoveryAllowed(token([{ method: "password", timestamp: now - 10 }]), now)).toBe(false);
    expect(recoveryAllowed(token([]), now)).toBe(false);
    expect(recoveryAllowed("not-a-jwt", now)).toBe(false);
    expect(recoveryAllowed(null, now)).toBe(false);
  });
});
