import { z } from "zod";
import { AsYouType, getCountries, getCountryCallingCode, getExampleNumber, type CountryCode } from "libphonenumber-js";
import { parsePhoneNumberFromString as parseMobile } from "libphonenumber-js/mobile";
import examples from "libphonenumber-js/mobile/examples";
import { isBlockedDomain } from "@/lib/disposable-domains";
import { passwordIssue } from "@/lib/passwords";

export const subscription = {
  name: "Marketing Accelerator",
  monthlyFee: 199,
  guaranteeDays: 90,
  services: ["Marketing", "Design", "Development"],
  advertisingBudgetIncluded: false,
};

export const plans = [
  { id: "starter", name: "Starter", monthlyFee: 199, monthlyHours: 5, description: "A focused start for your brand." },
  { id: "growth", name: "Growth", monthlyFee: 499, monthlyHours: 15, description: "More room for your next move." },
  { id: "scale", name: "Scale", monthlyFee: 999, monthlyHours: 35, description: "Build momentum across channels." },
] as const;
export type Plan = (typeof plans)[number];
export type PlanId = Plan["id"];
/** Reads a plan id from a URL search value, so links can carry a chosen plan between signup, sign-in and ordering. */
export const planFromSearch = (v: unknown): PlanId | undefined => (plans.some((p) => p.id === v) ? (v as PlanId) : undefined);

export function planTerms(plan: Plan) {
  return `${plan.name} — $${plan.monthlyFee} / month\n${plan.monthlyHours} assigned service hours per month, shared across marketing, design and development. Services are not unlimited. Advertising budgets are separate and excluded.\n90-day money-back guarantee on service fees if no sales are received, requested after day 90 with every invoice paid on time.`;
}


const countryNames = new Intl.DisplayNames(["en"], { type: "region" });
export const countries = getCountries().map((code) => ({
  code, name: countryNames.of(code) ?? code, dial: `+${getCountryCallingCode(code)}`,
})).sort((a, b) => a.name.localeCompare(b.name, "en"));

/** Main country for calling codes shared by several countries. */
const mainCountryForCode: Record<string, CountryCode> = { "1": "US", "7": "RU", "44": "GB", "47": "NO", "61": "AU", "212": "MA", "262": "RE", "290": "SH", "358": "FI", "590": "GP", "599": "CW" };

/**
 * Formats a typed mobile number internationally and detects its country.
 * Numbers typed without "+" are treated as national numbers of the current country.
 */
export function formatPhoneInput(raw: string, current: CountryCode | ""): { value: string; country: CountryCode | "" } {
  const cleaned = raw.replace(/[^\d+]/g, "").replace(/(?!^)\+/g, "");
  if (!cleaned) return { value: "", country: current };
  let international = cleaned;
  if (!cleaned.startsWith("+")) {
    if (!current) return { value: cleaned, country: current };
    const national = cleaned.replace(/^0+/, "");
    international = `+${getCountryCallingCode(current)}${national}`;
  }
  const typer = new AsYouType();
  const value = typer.input(international);
  const callingCode = typer.getCallingCode();
  let country: CountryCode | "" = typer.getCountry() ?? "";
  if (!country && callingCode) {
    country = current && getCountryCallingCode(current) === callingCode ? current : mainCountryForCode[callingCode] ?? countries.find((c) => c.dial === `+${callingCode}`)?.code ?? current;
  }
  return { value, country };
}

/** Switches the calling code while keeping the national digits the user already typed. */
export function switchPhoneCountry(value: string, from: CountryCode | "", to: CountryCode): string {
  const digits = value.replace(/[^\d]/g, "");
  const oldCode = from ? getCountryCallingCode(from) : "";
  const national = value.trim().startsWith("+") && oldCode && digits.startsWith(oldCode) ? digits.slice(oldCode.length) : digits.replace(/^0+/, "");
  return formatPhoneInput(`+${getCountryCallingCode(to)}${national}`, to).value;
}

/** The national part of a stored international number, for the input next to the dial-code picker ("+31 6 1234" shows "6 1234"). */
export function phoneNational(value: string, country: CountryCode | ""): string {
  if (!country) return value;
  const prefix = `+${getCountryCallingCode(country)}`;
  const v = value.trim();
  return v.startsWith(prefix) ? v.slice(prefix.length).trim() : v;
}

/** Example national number for the selected country, shown without the dial code the picker already displays. */
export function phonePlaceholder(country: CountryCode | ""): string {
  if (!country) return "6 12345678";
  const example = getExampleNumber(country, examples)?.formatInternational();
  return example ? phoneNational(example, country) : "";
}

export const personalSchema = z.object({
  firstName: z.string().trim().min(1, "Enter your first name.").max(80),
  lastName: z.string().trim().min(1, "Enter your last name.").max(80),
  company: z.string().trim().min(1, "Enter your business name.").max(160),
  country: z.string().refine((v) => countries.some((c) => c.code === v), "Choose your country."),
  phone: z.string().max(30).refine((v) => parseMobile(v)?.isValid() === true, "Enter a valid mobile number for the selected country."),
});
export const accountSchema = z.object({
  email: z.string().trim().email("Enter a valid email address.").max(254).refine((v) => !isBlockedDomain(v), "Disposable email addresses can't be used. Please use your business or personal email."),
  password: z.string(),
  confirmPassword: z.string(),
}).superRefine((v, ctx) => {
  const issue = passwordIssue(v.password, v.email);
  if (issue) ctx.addIssue({ code: "custom", message: issue, path: ["password"] });
  if (v.password !== v.confirmPassword) ctx.addIssue({ code: "custom", message: "Your passwords don't match.", path: ["confirmPassword"] });
});

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
/** Random 10-digit account number (first digit never 0), issued once account details are completed. */
export function createAccountNumber() {
  const bytes = new Uint32Array(10);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b, i) => String(i === 0 ? 1 + (b % 9) : b % 10)).join("");
}
