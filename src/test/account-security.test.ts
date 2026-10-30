import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { disposableDomains, isBlockedDomain } from "@/lib/disposable-domains";
import { deviceLabel, ipNetwork, isNewLocation, locationKey, metadataIssue, placeFromRequest } from "@/lib/security";
import { accountSchema } from "@/lib/signup";
import { departments } from "@/lib/support";

const sql = readFileSync("drizzle/migrations/0012_account_security_saas.sql", "utf8");

describe("disposable email domains", () => {
  it("are seeded into the database exactly as listed", () => {
    const seed = sql.slice(sql.indexOf("INSERT INTO public.blocked_email_domains"), sql.indexOf("ON CONFLICT DO NOTHING;"));
    expect([...seed.matchAll(/\('([^']+)'\)/g)].map((m) => m[1]).sort()).toEqual([...disposableDomains].sort());
  });
  it("block listed domains and their subdomains, not lookalikes", () => {
    expect(isBlockedDomain("a@mailinator.com")).toBe(true);
    expect(isBlockedDomain("a@eu.yopmail.com")).toBe(true);
    expect(isBlockedDomain("A@MAILINATOR.COM")).toBe(true);
    expect(isBlockedDomain("a@notmailinator.com")).toBe(false);
    expect(isBlockedDomain("a@gmail.com")).toBe(false);
  });
  it("are refused at signup", () => {
    expect(accountSchema.safeParse({ email: "x@guerrillamail.com", password: "Password123", confirmPassword: "Password123" }).success).toBe(false);
    expect(accountSchema.safeParse({ email: "x@business.com", password: "Password123", confirmPassword: "Password123" }).success).toBe(true);
  });
  it("are also checked by the signup trigger", () => {
    expect(sql).toMatch(/IF public\.email_domain_blocked\(new\.email\) THEN\s+RAISE EXCEPTION/);
  });
});

describe("sign-in locations", () => {
  const berlin = { ip: "1.2.3.4", country: "DE", region: "BE", city: "Berlin" };
  it("read Cloudflare location headers", () => {
    const h = new Headers({ "cf-connecting-ip": "1.2.3.4", "cf-ipcountry": "DE", "cf-ipcity": "Berlin", "x-forwarded-for": "9.9.9.9" });
    expect(placeFromRequest(h)).toEqual({ ip: "1.2.3.4", country: "DE", region: null, city: "Berlin" });
    expect(placeFromRequest(new Headers({ "cf-ipcountry": "XX" })).country).toBeNull();
  });
  it("don't flag the first sign-in, flag a new city or country", () => {
    expect(isNewLocation(berlin, [])).toBe(false);
    expect(isNewLocation(berlin, [berlin])).toBe(false);
    expect(isNewLocation({ ...berlin, city: "Munich" }, [berlin])).toBe(true);
    expect(isNewLocation({ ...berlin, country: "US", city: "Austin" }, [berlin])).toBe(true);
  });
  it("fall back to the IP network without geolocation", () => {
    expect(ipNetwork("10.20.30.40")).toBe("10.20");
    expect(locationKey({ ip: "10.20.30.40", country: null, region: null, city: null })).toBe("net|10.20");
    expect(isNewLocation({ ip: "10.20.99.1", country: null, region: null, city: null }, [{ ip: "10.20.1.1", country: null, region: null, city: null }])).toBe(false);
    expect(isNewLocation({ ip: "11.0.0.1", country: null, region: null, city: null }, [{ ip: "10.20.1.1", country: null, region: null, city: null }])).toBe(true);
  });
  it("describe devices", () => {
    expect(deviceLabel("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit Safari/604.1")).toBe("Safari on iOS");
    expect(deviceLabel(null)).toBe("Unknown device");
  });
});

describe("user metadata set by staff", () => {
  it("allows short flat values only", () => {
    expect(metadataIssue({ preferred_language: "en", vip: true, seats: 3, note: null })).toBeNull();
    expect(metadataIssue({ "Bad Key": "x" })).toMatch(/valid field name/);
    expect(metadataIssue({ nested: { a: 1 } } as never)).toMatch(/must be text/);
    expect(metadataIssue({ long: "x".repeat(501) })).toMatch(/too long/);
  });
});

describe("support and server-side writes", () => {
  it("match the departments the database allows", () => {
    const m = /department text NOT NULL DEFAULT 'account' CHECK \(department IN \(([^)]*)\)\)/.exec(sql);
    expect(m?.[1]?.split(",").map((s) => s.trim().replaceAll("'", "")).sort()).toEqual(departments.map((d) => d.id).sort());
  });
  it("remove the client's direct ticket write policies", () => {
    expect(sql).toContain('DROP POLICY IF EXISTS "client open ticket" ON public.support_tickets;');
    expect(sql).toContain('DROP POLICY IF EXISTS "client reply open ticket" ON public.ticket_messages;');
  });
  it("cover every table signed-in users can reach with the active-account rule", () => {
    const all = readdirSync("drizzle/migrations").filter((f) => f.endsWith(".sql")).map((f) => readFileSync(`drizzle/migrations/${f}`, "utf8")).join("\n");
    const rls = new Set([...all.matchAll(/ALTER TABLE public\.(\w+) ENABLE ROW LEVEL SECURITY/gi)].map((m) => m[1]!));
    for (const t of ["stripe_events", "job_runs", "rate_limit_hits", "app_secrets"]) rls.delete(t);
    const covered = new Set<string>();
    for (const m of all.matchAll(/FOREACH t IN ARRAY ARRAY\[([^\]]*)\] LOOP\s*EXECUTE format\('CREATE POLICY "active account"/g)) for (const t of m[1]!.matchAll(/'(\w+)'/g)) covered.add(t[1]!);
    expect([...rls].filter((t) => !covered.has(t))).toEqual([]);
  });
  it("lock suspended and closed accounts out of every table", () => {
    const all = sql.slice(sql.indexOf('FOREACH t IN ARRAY ARRAY[\'profiles\''));
    for (const t of ["profiles", "invoices", "subscriptions", "notifications", "documents", "sign_in_events"]) expect(all).toContain(`'${t}'`);
    expect(all).toContain('"active account" ON public.%I AS RESTRICTIVE');
  });
});
