import { describe, expect, it } from "vitest";
import { agreementDocuments, company, parseAgreement } from "@/lib/agreements";
import { plans } from "@/lib/signup";

const client = { name: "Cal Client", company: "Cal Co", email: "cal@example.com", country: "NL", accountNumber: "1234567890" };

describe("agreements", () => {
  const docs = agreementDocuments(plans[1], client, "2026-10-30T10:00:00Z");
  it("name both parties, the plan and the effective date in every document", () => {
    expect(docs.map((d) => d.title)).toEqual(["Client Services Agreement", "Subscription and Billing Terms", "Money-back Guarantee", "Data Processing Addendum", "Privacy Notice"]);
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
    expect(docs[3]!.body).toMatch(/seventy-two \(72\) hours/);
  });
  it("parse tables, notices and headings for the PDF and the reader", () => {
    const blocks = parseAgreement(docs[1]!.body);
    const tables = blocks.filter((b) => b.kind === "table");
    expect(tables[0]).toMatchObject({ kind: "table", header: ["", "Provider", "Client"] });
    expect(blocks.some((b) => b.kind === "notice" && b.text.startsWith("Automatic renewal notice"))).toBe(true);
    expect(blocks.find((b) => b.kind === "heading")).toEqual({ kind: "heading", text: "1. Plan" });
  });
});
