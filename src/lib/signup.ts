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

/** The business clients contract with, as named in every agreement and on the PDF letterhead. */
export const company = {
  name: "First Person Marketing",
  legalName: "Lanex Group, LLC",
  entity: "a limited liability company",
  address: ["250 Park Ave, Floor 7, Suite 2005", "New York, NY 10177", "United States"],
  website: "firstpersonmarketing.com",
  governingLaw: "the State of New York",
  venue: "the state and federal courts located in New York County, New York",
};
export const companyLine = `${company.legalName}, ${company.entity} doing business as ${company.name}, with its principal office at ${company.address.join(", ")}`;

/** The client details printed in the agreements. */
export type AgreementClient = { name: string; company?: string | null; email?: string | null; phone?: string | null; country?: string | null; address?: string | null; accountNumber?: string | null };

/** Bump when agreement wording changes; signed copies record the version they were rendered from. */
export const AGREEMENT_VERSION = "2026-10-30.3";

const countryLabel = (code?: string | null) => {
  if (!code) return null;
  try { return /^[A-Za-z]{2}$/.test(code) ? new Intl.DisplayNames(["en"], { type: "region" }).of(code.toUpperCase()) ?? code : code; } catch { return code; }
};

function partiesBlock(client: AgreementClient | undefined, date: string | undefined) {
  const lines = client
    ? [client.name, client.company, client.address, countryLabel(client.country), client.email, client.phone, client.accountNumber ? `Account number ${client.accountNumber}` : null].filter(Boolean).join("\n")
    : "The client identified in the signature block.";
  return `Effective date: ${date ? new Date(date).toLocaleDateString("en-US", { dateStyle: "long" }) : "the date this Agreement is signed"}

PARTIES
Provider:
${company.legalName}, doing business as ${company.name}
${company.address.join("\n")}

Client:
${lines}`;
}

/** The agreements a client signs for a plan, filled in with the client's details when known. Shown at signup and stored
 * server-side as the signed copy. Body format: numbered lines ("1. Services") are headings, blank lines separate paragraphs. */
export function agreementDocuments(plan: Plan, client?: AgreementClient, date?: string): { title: string; body: string }[] {
  const c = company.name, P = `${company.legalName} ("${c}", "we", "us" or "our")`;
  const who = client ? `${client.name}${client.company ? ` on behalf of ${client.company}` : ""}` : "the client identified above";
  const parties = partiesBlock(client, date);
  const law = `This document is governed by the laws of ${company.governingLaw}, without regard to its conflict-of-laws rules. Each party submits to the exclusive jurisdiction of ${company.venue} for any dispute arising out of or relating to it.`;
  return [
    { title: "Client Services Agreement", body: `${parties}

This Client Services Agreement (the "Agreement") is made between ${P}, ${companyLine}, and ${who} (the "Client", "you" or "your").

1. Definitions
"Services" means the marketing, design and development services described in Section 2. "Plan" means the subscription plan selected by the Client, currently the ${plan.name} Plan. "Service Hours" means the hours of work included in the Plan each month. "Deliverables" means the work product we create for the Client under this Agreement. "Dashboard" means the Client's online account portal.

2. Services
2.1 We will provide marketing, design and development Services within the Service Hours of the Plan, scheduled and prioritised with the Client through the Dashboard.
2.2 The Services are not unlimited. We decide the method, staffing and tools used to perform the Services, acting in a professional and workmanlike manner consistent with generally accepted industry standards.

3. Service Hours
3.1 The ${plan.name} Plan includes ${plan.monthlyHours} Service Hours per calendar month, shared across all Services. Time is recorded against the work performed and is visible in the Dashboard.
3.2 Unused Service Hours do not carry over to a later month and have no cash value.
3.3 Work beyond the monthly allowance is performed only with the Client's prior approval and is billed at the extra-hour rate shown in the Dashboard at the time of approval.

4. Client Obligations
4.1 The Client will provide accurate information, timely feedback, approvals, content and access to accounts and systems reasonably required to perform the Services.
4.2 Delivery dates move to the extent the Client delays any of the above.
4.3 The Client represents and warrants that all materials it provides are owned by it or properly licensed, and do not infringe the intellectual property, privacy or other rights of any third party.

5. Third-Party Costs
Advertising spend, software subscriptions, stock media, domains, hosting and other third-party costs are not included in the Plan. They are paid directly by the Client or, if agreed in writing, re-invoiced at cost.

6. Review and Acceptance
Deliverables are submitted for review in the Dashboard. The Client may approve a Deliverable or request reasonable changes within the Service Hours. A Deliverable is accepted when the Client approves it or uses it in its business.

7. Intellectual Property
7.1 Upon payment in full of all related invoices, we assign to the Client all right, title and interest in the final Deliverables created specifically for the Client.
7.2 We retain ownership of our pre-existing materials, tools, templates, code libraries and know-how ("Provider Materials"). To the extent Provider Materials are incorporated into a Deliverable, we grant the Client a non-exclusive, perpetual, royalty-free licence to use them as part of that Deliverable.
7.3 Unless the Client objects in writing, we may display non-confidential Deliverables and the Client's name in our portfolio.

8. Confidentiality
Each party will keep confidential all non-public business, technical and financial information of the other party and use it only to perform this Agreement, except information that is or becomes public through no fault of the receiving party, or that must be disclosed by law. This obligation survives for three (3) years after termination.

9. No Guarantee of Results
Marketing outcomes depend on factors outside our control. Except for the Money-back Guarantee, we make no promise of any specific sales, revenue, rankings, leads or other results. EXCEPT AS EXPRESSLY STATED IN THIS AGREEMENT, THE SERVICES ARE PROVIDED "AS IS" AND WE DISCLAIM ALL IMPLIED WARRANTIES, INCLUDING MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE.

10. Limitation of Liability
TO THE FULLEST EXTENT PERMITTED BY LAW, OUR TOTAL LIABILITY ARISING OUT OF OR RELATING TO THIS AGREEMENT WILL NOT EXCEED THE SERVICE FEES PAID BY THE CLIENT IN THE THREE (3) MONTHS BEFORE THE EVENT GIVING RISE TO THE CLAIM. NEITHER PARTY IS LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL OR PUNITIVE DAMAGES, OR LOST PROFITS, EVEN IF ADVISED OF THEIR POSSIBILITY.

11. Indemnification
The Client will defend, indemnify and hold us harmless from any third-party claim arising from materials supplied by the Client or the Client's use of the Deliverables in breach of law or this Agreement.

12. Term, Suspension and Termination
12.1 This Agreement starts on the effective date and continues for as long as the Client holds an active subscription.
12.2 The Client may cancel at any time; cancellation takes effect at the end of the current billing period.
12.3 We may suspend the Services while any invoice is past due, and either party may terminate this Agreement if the other materially breaches it and fails to cure the breach within fourteen (14) days of written notice.
12.4 Sections 7 to 11, 13 and 14 survive termination.

13. Electronic Signature and Notices
The parties agree that this Agreement may be signed electronically, and that the Client's electronic signature has the same effect as a handwritten signature under the federal ESIGN Act and the New York Electronic Signatures and Records Act. Notices may be given through the Dashboard or by email to the address on the Client's account.

14. General
14.1 Governing law. ${law}
14.2 Entire agreement. This Agreement, together with the Subscription and Billing Terms, the Money-back Guarantee and the Privacy Notice, is the entire agreement between the parties about its subject matter and supersedes all prior discussions.
14.3 Amendments. Changes must be agreed in writing, which includes acceptance through the Dashboard.
14.4 Assignment. The Client may not assign this Agreement without our consent. We may assign it to an affiliate or successor.
14.5 Independent contractors. The parties are independent contractors.
14.6 Severability and waiver. If any provision is held unenforceable, the remainder stays in effect. A failure to enforce a provision is not a waiver.
14.7 Force majeure. Neither party is liable for delays caused by events beyond its reasonable control.` },
    { title: "Subscription and Billing Terms", body: `${parties}

These Subscription and Billing Terms (the "Terms") form part of the Client Services Agreement between ${P} and ${who}.

1. Plan
${planTerms(plan)}

2. Billing
2.1 The subscription is billed monthly in advance through our payment processor, Stripe, Inc.
2.2 The first invoice is issued when the Client's application is approved, and the Plan starts when that invoice is paid. Renewal invoices are issued at the start of each billing period.

3. Payment
3.1 Invoices are payable in US dollars by the due date shown on the invoice.
3.2 The Client authorises us and Stripe to charge the payment method on file for each invoice when due.
3.3 Fees exclude sales, use, value-added and similar taxes, which are added where required by law.

4. Late Payment
4.1 An invoice not paid by its due date is past due.
4.2 Past-due amounts accrue interest and collection fees at the rates set out in our billing policy as shown on the overdue invoice, not exceeding the maximum rate permitted by law.
4.3 If an invoice remains unpaid, we may suspend the Services, projects and Dashboard access, and refer the debt to a collection agency or legal counsel. The Client is responsible for reasonable costs of collection.
4.4 Services resume when the balance is paid in full.

5. Changes and Cancellation
5.1 The Client may upgrade, downgrade or cancel the Plan through the Dashboard or by contacting support.
5.2 Cancellation takes effect at the end of the current billing period. Fees already paid are non-refundable, except as provided in the Money-back Guarantee.
5.3 We will give at least thirty (30) days' notice of any change to the Plan price.

6. Refunds and Disputes
Approved refunds are returned to the original payment method. The Client agrees to contact us to resolve any billing issue before initiating a chargeback.

7. Governing Law
${law}` },
    { title: "Money-back Guarantee", body: `${parties}

This Money-back Guarantee forms part of the Client Services Agreement between ${P} and ${who}.

1. Guarantee
If the Client's business receives no sales during the first ninety (90) days after the Plan starts, the Client may request a refund of the service fees paid for those ninety (90) days.

2. Claim Period
A claim may be made only after the ninety (90) days have passed and within the following thirty (30) days, through the subscription page of the Dashboard.

3. Eligibility Conditions
3.1 Every invoice on the Plan was paid on time, with no failed or late payments.
3.2 No invoice on the Plan was voided, and the Plan was not paused during the first ninety (90) days.
3.3 The Client provided the information, access and approvals we reasonably requested.
3.4 The Client certifies that no sales were received in the period.

4. Exclusions
Advertising spend, third-party costs, extra Service Hours and taxes are not refundable.

5. Effect of a Refund
When the refund is paid, the Plan and the related Services end.

6. Verification
We may request reasonable evidence to verify a claim. A claim found to be inaccurate may be refused.` },
    { title: "Privacy Notice", body: `${parties}

This Privacy Notice explains how ${P}, ${companyLine}, collects and uses the personal information of ${who}.

1. Information We Collect
Name, business name, contact details, country, account and billing information, content shared with us, and technical information such as sign-in times, approximate location, IP address and device, used to secure the account.

2. How We Use It
To provide and bill the Services, communicate about the account, keep the account secure, comply with legal obligations and, with consent, send marketing. Marketing preferences can be changed in the Dashboard at any time.

3. Sharing
We share personal information only with service providers that help us operate, including Stripe for payments and our hosting, database and email providers, under contracts that limit their use of it. We do not sell personal information.

4. Retention
We keep personal information while the account is open and afterwards only as long as required for legal, tax and accounting purposes. Invoices, payments and signed agreements are retained for the periods required by law.

5. Your Rights
Depending on where you live, you may request access to, correction of, or deletion of your personal information, and object to certain uses, through the privacy section of the Dashboard. We respond within the time limits required by applicable law.

6. Security
We protect personal information with access controls and encryption in transit. Two-factor authentication is available for every account.

7. Contact
${company.legalName}, ${company.address.join(", ")}.` },
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
