import { describe, expect, it } from "vitest";
import { LEGAL_URL, agreementDocuments, company, parseAgreement } from "@/lib/agreements";
import { plans } from "@/lib/signup";

const client = { name: "Cal Client", company: "Cal Co", email: "cal@example.com", country: "NL", accountNumber: "1234567890" };

describe("service agreement", () => {
  const docs = agreementDocuments(plans[1], client, "2026-10-30T10:00:00Z");
  const body = docs[0]!.body;
  it("is one plain-language agreement naming both parties, the plan and the date", () => {
    expect(docs.map((d) => d.title)).toEqual(["Service Agreement"]);
    for (const t of [company.legalName, "Cal Client", "Netherlands", "1234 567 890", "October 30, 2026", "Growth"]) expect(body).toContain(t);
    expect(body).not.toMatch(/demonstration|lorem|placeholder/i);
  });
  it("discloses automatic renewal and cancellation, and incorporates the full policies by reference", () => {
    expect(body).toMatch(/renews every month at US\$499\.00/);
    expect(body).toMatch(/cancel at any time in your dashboard/);
    expect(body).toContain(LEGAL_URL);
    expect(body).toMatch(/incorporated into this agreement by reference/);
    expect(body).toMatch(/1\.24% a month/);
  });
  it("parses into tables, the renewal notice and headings for the PDF and the reader", () => {
    const blocks = parseAgreement(body);
    expect(blocks.filter((b) => b.kind === "table").length).toBe(2);
    expect(blocks.some((b) => b.kind === "notice" && b.text.startsWith("Automatic renewal"))).toBe(true);
    expect(blocks.filter((b) => b.kind === "heading").map((b) => b.kind === "heading" && b.text)).toEqual(["1. Agreement", "2. Full terms and policies"]);
  });
});
