import { describe, expect, it } from "vitest";
import { verifyStripeSignature } from "@/lib/stripe.server";

async function sign(payload: string, secret: string, t: number) {
  const k = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(`${t}.${payload}`)));
  return `t=${t},v1=${[...mac].map((b) => b.toString(16).padStart(2, "0")).join("")}`;
}

describe("Stripe webhook signatures", () => {
  const now = Math.floor(Date.now() / 1000);
  it("accepts a valid signature", async () => expect(await verifyStripeSignature("{}", await sign("{}", "whsec_test", now), "whsec_test")).toBe(true));
  it("rejects a tampered body", async () => expect(await verifyStripeSignature("{\"a\":1}", await sign("{}", "whsec_test", now), "whsec_test")).toBe(false));
  it("rejects old timestamps", async () => expect(await verifyStripeSignature("{}", await sign("{}", "whsec_test", now - 600), "whsec_test")).toBe(false));
});
