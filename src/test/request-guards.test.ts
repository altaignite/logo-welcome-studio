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

describe("content security policy", () => {
  it("enforces the full allow-list on the published site", async () => {
    const { cspHeaders } = await import("@/server");
    const h = cspHeaders("logo-welcome-studio.lovable.app");
    expect(h["Content-Security-Policy"]).toContain("script-src 'self'");
    expect(h["Content-Security-Policy"]).toContain("https://js.stripe.com");
    expect(h["Content-Security-Policy"]).not.toContain("unsafe-eval");
    expect(h["Content-Security-Policy"]).toContain("frame-ancestors 'none'");
    expect(h["Content-Security-Policy-Report-Only"]).toBeUndefined();
  });
  it("only reports the full list on Lovable previews and local development", async () => {
    const { cspHeaders } = await import("@/server");
    for (const host of ["id-preview--abc.lovable.app", "abc.lovableproject.com", "localhost:5173", "127.0.0.1:5173"]) {
      const h = cspHeaders(host);
      expect(h["Content-Security-Policy"]).not.toContain("script-src");
      expect(h["Content-Security-Policy-Report-Only"]).toContain("script-src");
    }
  });
});
