import { describe, expect, it } from "vitest";
import { crossSiteRefused, httpsRedirect } from "@/server";

const req = (url: string, init: RequestInit & { headers?: Record<string, string> } = {}) => new Request(url, init);

describe("HTTPS is enforced", () => {
  it("redirects plain HTTP on the public site, keeping the path", () => {
    const r = httpsRedirect(req("http://app.example.com/dashboard?x=1"));
    expect(r?.status).toBe(308);
    expect(r?.headers.get("location")).toBe("https://app.example.com/dashboard?x=1");
    expect(httpsRedirect(req("https://app.example.com/", { headers: { "x-forwarded-proto": "http" } }))?.status).toBe(308);
  });
  it("leaves HTTPS and local development alone", () => {
    expect(httpsRedirect(req("https://app.example.com/"))).toBeNull();
    expect(httpsRedirect(req("http://localhost:5173/"))).toBeNull();
    expect(httpsRedirect(req("http://127.0.0.1:5173/"))).toBeNull();
  });
});

describe("cross-site requests are refused", () => {
  const post = (origin?: string, path = "/api/public/account-check") => req(`https://app.example.com${path}`, { method: "POST", headers: origin ? { origin } : {} });
  it("refuses a browser POST from another site", () => {
    expect(crossSiteRefused(post("https://evil.example"))?.status).toBe(403);
    expect(crossSiteRefused(post("https://app.example.com.evil.example"))?.status).toBe(403);
    expect(crossSiteRefused(post("null"))?.status).toBe(403);
  });
  it("allows same-site, server-to-server and Stripe's webhook", () => {
    expect(crossSiteRefused(post("https://app.example.com"))).toBeNull();
    expect(crossSiteRefused(post())).toBeNull();
    expect(crossSiteRefused(post("https://evil.example", "/api/public/stripe/webhook"))).toBeNull();
    expect(crossSiteRefused(req("https://app.example.com/", { headers: { origin: "https://evil.example" } }))).toBeNull();
  });
});
