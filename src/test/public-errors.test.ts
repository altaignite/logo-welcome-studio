import { describe, expect, it } from "vitest";
import { publicMessage } from "@/lib/public-errors";

describe("error messages never reveal internals", () => {
  it("keeps messages written for people", () => {
    for (const m of ["Choose a plan.", "This invoice is already paid.", "Too many attempts for this email. Please try again later.", "Your card was declined: Your card has insufficient funds."])
      expect(publicMessage(m)).toBe(m);
    expect(publicMessage("Stripe couldn't complete this: Your card was declined.")).toBe("Your card was declined.");
  });
  it("hides database details", () => {
    expect(publicMessage('duplicate key value violates unique constraint "profiles_pkey"')).toBeNull();
    expect(publicMessage('insert or update on table "invoices" violates foreign key constraint')).toBeNull();
    expect(publicMessage('column "secret_note" does not exist')).toBeNull();
    expect(publicMessage("new row violates row-level security policy for table \"subscriptions\"")).toBeNull();
    expect(publicMessage("PGRST116: JSON object requested, multiple rows returned")).toBeNull();
  });
  it("hides ids, URLs, keys and code errors", () => {
    expect(publicMessage("Stripe couldn't complete this: No such customer: 'cus_VXWZP2HzYxkpto'")).toBeNull();
    expect(publicMessage("Profile 585810ab-ac92-48ad-8a9c-37e2c4f8c9ce not found")).toBeNull();
    expect(publicMessage("request to https://api.stripe.com/v1/invoices failed")).toBeNull();
    expect(publicMessage("TypeError: Cannot read properties of undefined (reading 'id')")).toBeNull();
    expect(publicMessage("Error\n    at handler (/app/src/lib/billing.server.ts:120:5)")).toBeNull();
    expect(publicMessage("Invalid API key provided: sk_live_****abcd")).toBeNull();
    expect(publicMessage("fetch failed")).toBeNull();
    expect(publicMessage("x".repeat(301))).toBeNull();
  });
});
