import { z } from "zod";
import { plans } from "@/lib/signup";
import { guaranteeCheck } from "@/lib/billing";

/** Profile fields a client may edit themselves. Everything else (account number, email, status, notes, legal) is staff-only. */
export const clientEditableFields = ["first_name", "last_name", "company", "phone", "country", "address_line", "city", "state", "postal_code", "website", "timezone", "industry", "company_size", "marketing_opt_in", "sms_opt_in", "email_notifications"] as const;

const text = (max: number) => z.string().trim().max(max).optional().nullable();
export const profileUpdateSchema = z.object({
  first_name: z.string().trim().min(1).max(80).optional(),
  last_name: z.string().trim().min(1).max(80).optional(),
  company: text(160), phone: text(40), country: text(80), address_line: text(200), city: text(100), state: text(100),
  postal_code: text(20), website: text(200), timezone: text(60), industry: text(100), company_size: text(40),
  marketing_opt_in: z.boolean().optional(), sms_opt_in: z.boolean().optional(), email_notifications: z.boolean().optional(),
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

/** The client can request the money-back refund when every guarantee rule passes (see guaranteeCheck). */
export function guaranteeClaimable(sub: Parameters<typeof guaranteeCheck>[0], invoices: Parameters<typeof guaranteeCheck>[1], now = new Date()) {
  return guaranteeCheck(sub, invoices, now).eligible;
}
export const guaranteeClaimSchema = z.object({
  subscriptionId: z.string().uuid(),
  statement: z.string().trim().min(20, "Tell us briefly what happened in the first 90 days.").max(4000),
  confirmNoSales: z.literal(true, { errorMap: () => ({ message: "Confirm that you received no sales." }) }),
});
export const infoResponseSchema = z.object({ applicationId: z.string().uuid(), message: z.string().trim().min(3, "Write a short reply.").max(4000) });
