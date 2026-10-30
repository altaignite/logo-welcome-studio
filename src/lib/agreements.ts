import { type Plan } from "@/lib/signup";
import { defaultRules, type BillingRules } from "@/lib/billing";

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
export const AGREEMENT_VERSION = "2026-10-30.9";

/**
 * Agreement body markup, shared by the reading dialog and the PDF:
 * - a line like "1. Services" is a section heading;
 * - lines starting with "|" form a table ("||" marks the header row), cells separated by " | ";
 * - a paragraph starting with "!" is a highlighted notice;
 * - blank lines separate paragraphs.
 */
export type AgreementBlock = { kind: "heading"; text: string } | { kind: "para"; text: string } | { kind: "notice"; text: string } | { kind: "table"; header: string[] | null; rows: string[][] };

export function parseAgreement(body: string): AgreementBlock[] {
  const out: AgreementBlock[] = [];
  for (const chunk of body.split(/\n\s*\n/)) {
    const lines = chunk.split("\n").filter((l) => l.trim());
    if (!lines.length) continue;
    if (lines.every((l) => l.startsWith("|"))) {
      const cells = (l: string) => l.replace(/^\|\|?/, "").split(" | ").map((c) => c.trim());
      const header = lines[0]!.startsWith("||") ? cells(lines[0]!) : null;
      out.push({ kind: "table", header, rows: (header ? lines.slice(1) : lines).map(cells) });
      continue;
    }
    // Leading heading lines, then the rest of the chunk is one paragraph (or a highlighted notice).
    let i = 0;
    while (i < lines.length && /^\d+\.\s/.test(lines[i]!) && lines[i]!.length < 90) out.push({ kind: "heading", text: lines[i++]! });
    if (i < lines.length) {
      const text = lines.slice(i).join("\n");
      out.push(text.startsWith("!") ? { kind: "notice", text: text.slice(1).trim() } : { kind: "para", text });
    }
  }
  return out;
}

const countryLabel = (code?: string | null) => {
  if (!code) return null;
  try { return /^[A-Za-z]{2}$/.test(code) ? new Intl.DisplayNames(["en"], { type: "region" }).of(code.toUpperCase()) ?? code : code; } catch { return code; }
};
const money = (n: number) => `US$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const longDate = (d?: string) => (d ? new Date(d).toLocaleDateString("en-US", { dateStyle: "long" }) : "On signature");

function partiesTable(client: AgreementClient | undefined, date: string | undefined) {
  const c = client;
  const row = (label: string, provider: string, cl: string | null | undefined) => `| ${label} | ${provider} | ${cl || "—"}`;
  return [
    "|| | Provider | Client",
    row("Party", `${company.legalName}, d/b/a ${company.name}`, c ? c.name : "As identified at signature"),
    row("Business", company.name, c?.company),
    row(c?.address ? "Address" : "Address / country", company.address.join(", "), [c?.address, countryLabel(c?.country)].filter(Boolean).join(", ")),
    row("Contact", company.website, [c?.email, c?.phone].filter(Boolean).join(", ")),
    row("Account number", "—", c?.accountNumber?.replace(/^(\d{4})(\d{3})(\d{3})$/, "$1 $2 $3")),
    `| Effective date | ${longDate(date)} | `,
  ].join("\n");
}

function planTable(plan: Plan) {
  return [
    "|| Item | Detail",
    `| Plan | ${plan.name}`,
    `| Monthly service fee | ${money(plan.monthlyFee)} plus applicable taxes`,
    `| Service Hours | ${plan.monthlyHours} hours per calendar month, shared across all Services`,
    "| Services | Marketing, design and development",
    "| Billing | Monthly in advance, automatically renewing",
    "| Minimum term | None; cancel any time effective at the end of the billing period",
    "| Money-back guarantee | 90 days, on service fees, subject to the Money-back Guarantee terms",
  ].join("\n");
}

/** Where the full legal policies live. The in-app agreement summarises them and incorporates them by reference. */
export const LEGAL_URL = "https://firstpersonmarketing.com/legal";

/** The agreement a client signs for a plan: one plain-language Service Agreement with the parties, the plan and the key terms,
 * which incorporates the full policies at LEGAL_URL by reference. Filled in with the client's details when known. Shown at
 * signup, ordering and plan changes, and stored server-side as the signed copy. */
export function agreementDocuments(plan: Plan, client?: AgreementClient, date?: string, rules: BillingRules = defaultRules): { title: string; body: string }[] {
  const who = client ? `${client.name}${client.company ? `, on behalf of ${client.company}` : ""}` : "the client identified above";
  const yearly = Math.round((Math.pow(1 + rules.monthly_interest_pct / 100, 12) - 1) * 1000) / 10;
  return [{ title: "Service Agreement", body: `${partiesTable(client, date)}

${planTable(plan)}

! Automatic renewal: your plan renews every month at ${money(plan.monthlyFee)} plus applicable taxes, charged to your payment method, until you cancel. You can cancel at any time in your dashboard; cancellation takes effect at the end of the current billing period and you won't be charged again.

1. Agreement
This Service Agreement is between ${companyLine} ("${company.name}", "we"), and ${who} ("you"). We provide marketing, design and development work within the ${plan.monthlyHours} service hours a month of your ${plan.name} plan for ${money(plan.monthlyFee)} a month, billed monthly in advance through Stripe from the day your first invoice is paid. Hours are shared across all services, are not unlimited and don't carry over; extra hours are only worked with your approval at the rate shown in your dashboard, and advertising spend and third-party costs are paid separately. You provide timely information, access and approvals, and you're responsible for your products, claims and the content you supply; work is reviewed and approved in your dashboard. You own the final work once it's paid for, and each of us keeps the other's information confidential. Upgrades start immediately with a prorated charge, downgrades start at your next renewal, and cancellations, including closing your account, take effect at the end of the paid period without refunds for that period, except under our 90-day money-back guarantee, which applies to service fees if you receive no sales in your first 90 days and meet its conditions. Overdue invoices may pause your work and accrue interest of up to ${rules.monthly_interest_pct}% a month (about ${yearly}% a year, never above New York's legal limit) plus reasonable collection costs. Our total liability is limited to the fees you paid in the three months before a claim, and results such as sales or rankings aren't guaranteed. This agreement is governed by the laws of ${company.governingLaw}, and you sign it electronically with a one-time code, which has the same effect as a handwritten signature.

2. Full terms and policies
This summary is part of, and is governed by, our full Terms of Service, Subscription and Billing Terms, Collections Policy, Money-back Guarantee terms, Acceptable Use Policy, Data Processing Addendum and Privacy Policy published at ${LEGAL_URL}, as in effect on the date you sign, which are incorporated into this agreement by reference. If this summary and those policies differ, the published policies apply. We'll give you at least 30 days' notice of changes that affect your plan, and you can cancel before they take effect.` }];
}

/** Signed copy of an agreement, as stored and shown in the dashboard. */
export function signedAgreementText(doc: { title: string; body: string }, signer: { name: string; accountNumber: string; signedAt: string }) {
  return `${doc.body}\n\n---\nSigned digitally by ${signer.name} (account ${signer.accountNumber}) on ${new Date(signer.signedAt).toISOString()}.\nAgreement version ${AGREEMENT_VERSION}.`;
}
