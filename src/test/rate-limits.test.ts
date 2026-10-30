import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { rateLimits, windowStart } from "@/lib/limits";

describe("rate limits", () => {
  it("cover every server action", () => {
    for (const f of readdirSync("src/lib").filter((x) => x.endsWith(".functions.ts"))) {
      const src = readFileSync(`src/lib/${f}`, "utf8");
      const fns = [...src.matchAll(/export const (\w+) = createServerFn\(\{ method: "POST" \}\)\n  \.middleware\(\[(\w+)(?:\("(\w+)"\))?\]\)/g)];
      for (const [, name, mw, limit] of fns) {
        if (name === "touchSession") { expect(mw).toBe("requireSession"); continue; }
        expect([f, name, mw]).toEqual([f, name, "limited"]);
        expect(rateLimits).toHaveProperty(limit!);
      }
    }
  });
  it("are sensible", () => {
    for (const [name, r] of Object.entries(rateLimits)) {
      expect([name, r.max > 0, r.windowSec >= 60, r.message.length > 10]).toEqual([name, true, true, true]);
    }
    expect(rateLimits.order.max).toBeLessThanOrEqual(10);
    expect(rateLimits.refund.max).toBeLessThanOrEqual(10);
  });
  it("use the same fixed windows as the database", () => {
    expect(windowStart(new Date("2026-10-30T10:42:13Z"), 3600).toISOString()).toBe("2026-10-30T10:00:00.000Z");
    const sql = readFileSync("drizzle/migrations/0014_rate_limits.sql", "utf8");
    expect(sql).toContain("floor(extract(epoch FROM now()) / _window_seconds) * _window_seconds");
    expect(sql).toMatch(/REVOKE EXECUTE ON FUNCTION public\.hit_rate_limit\(text, int, int\) FROM PUBLIC, anon, authenticated/);
  });
});
