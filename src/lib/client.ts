import { z } from "zod";
import { plans } from "@/lib/signup";

/** Profile fields a client may edit themselves. Everything else (account number, email, status, notes, legal) is staff-only. */
export const clientEditableFields = ["first_name", "last_name", "company", "phone", "country", "address_line", "city", "state", "postal_code", "website", "timezone", "industry", "company_size", "marketing_opt_in", "sms_opt_in"] as const;

const text = (max: number) => z.string().trim().max(max).optional().nullable();
export const profileUpdateSchema = z.object({
  first_name: z.string().trim().min(1).max(80).optional(),
  last_name: z.string().trim().min(1).max(80).optional(),
  company: text(160), phone: text(40), country: text(80), address_line: text(200), city: text(100), state: text(100),
  postal_code: text(20), website: text(200), timezone: text(60), industry: text(100), company_size: text(40),
  marketing_opt_in: z.boolean().optional(), sms_opt_in: z.boolean().optional(),
}).strict();

/** Returns a message when a password is too weak, or null when it's acceptable. */
export function passwordIssue(pw: string): string | null {
  if (pw.length < 10) return "Use at least 10 characters.";
  if (!/[a-z]/.test(pw) || !/[A-Z]/.test(pw)) return "Use both upper and lower case letters.";
  if (!/\d/.test(pw)) return "Include at least one number.";
  return null;
}

/** Upgrades take effect now (prorated); downgrades wait until renewal so paid hours aren't lost. */
export function planChangeTiming(fromPlanName: string, toPlanId: string): "now" | "renewal" | "same" {
  const from = plans.find((p) => p.name === fromPlanName);
  const to = plans.find((p) => p.id === toPlanId);
  if (!to) throw new Error("Unknown plan");
  if (from?.id === to.id) return "same";
  return !from || to.monthlyFee > from.monthlyFee ? "now" : "renewal";
}
