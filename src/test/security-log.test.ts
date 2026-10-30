import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { guideFor, securityGuide } from "@/lib/security-guide";

describe("security log", () => {
  it("explains every event kind the server records", () => {
    const sources = ["src/lib/rate-limit.server.ts", "src/routes/api/public/stripe/webhook.ts", "src/routes/api/public/cron/collections.ts", "src/lib/access.server.ts", "src/lib/session.middleware.ts", "src/lib/security.functions.ts", "src/lib/staff.functions.ts", "src/routes/api/public/csp-report.ts", "src/server.ts"].map((f) => readFileSync(f, "utf8")).join("\n");
    const kinds = new Set([...sources.matchAll(/logSecurityEvent\(\{ kind: (?:[^"]*\? )?"(\w+)"(?: : "(\w+)")?/g)].flatMap((m) => [m[1], m[2]].filter(Boolean) as string[]));
    kinds.add("account_restricted_kyc");
    for (const k of kinds) expect(securityGuide[k], k).toBeDefined();
    expect(kinds.size).toBeGreaterThan(8);
  });
  it("groups repeats instead of writing a row per request, and only owners can read it", () => {
    const sql = readFileSync("drizzle/migrations/0022_security_events.sql", "utf8");
    expect(sql).toMatch(/ON CONFLICT \(dedupe\) DO UPDATE SET count = security_events\.count \+ 1/);
    expect(sql).toMatch(/USING \(public\.has_perm\(auth\.uid\(\), 'staff'\)\)/);
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.log_security_event\(text, text, text, text, text, uuid, text, jsonb\) TO service_role/);
  });
  it("has guidance for unknown kinds too", () => expect(guideFor("something_new").actions.length).toBeGreaterThan(0));
});
