import { z } from "zod";
import { AsYouType, getCountries, getCountryCallingCode, getExampleNumber, type CountryCode } from "libphonenumber-js";
import { parsePhoneNumberFromString as parseMobile } from "libphonenumber-js/mobile";
import examples from "libphonenumber-js/mobile/examples";
import { isBlockedDomain } from "@/lib/disposable-domains";

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

export function planTerms(plan: Plan) {
  return `${plan.name} — $${plan.monthlyFee} / month\n${plan.monthlyHours} assigned service hours per month, shared across marketing, design and development. Services are not unlimited. Advertising budgets are separate and excluded.\n90-day money-back guarantee on service fees if no sales are received, requested after day 90 with every invoice paid on time.`;
}

/** Bump when agreement wording changes; signed copies record the version they were rendered from. */
export const AGREEMENT_VERSION = "2026-10-30";

/** The agreements a client signs for a plan. Shown at signup and stored server-side as the signed copy. */
export function agreementDocuments(plan: Plan): { title: string; body: string }[] {
  return [
    { title: "Client Agreement", body: "FP Marketing Accelerator\n\nYour monthly subscription covers marketing, design and development services within your assigned monthly service hours. Services are not unlimited. Advertising budgets are excluded and are separate from service fees." },
    { title: "Subscription Agreement", body: `FP Subscription Agreement\n\n${planTerms(plan)}` },
    { title: "90-day Money-back Guarantee", body: "90-day money-back guarantee\n\nIf you receive no sales in your first 90 days, you can request a refund of your service fees once those 90 days have passed, within the following 30 days. Every invoice on the plan must have been paid on time, with no failed or late payments, and the plan must not have been paused in its first 90 days. Advertising budgets are not covered." },
    { title: "Privacy Information", body: "Privacy\n\nWe use your personal and business details to provide your services, bill you and contact you about your account. Billing records are kept for as long as the law requires. You can ask for a copy of your data or for your account to be closed from your dashboard at any time." },
  ];
}

/** Signed copy of an agreement, as stored and shown in the dashboard. */
export function signedAgreementText(doc: { title: string; body: string }, signer: { name: string; accountNumber: string; signedAt: string }) {
  return `${doc.body}\n\n---\nSigned digitally by ${signer.name} (account ${signer.accountNumber}) on ${new Date(signer.signedAt).toISOString()}.\nAgreement version ${AGREEMENT_VERSION}.`;
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

export function phonePlaceholder(country: CountryCode | ""): string {
  if (!country) return "+31 6 12345678";
  return getExampleNumber(country, examples)?.formatInternational() ?? `+${getCountryCallingCode(country)}`;
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
  password: z.string().min(10, "Use at least 10 characters for your password.").max(128).regex(/[a-z]/, "Add a lower case letter.").regex(/[A-Z]/, "Add an upper case letter.").regex(/\d/, "Add a number."),
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
/** Random 10-digit account number (first digit never 0), issued once account details are completed. */
export function createAccountNumber() {
  const bytes = new Uint32Array(10);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b, i) => String(i === 0 ? 1 + (b % 9) : b % 10)).join("");
}
