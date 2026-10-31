import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("staff access", () => {
  const login = readFileSync("src/routes/admin-login.tsx", "utf8");
  it("doesn't reveal the staff email domain, offer self-registration or confirm which accounts exist", () => {
    expect(login).not.toMatch(/firstpersonmarketing/i);
    expect(login).not.toMatch(/signUp\(/);
    expect(login).not.toMatch(/No admin access|Staff email required/);
  });
  it("grants staff access only from an unexpired invitation, never from the email domain", () => {
    const sql = readFileSync("drizzle/migrations/0019_staff_invites.sql", "utf8");
    const fn = sql.slice(sql.indexOf("CREATE OR REPLACE FUNCTION public.grant_admin_for_domain"));
    expect(fn).toMatch(/FROM staff_invites WHERE email = lower\(new\.email\) AND accepted_at IS NULL AND expires_at > now\(\)/);
    expect(fn).not.toMatch(/split_part|firstpersonmarketing/);
  });
  it("trusts only Cloudflare's client IP header for limits and sign-in records", () => {
    for (const f of ["src/lib/security.ts", "src/routes/api/public/account-check.ts"]) expect(readFileSync(f, "utf8")).not.toMatch(/headers\.get\("x-forwarded-for"\)/);
  });
});

describe("server-side guarantees", () => {
  it("validates signup details in the database, whatever calls the signup API", () => {
    const sql = readFileSync("drizzle/migrations/0020_signup_server_validation.sql", "utf8");
    for (const msg of ["Enter your first and last name.", "Enter your business name.", "Choose your country.", "Enter a valid mobile number in international format.", "Choose a plan."]) expect(sql).toContain(msg);
  });
  it("gives signed-out visitors no table privileges", () => {
    const sql = readFileSync("drizzle/migrations/0021_revoke_anon_tables.sql", "utf8");
    expect(sql).toMatch(/REVOKE ALL ON public\.%I FROM anon/);
    expect(sql).toMatch(/ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon/);
  });
  it("sends security headers including an enforced content security policy", () => {
    const s = readFileSync("src/server.ts", "utf8");
    expect(s).toMatch(/const coreCsp = "object-src 'none'; base-uri 'self'; frame-ancestors 'none'/);
    expect(s).toMatch(/"Content-Security-Policy": fullCsp/);
  });
});
