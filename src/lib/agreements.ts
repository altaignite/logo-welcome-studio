import { planTerms, type Plan } from "@/lib/signup";

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
export const AGREEMENT_VERSION = "2026-10-30.4";

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
    row("Address", company.address.join(", "), [c?.address, countryLabel(c?.country)].filter(Boolean).join(", ")),
    row("Contact", company.website, [c?.email, c?.phone].filter(Boolean).join(", ")),
    row("Account number", "—", c?.accountNumber),
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

/** The agreements a client signs for a plan, filled in with the client's details when known. Shown at signup and when
 * ordering, and stored server-side as the signed copy. */
export function agreementDocuments(plan: Plan, client?: AgreementClient, date?: string): { title: string; body: string }[] {
  const P = `${company.legalName}, doing business as ${company.name} ("${company.name}", "we", "us" or "our")`;
  const who = client ? `${client.name}${client.company ? `, on behalf of ${client.company}` : ""}` : "the client identified above";
  const parties = partiesTable(client, date);
  const law = `governed by the laws of ${company.governingLaw}, without regard to its conflict-of-laws rules`;
  return [
    { title: "Client Services Agreement", body: `${parties}

This Client Services Agreement (the "Agreement") is entered into between ${P}, ${companyLine}, and ${who} (the "Client", "you" or "your"). By signing electronically, the Client confirms that it has read and agrees to this Agreement and that the person signing is authorised to bind the Client.

${planTable(plan)}

1. Definitions
"Services" means the marketing, design and development services described in Section 2. "Plan" means the subscription plan selected by the Client. "Service Hours" means the hours of work included in the Plan each calendar month. "Deliverables" means the work product created for the Client under this Agreement. "Client Materials" means content, data, trademarks, credentials and other materials supplied by the Client. "Dashboard" means the Client's online account. "Order" means each Plan purchased under this Agreement, whether at signup or later.

2. Scope of Services
2.1 We will provide marketing, design and development Services within the Service Hours of the Plan, scheduled and prioritised with the Client through the Dashboard.
2.2 We determine the method, personnel and tools used to perform the Services and will act in a professional and workmanlike manner consistent with generally accepted industry standards.
2.3 The Services are not unlimited. Work outside the Plan, including new projects, rush requests, or work requiring specialist licences or third-party approvals, is quoted separately and performed only on the Client's written approval.
2.4 We may use subcontractors and software tools, including automation and artificial-intelligence tools, to perform the Services. We remain responsible for their work under this Agreement.

3. Onboarding and Service Hours
3.1 The Services begin once the first invoice is paid and the Client completes the onboarding brief.
3.2 Time is recorded in increments of fifteen (15) minutes against the work performed and is visible in the Dashboard.
3.3 Unused Service Hours expire at the end of each calendar month, do not carry over and have no cash value.
3.4 Work beyond the monthly allowance is performed only with the Client's prior approval in the Dashboard and is billed at the extra-hour rate shown at the time of approval.

4. Client Responsibilities
4.1 The Client will provide accurate information, timely feedback and approvals, Client Materials, and the access to accounts, platforms and systems reasonably required.
4.2 The Client will respond to requests within five (5) business days. Delivery dates move to the extent of any delay by the Client, and Service Hours are not extended for such delays.
4.3 The Client is responsible for the security of its own accounts and credentials and will share credentials only through the Dashboard or another secure method we provide.
4.4 The Client warrants that the Client Materials are owned by it or properly licensed, are accurate, and do not infringe the intellectual property, privacy, publicity or other rights of any person.

5. Compliance and Approvals
5.1 The Client is responsible for the products and services it sells and for the claims made about them. The Client will review and approve all advertising, offers, claims, testimonials and public content before publication.
5.2 The Client is responsible for compliance with laws applying to its business and marketing, including consumer-protection and advertising laws, the FTC Endorsement Guides, the CAN-SPAM Act, the Telephone Consumer Protection Act, and privacy and cookie laws, and for obtaining any consents required from its own customers.
5.3 We may decline or stop any work that we reasonably believe is unlawful, misleading, infringing, or in breach of a platform's policies.

6. Third-Party Platforms and Costs
6.1 Advertising spend, software subscriptions, stock media, fonts, domains, hosting and other third-party costs are not included in the Plan. They are paid directly by the Client or, if agreed in writing, re-invoiced at cost.
6.2 Advertising and social media accounts are created in, or transferred to, the Client's name and remain the Client's property. We access them as an authorised user.
6.3 Third-party platforms are governed by their own terms. We are not responsible for platform outages, policy changes, account restrictions, rejected ads or algorithm changes.

7. Review and Acceptance
Deliverables are submitted for review in the Dashboard. The Client may approve a Deliverable or request reasonable changes within the Service Hours. A Deliverable is accepted when the Client approves it, uses it in its business, or does not respond within ten (10) business days of submission.

8. Intellectual Property
8.1 The Client retains all rights in the Client Materials and grants us a non-exclusive licence to use them only to perform the Services.
8.2 Upon payment in full of all amounts due for the related period, we assign to the Client all right, title and interest in the final Deliverables created specifically for the Client, excluding Provider Materials and third-party materials.
8.3 We retain ownership of our pre-existing and generally applicable materials, tools, templates, code libraries, processes and know-how ("Provider Materials"). To the extent Provider Materials are incorporated into a Deliverable, we grant the Client a non-exclusive, perpetual, worldwide, royalty-free licence to use them as part of that Deliverable.
8.4 Third-party materials such as stock media, fonts and plug-ins are licensed on their own terms, which the Client agrees to follow.
8.5 Drafts, concepts and unused work remain our property. Unless the Client objects in writing, we may display non-confidential Deliverables and the Client's name and logo in our portfolio.

9. Confidentiality
9.1 Each party will keep confidential all non-public business, technical and financial information received from the other party, use it only to perform this Agreement, and protect it with at least reasonable care.
9.2 This does not apply to information that is or becomes public through no fault of the recipient, was lawfully known to it beforehand, is independently developed, or must be disclosed by law, in which case the recipient will give prompt notice where lawful.
9.3 These obligations continue for three (3) years after termination, and indefinitely for trade secrets and credentials.

10. Data Protection
Personal information about the Client is handled under our Privacy Notice. Where we process personal information of the Client's own customers on its behalf, the Data Processing Addendum applies.

11. Non-Solicitation
During the term and for twelve (12) months afterwards, neither party will directly solicit for employment or engagement any employee or contractor of the other who was involved in the Services, without the other party's written consent. General advertisements are not solicitation.

12. Warranties and Disclaimers
12.1 Each party warrants that it has the authority to enter into this Agreement.
12.2 Marketing results depend on factors outside our control. Except for the Money-back Guarantee, we do not promise any particular sales, revenue, traffic, rankings, leads, return on advertising spend or other outcome.
12.3 EXCEPT AS EXPRESSLY STATED IN THIS AGREEMENT, THE SERVICES AND DELIVERABLES ARE PROVIDED "AS IS", AND WE DISCLAIM ALL OTHER WARRANTIES, EXPRESS OR IMPLIED, INCLUDING MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, NON-INFRINGEMENT AND UNINTERRUPTED OR ERROR-FREE OPERATION.

13. Limitation of Liability
13.1 TO THE FULLEST EXTENT PERMITTED BY LAW, OUR TOTAL AGGREGATE LIABILITY ARISING OUT OF OR RELATING TO THIS AGREEMENT WILL NOT EXCEED THE SERVICE FEES PAID BY THE CLIENT UNDER THIS AGREEMENT IN THE THREE (3) MONTHS BEFORE THE EVENT GIVING RISE TO THE CLAIM.
13.2 NEITHER PARTY IS LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, EXEMPLARY OR PUNITIVE DAMAGES, OR FOR LOST PROFITS, REVENUE, DATA OR GOODWILL, EVEN IF ADVISED OF THEIR POSSIBILITY.
13.3 These limits do not apply to the Client's payment obligations, either party's indemnification obligations, or liability that cannot be limited by law, including for fraud, gross negligence or wilful misconduct.

14. Indemnification
14.1 The Client will defend, indemnify and hold harmless us and our members, officers, employees and contractors from any third-party claim, loss or expense (including reasonable attorneys' fees) arising from the Client Materials, the Client's products, services or claims, the Client's breach of Section 4 or 5, or the Client's violation of law.
14.2 We will defend and indemnify the Client from any third-party claim that a final Deliverable, as delivered by us and excluding Client Materials, third-party materials and modifications by others, infringes that third party's United States copyright.
14.3 The indemnified party must give prompt notice of the claim, allow the indemnifying party to control the defence, and cooperate reasonably. No settlement imposing obligations on the indemnified party may be made without its consent.

15. Term, Renewal and Cancellation
15.1 This Agreement starts on the effective date and continues for as long as the Client holds an active Order.
15.2 Each Order automatically renews monthly until cancelled, as set out in the Subscription and Billing Terms.
15.3 The Client may cancel an Order at any time in the Dashboard or by written notice. Cancellation takes effect at the end of the current billing period.

16. Suspension and Termination
16.1 We may suspend the Services, projects and Dashboard access while any invoice is past due, or immediately if continuing would breach law or a platform's policies, and will restore them once the issue is resolved.
16.2 Either party may terminate this Agreement by written notice if the other party materially breaches it and fails to cure the breach within fourteen (14) days of notice, or becomes insolvent, makes an assignment for the benefit of creditors or becomes subject to bankruptcy proceedings.
16.3 On termination: all amounts due become payable; licences under Section 8 continue for Deliverables that have been paid for; we will return the Client's credentials and, on request within thirty (30) days, provide available final Deliverables; and each party will return or destroy the other's confidential information, except copies retained by law.
16.4 Sections 8, 9, 11 to 14, 16.3, 17 and 18 survive termination.

17. Disputes
17.1 The parties will first try to resolve any dispute through good-faith discussions between senior representatives for thirty (30) days after written notice of the dispute.
17.2 This Agreement is ${law}. Each party submits to the exclusive jurisdiction of ${company.venue}, except that either party may bring an individual claim in small-claims court or seek urgent injunctive relief in any competent court.
17.3 To the extent permitted by law, each party waives any right to a jury trial and agrees that claims will be brought only in an individual capacity and not as a plaintiff or class member in any class or representative proceeding.
17.4 Any claim must be brought within one (1) year after it arises, unless a longer period is required by law.

18. General
18.1 Electronic signature. The parties agree that this Agreement and each Order may be signed electronically and that an electronic signature, including the Client's entry of a one-time confirmation code, has the same legal effect as a handwritten signature under the federal ESIGN Act and the New York Electronic Signatures and Records Act.
18.2 Notices. Notices to the Client may be given through the Dashboard or by email to the address on its account. Notices to us must be sent through the Dashboard support section or to our address above. Notices are effective on receipt.
18.3 Order of precedence. This Agreement, the Subscription and Billing Terms, the Money-back Guarantee, the Data Processing Addendum and the Privacy Notice form the entire agreement between the parties and supersede all prior discussions. If they conflict, this Agreement prevails, except that the Data Processing Addendum prevails on data protection.
18.4 Changes. We may update these documents for future Orders or renewals with at least thirty (30) days' notice. If the Client does not agree, it may cancel before the change takes effect. Other amendments must be in writing, including acceptance in the Dashboard.
18.5 Assignment. The Client may not assign this Agreement without our written consent. We may assign it to an affiliate or a successor to our business.
18.6 Relationship. The parties are independent contractors. Nothing creates a partnership, joint venture, agency or employment relationship.
18.7 Force majeure. Neither party is liable for a delay or failure, other than a payment obligation, caused by events beyond its reasonable control, including natural disasters, epidemics, war, terrorism, labour disputes, government action, and failures of utilities, networks or third-party platforms.
18.8 Compliance. Each party will comply with applicable anti-corruption, export-control and sanctions laws.
18.9 Severability and waiver. If any provision is held unenforceable, it will be enforced to the maximum extent permitted and the remainder stays in effect. A failure or delay in enforcing a provision is not a waiver.
18.10 Headings and counterparts. Headings are for convenience only. This Agreement may be executed in counterparts and in electronic form.` },
    { title: "Subscription and Billing Terms", body: `${parties}

These Subscription and Billing Terms (the "Terms") form part of the Client Services Agreement between ${P} and ${who}.

${planTable(plan)}

! Automatic renewal notice: Your subscription renews automatically every month at ${money(plan.monthlyFee)} plus applicable taxes, charged to your payment method on file, until you cancel. You can cancel at any time in your Dashboard, or by contacting support; cancellation takes effect at the end of the current billing period and you will not be charged again.

1. Plan
${planTerms(plan)}

2. Billing and Automatic Renewal
2.1 The subscription is billed monthly in advance through our payment processor, Stripe, Inc. The first invoice is issued when the Client's application or Order is approved, and the Plan starts when that invoice is paid.
2.2 Each billing period lasts one month from the start date. The subscription renews automatically for successive monthly periods, and the renewal invoice is issued at the start of each period.
2.3 We will send a confirmation of these Terms, including the automatic renewal terms and how to cancel, to the Client's email address. We will notify the Client at least thirty (30) days before any change to the price or renewal terms.

3. Payment
3.1 Invoices are payable in US dollars by the due date shown on the invoice.
3.2 The Client authorises us and Stripe to charge the payment method on file for each invoice when due, and to retry a failed charge. The Client will keep its payment details current.
3.3 Fees exclude sales, use, value-added, goods and services and similar taxes, which are added where required by law. Each party is responsible for its own income taxes.
3.4 If the Client is required to withhold any tax, it will gross up the payment so that we receive the full invoiced amount.

4. Late Payment and Collection
4.1 An invoice not paid by its due date is past due, and the Client's Plan becomes past due.
4.2 Past-due amounts accrue interest from the due date until paid at the rate set out in our billing policy and shown on the overdue invoice, but never more than the maximum rate permitted by applicable law. Reasonable administration and collection fees may also be charged as shown on the overdue invoice.
4.3 If an invoice remains unpaid, we may suspend the Services, projects and Dashboard access, pause collection of the subscription, and refer the debt to a collection agency or legal counsel. The Client is responsible for reasonable costs of collection, including attorneys' fees and court costs, to the extent permitted by law.
4.4 Services resume when the balance is paid in full. Suspension does not extend the billing period or the Service Hours.

5. Plan Changes and Extra Hours
5.1 Upgrades take effect immediately, and the Client pays the prorated difference for the current period.
5.2 Downgrades take effect at the next renewal, so the Client keeps the current period's Service Hours.
5.3 Approved extra hours are billed on a separate invoice at the extra-hour rate shown at approval.

6. Cancellation and Refunds
6.1 The Client may cancel at any time in the Dashboard or by written notice. Cancellation takes effect at the end of the current billing period, and no further renewal charges will be made.
6.2 Fees already paid are non-refundable, and partial months are not credited, except as provided in the Money-back Guarantee or where required by law.
6.3 Approved refunds are returned to the original payment method within ten (10) business days.

7. Invoice Disputes and Chargebacks
7.1 The Client must notify us of any disputed charge in writing within thirty (30) days of the invoice date, stating the reasons. The parties will work in good faith to resolve it, and the Client will pay any undisputed portion when due.
7.2 The Client agrees to contact us before initiating a chargeback. If a chargeback is filed for an amount that is properly due, we may suspend the Services and recover the amount and any chargeback fees.

8. Records
Invoices, payments and receipts are available in the Dashboard and from Stripe. Our records of Service Hours and charges are presumed accurate unless shown otherwise.

9. Governing Law
These Terms are ${law}, and Section 17 of the Client Services Agreement applies to any dispute.` },
    { title: "Money-back Guarantee", body: `${parties}

This Money-back Guarantee (the "Guarantee") forms part of the Client Services Agreement between ${P} and ${who}.

|| Term | Detail
| Guarantee period | The first 90 days after the Plan starts
| Claim window | Days 91 to 120 after the Plan starts
| Refund amount | Service fees paid for the first 90 days
| Not covered | Advertising spend, third-party costs, extra hours, taxes
| How to claim | Subscription page of the Dashboard

1. Guarantee
If the Client's business receives no Sales during the Guarantee period, the Client may request a refund of the service fees paid for that period. "Sale" means any order, purchase, paid booking, signed contract or other revenue-generating transaction from any channel during the Guarantee period, whether or not attributed to the Services.

2. Eligibility Conditions
All of the following must be met:
2.1 every invoice on the Plan was paid on time, with no failed, late or disputed payments and no chargebacks;
2.2 no invoice on the Plan was voided or written off, and the Plan was not paused or suspended during the Guarantee period;
2.3 the Client completed onboarding, provided the information, access and approvals we requested within the times in the Client Services Agreement, and allowed the Deliverables we prepared to be published or launched;
2.4 advertising campaigns we recommended were funded at the budget agreed with the Client; and
2.5 the Client certifies in writing that no Sales were received during the Guarantee period.

3. How to Claim
The Client must submit the claim through the Dashboard during the claim window. Claims submitted outside the claim window are not eligible.

4. Verification
We may request reasonable evidence to verify a claim, such as sales, payment-processor, bookkeeping or platform reports for the Guarantee period. We will respond within ten (10) business days after receiving the evidence. A claim that is incomplete, inaccurate or unsupported may be refused, and a refund paid on an inaccurate claim must be repaid.

5. Refund
Approved refunds are paid to the original payment method within ten (10) business days of approval. When the refund is paid, the Plan and the related Services end, and licences to Deliverables from the Guarantee period end unless the Client pays for them.

6. Limits
The Guarantee applies once per Client and to its first Plan only. It is not available for Orders placed after a previous refund, and it does not limit any rights the Client has under law.` },
    { title: "Data Processing Addendum", body: `${parties}

This Data Processing Addendum (the "DPA") forms part of the Client Services Agreement between ${P} (the "Processor") and ${who} (the "Controller"), and applies when we process Personal Data on the Client's behalf.

|| Item | Detail
| Subject matter | Performing the Services under the Client Services Agreement
| Duration | The term of the Agreement and any return or deletion period
| Nature and purpose | Hosting, analysing and using data in campaigns, websites, email and reporting
| Categories of data | Contact, account, order, behavioural and marketing-preference data
| Data subjects | The Client's customers, prospects, website visitors and staff
| Sensitive data | Not processed unless agreed in writing

1. Definitions
"Personal Data", "processing", "controller", "processor" and "data subject" have the meanings given in applicable data protection laws, including the EU and UK General Data Protection Regulation and the California Consumer Privacy Act as amended (the "Data Protection Laws").

2. Roles and Instructions
2.1 The Client is the controller, or a service provider's business, of the Personal Data, and we are its processor or service provider.
2.2 We process Personal Data only on the Client's documented instructions, which are the Agreement, the Dashboard settings and written requests, unless required by law. We will tell the Client if we believe an instruction breaches Data Protection Laws.
2.3 We will not sell or share the Personal Data, retain, use or disclose it for any purpose other than the Services, or combine it with other data except as permitted by law.

3. Client Obligations
The Client confirms that it has a lawful basis for the processing, has given all required notices, and has obtained all required consents, including for email and SMS marketing and for cookies and tracking on its websites.

4. Confidentiality and Security
4.1 Our personnel who process Personal Data are bound by confidentiality.
4.2 We maintain appropriate technical and organisational measures, including access controls, encryption in transit, two-factor authentication for staff, logging and least-privilege access.

5. Sub-processors
The Client authorises our use of sub-processors, including providers of hosting, databases, email delivery, payments and analytics. We bind each sub-processor to data protection terms at least as protective as this DPA and remain responsible for it. We will give notice of new sub-processors, and the Client may object on reasonable grounds within fourteen (14) days.

6. Assistance
Taking into account the nature of the processing, we will help the Client respond to data subject requests and with security, breach notification, data protection impact assessments and consultations with authorities, at the Client's reasonable cost for work beyond the Service Hours.

7. Personal Data Breach
We will notify the Client without undue delay, and in any event within seventy-two (72) hours, after becoming aware of a breach affecting the Personal Data, and provide the information reasonably available to help the Client meet its obligations.

8. International Transfers
Where Personal Data is transferred from the European Economic Area, the United Kingdom or Switzerland to a country without an adequacy decision, the parties agree to the applicable Standard Contractual Clauses or UK Addendum, which are incorporated by reference.

9. Return and Deletion
On termination, we will, at the Client's choice, return or delete the Personal Data within thirty (30) days, unless retention is required by law.

10. Audits
We will make available information reasonably necessary to demonstrate compliance with this DPA and allow reasonable audits, no more than once a year, on thirty (30) days' notice, during business hours and subject to confidentiality.

11. Liability
Liability under this DPA is subject to the limitations in the Client Services Agreement, except where Data Protection Laws do not permit them.` },
    { title: "Privacy Notice", body: `${parties}

This Privacy Notice explains how ${P}, ${companyLine}, collects, uses and protects the personal information of ${who} and the people who use the Client's account.

|| Purpose | Information used | Legal basis (where GDPR applies)
| Providing and billing the Services | Identity, contact, account, billing and order data | Performance of a contract
| Securing the account | Sign-in times, IP address, approximate location, device | Legitimate interests
| Customer support and communications | Messages, tickets, contact preferences | Contract; legitimate interests
| Marketing (optional) | Email, phone and preferences | Consent, which can be withdrawn
| Legal, tax and accounting | Invoices, payments, signed agreements | Legal obligation

1. Who We Are
${company.legalName}, doing business as ${company.name}, is the controller of the personal information described here. Contact us through the support section of your Dashboard or at ${company.address.join(", ")}.

2. Information We Collect
Information you provide (name, business name, email, phone, country, address, account details, onboarding answers, files and messages), payment information processed by Stripe (we do not store full card numbers), and information collected automatically when you use the Dashboard (sign-in events, IP address, approximate location, device and browser details, and essential cookies).

3. How We Share It
With service providers who help us operate, including Stripe for payments and our hosting, database, email and analytics providers, under contracts that limit their use of it; with professional advisers; with authorities when required by law; and with a successor in a merger or acquisition. We do not sell personal information, and we do not share it for cross-context behavioural advertising.

4. International Transfers
We are based in the United States. Where personal information is transferred from the EEA, the UK or Switzerland, we rely on the Standard Contractual Clauses or another lawful transfer mechanism.

5. Retention
We keep personal information while your account is open and afterwards only as long as needed for the purposes above. Invoices, payments, tax records and signed agreements are kept for at least seven (7) years, or longer where the law requires.

6. Your Rights
Depending on where you live, you may have the right to access, correct, delete or receive a copy of your personal information, to object to or restrict certain processing, to withdraw consent, and to complain to a data protection authority. California residents have the right to know, delete and correct, to opt out of sale or sharing (we do neither), to limit use of sensitive information (we do not collect it for that purpose), and not to be discriminated against for exercising these rights.

7. How to Exercise Your Rights
Use the privacy section of your Dashboard. We will verify your identity before acting and respond within the time required by law, generally thirty (30) days under the GDPR and forty-five (45) days under California law. You may use an authorised agent, who must provide proof of authorisation.

8. Marketing
We send marketing emails and text messages only with your consent. You can opt out at any time using the unsubscribe link, by replying STOP to texts, or in your Dashboard. Service messages about your account will still be sent.

9. Security
We use access controls, encryption in transit, two-factor authentication and monitoring to protect personal information. No system is completely secure; we will notify you and the authorities of a breach as required by law.

10. Children
The Services are for businesses and are not directed to anyone under sixteen (16). We do not knowingly collect their personal information.

11. Changes
We will post updates in the Dashboard and notify you of material changes before they take effect.` },
  ];
}

/** Signed copy of an agreement, as stored and shown in the dashboard. */
export function signedAgreementText(doc: { title: string; body: string }, signer: { name: string; accountNumber: string; signedAt: string }) {
  return `${doc.body}\n\n---\nSigned digitally by ${signer.name} (account ${signer.accountNumber}) on ${new Date(signer.signedAt).toISOString()}.\nAgreement version ${AGREEMENT_VERSION}.`;
}
