import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { plans } from "@/lib/signup";

// Prices live on the server in three places that must agree: the shared plan list (orders, Stripe prices, payment checks),
// the signup trigger (handle_new_user) and the billing write guard (is_standard_plan).
describe("plan prices agree everywhere", () => {
  const signup = readFileSync("drizzle/migrations/0020_signup_server_validation.sql", "utf8");
  const guard = readFileSync("drizzle/migrations/0028_billing_write_guards.sql", "utf8");
  for (const p of plans) {
    it(`${p.name}: $${p.monthlyFee} for ${p.monthlyHours} hours`, () => {
      expect(signup).toContain(`('${p.id}','${p.name}',${p.monthlyFee},${p.monthlyHours})`);
      expect(guard).toContain(`('${p.name}', ${p.monthlyFee}::numeric, ${p.monthlyHours}::numeric)`);
    });
  }
});
