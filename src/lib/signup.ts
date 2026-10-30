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

/** The business clients contract with, as named in every agreement. */
export const company = { name: "First Person Marketing", short: "FP", website: "firstpersonmarketing.com" };

/** Bump when agreement wording changes; signed copies record the version they were rendered from. */
export const AGREEMENT_VERSION = "2026-10-30.2";

/** The agreements a client signs for a plan. Shown at signup and stored server-side as the signed copy.
 * Body format: numbered lines ("1. Services") are headings, blank lines separate paragraphs. */
export function agreementDocuments(plan: Plan): { title: string; body: string }[] {
  const c = company.name;
  return [
    { title: "Client Services Agreement", body: `This Client Services Agreement ("Agreement") is entered into between ${c} ("we", "us") and the client named in the signature block ("you"). It takes effect when you sign it digitally and continues while you hold an active subscription.

1. Services
We provide marketing, design and development services for your business within the monthly service hours of your plan. Work is scheduled and prioritised with you through your dashboard. Services are not unlimited.

2. Service hours
Your ${plan.name} plan includes ${plan.monthlyHours} service hours per calendar month, shared across all services. Time is recorded against the tasks we complete for you and is visible in your dashboard. Unused hours do not carry over to the next month. Work beyond your allowance is only carried out with your approval and is billed at the extra-hour rate shown in your dashboard.

3. Your responsibilities
You agree to provide accurate information, timely feedback and the access, content and approvals we need to deliver the work. Delays in providing these may move delivery dates. You confirm that material you supply does not infringe anyone else's rights.

4. Advertising budgets and third-party costs
Advertising spend, paid tools, stock assets, domains, hosting and other third-party costs are not included in your plan. They are paid by you directly or, if agreed in writing, re-invoiced at cost.

5. Review and approval
Deliverables are sent to your dashboard for review. You may approve them or request changes. Approved deliverables are considered accepted.

6. Ownership
Once the related invoices are paid in full, you own the final deliverables we create for you. We keep ownership of our pre-existing tools, templates and know-how, and you receive a licence to use any of them included in your deliverables. We may show non-confidential work in our portfolio unless you ask us not to.

7. Confidentiality
Each party keeps the other's non-public business information confidential and uses it only to perform this Agreement. This obligation continues after the Agreement ends.

8. Results
Marketing results depend on factors outside our control. Apart from the money-back guarantee, we do not guarantee specific sales, rankings, leads or other outcomes.

9. Liability
To the extent permitted by law, our total liability under this Agreement is limited to the service fees you paid in the three months before the claim. Neither party is liable for indirect or consequential loss, including lost profits. Nothing in this Agreement limits liability that cannot be limited by law.

10. Suspension and termination
You may cancel your subscription at any time; it ends at the close of the current billing period. We may pause or suspend services if invoices are unpaid or if this Agreement is seriously breached, and may end the Agreement if the breach is not remedied within 14 days of notice. Sections 6 to 9 continue after termination.

11. General
This Agreement, together with the Subscription and Billing Terms, the Money-back Guarantee and the Privacy Notice, is the entire agreement between us about the services. Changes must be agreed in writing, including through your dashboard. If any part is found unenforceable, the rest remains in effect.` },
    { title: "Subscription and Billing Terms", body: `These terms set out how your subscription with ${c} is billed.

1. Your plan
${planTerms(plan)}

2. Billing
Your subscription is billed monthly in advance through our payment provider, Stripe. Your first invoice is issued when your application is approved and your plan starts when it is paid. Renewal invoices are issued at the start of each billing period.

3. Payment
Invoices are due on the date shown on the invoice. You authorise us and Stripe to charge the payment method you provide for each invoice. Prices exclude taxes, which are added where required.

4. Late payment
If an invoice is unpaid after its due date, your plan becomes past due. Overdue amounts may accrue interest and collection fees at the rates set out in our billing policy, which are shown on the overdue invoice. If an invoice remains unpaid, services, projects and access may be suspended and the debt may be passed to a recovery agency or pursued through the courts. Services resume once the balance is settled.

5. Changes and cancellation
You can upgrade, downgrade or cancel from your dashboard or by contacting support. Cancellation takes effect at the end of the current billing period and fees already paid are not refunded, except under the Money-back Guarantee. We will give you at least 30 days' notice of any price change.

6. Refunds and disputes
Refunds are paid to the original payment method. Please contact us before raising a dispute with your bank so we can resolve the issue.` },
    { title: "Money-back Guarantee", body: `${c} offers a money-back guarantee on service fees.

1. What is covered
If your business receives no sales during the first 90 days of your plan, you can request a refund of the service fees you paid for those 90 days.

2. How to claim
You can request the refund once 90 days have passed since your plan started, within the following 30 days, from the subscription page of your dashboard.

3. Conditions
Every invoice on the plan must have been paid on time, with no failed or late payments, no voided invoices and no pause in the first 90 days. You must have provided the information, access and approvals we requested, and you confirm that no sales were received.

4. What is not covered
Advertising budgets, third-party costs, extra hours and taxes are not refunded.

5. After a refund
When the refund is paid, the plan ends and its services stop.` },
    { title: "Privacy Notice", body: `This notice explains how ${c} uses your personal information.

1. What we collect
Your name, business name, contact details, country, account and billing details, the content you share with us, and technical information such as sign-in times, approximate location and device, which we use to protect your account.

2. How we use it
To provide and bill your services, communicate with you about your account, keep your account secure, meet our legal obligations and, if you agree, send you marketing. You can change your marketing choices in your dashboard at any time.

3. Who we share it with
Service providers that help us run the service, including Stripe for payments, our hosting and database providers and our email provider. They may only use your information to provide their services to us. We do not sell your personal information.

4. How long we keep it
For as long as your account is open, and afterwards only as long as needed for legal, tax and accounting purposes. Invoices, payments and signed agreements are kept for the period the law requires.

5. Your rights
You can request a copy of your data, ask us to correct it, or ask for your account to be closed and your personal details removed, from the privacy section of your dashboard. We respond within the time limits set by law.

6. Security
Your data is stored with access controls, and you can turn on two-factor authentication for your login.` },
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
