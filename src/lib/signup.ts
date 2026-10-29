import { z } from "zod";
import { getCountries, getCountryCallingCode, parsePhoneNumberFromString, type CountryCode } from "libphonenumber-js";

export const subscription = {
  name: "Marketing Accelerator",
  monthlyFee: 199,
  guaranteeDays: 90,
  services: ["Marketing", "Design", "Development"],
  advertisingBudgetIncluded: false,
};

const countryNames = new Intl.DisplayNames(["en"], { type: "region" });
export const countries = getCountries().map((code) => ({
  code, name: countryNames.of(code) ?? code, dial: `+${getCountryCallingCode(code)}`,
})).sort((a, b) => a.name.localeCompare(b.name, "en"));

export const personalSchema = z.object({
  firstName: z.string().trim().min(1, "Enter your first name.").max(80),
  lastName: z.string().trim().min(1, "Enter your last name.").max(80),
  company: z.string().trim().min(1, "Enter your business name.").max(160),
  country: z.string().refine((v) => countries.some((c) => c.code === v), "Choose your country."),
  phone: z.string().max(30).refine((v) => parsePhoneNumberFromString(v)?.isValid() === true, "Enter a valid mobile number, including its country code."),
});
export const accountSchema = z.object({
  email: z.string().trim().email("Enter a valid email address.").max(254),
  password: z.string().min(8, "Use at least 8 characters for your password.").max(128),
  confirmPassword: z.string(),
}).refine((v) => v.password === v.confirmPassword, { message: "Your passwords don't match.", path: ["confirmPassword"] });

export function createSignatureCode(previousCodes: ReadonlySet<string> = new Set()) {
  if (previousCodes.size >= 900000) throw new Error("No unused confirmation codes remain.");
  let code: string;
  do {
    const bytes = new Uint32Array(1);
    crypto.getRandomValues(bytes);
    const random = bytes[0] ?? 0;
    if (random >= 4294800000) continue;
    code = String(100000 + random % 900000);
    if (!previousCodes.has(code)) return code;
  } while (true);
}

export function isSignatureMatch(code: string, entered: string) {
  return /^\d{6}$/.test(entered) && code === entered;
}

export function refundEligible(days: number, sales: number, feeType: "service" | "advertising") {
  return days >= 0 && days <= subscription.guaranteeDays && sales === 0 && feeType === "service";
}

export type PersonalDetails = z.infer<typeof personalSchema>;
export type { CountryCode };