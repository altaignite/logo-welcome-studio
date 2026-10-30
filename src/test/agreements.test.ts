import { describe, expect, it } from "vitest";
import { agreementDocuments, company, parseAgreement } from "@/lib/agreements";
import { plans } from "@/lib/signup";

const client = { name: "Cal Client", company: "Cal Co", email: "cal@example.com", country: "NL", accountNumber: "1234567890" };

describe("agreements", () => {
  const docs = agreementDocuments(plans[1], client, "2026-10-30T10:00:00Z");
  it("name both parties, the plan and the effective date in every document", () => {
    expect(docs.map((d) => d.title)).toEqual(["Client Services Agreement", "Subscription and Billing Terms", "Collections and Debt Recovery Policy", "Service and Account Policy", "Money-back Guarantee", "Data Processing Addendum", "Privacy Notice"]);
    for (const d of docs) {
      expect(d.body).toContain(company.legalName);
      expect(d.body).toContain("Cal Client");
      expect(d.body).toContain("Netherlands");
      expect(d.body).toContain("1234567890");
      expect(d.body).toContain("October 30, 2026");
      expect(d.body).not.toMatch(/demonstration|lorem|placeholder/i);
    }
  });
  it("disclose automatic renewal and how to cancel, and cover the key legal terms", () => {
    const billing = docs[1]!.body, main = docs[0]!.body;
    expect(billing).toMatch(/renews automatically every month at US\$499\.00/);
    expect(billing).toMatch(/cancel at any time in your Dashboard/);
    for (const term of ["Limitation of Liability", "Indemnification", "Confidentiality", "Force majeure", "Electronic signature", "State of New York", "Non-Solicitation"]) expect(main).toContain(term);
    expect(docs[5]!.body).toMatch(/seventy-two \(72\) hours/);
  });
  it("parse tables, notices and headings for the PDF and the reader", () => {
    const blocks = parseAgreement(docs[1]!.body);
    const tables = blocks.filter((b) => b.kind === "table");
    expect(tables[0]).toMatchObject({ kind: "table", header: ["", "Provider", "Client"] });
    expect(blocks.some((b) => b.kind === "notice" && b.text.startsWith("Automatic renewal notice"))).toBe(true);
    expect(blocks.find((b) => b.kind === "heading")).toEqual({ kind: "heading", text: "1. Plan" });
  });
});

describe("collections policy", () => {
  it("states the real stages, rates and fees", () => {
    const body = agreementDocuments(plans[0]).find((d) => d.title === "Collections and Debt Recovery Policy")!.body;
    expect(body).toContain("Day 90 after the due date");
    expect(body).toContain("1.24% per month, compounded monthly");
    expect(body).toContain("15% of the outstanding balance, with a minimum of US$40.00");
    const tables = parseAgreement(body).filter((b) => b.kind === "table");
    expect(tables.length).toBeGreaterThanOrEqual(2);
  });
});
