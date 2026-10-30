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
