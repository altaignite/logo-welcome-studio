import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { canTransition, clientResponse, clientVisibleStatuses, deletableTables } from "@/lib/admin";
import { guaranteeClaimable, guaranteeClaimSchema, profileUpdateSchema } from "@/lib/client";
import { allowedMimeTypes, MAX_FILE_BYTES, safeFileName, storagePath, uploadIssue } from "@/lib/files";
import { countSince, hoursUse, monthlyRecurring, receivables, renewingWithin, revenueByMonth } from "@/lib/insights";
import { emailDecision, escapeHtml, renderEmail, safeLink, undeliverable } from "@/lib/notifications";
import { briefQuestions, briefSchema, missingAnswers, onboardingSteps } from "@/lib/onboarding";
import { anonymisedProfile, deletionBlockers, omit } from "@/lib/privacy";
import { agreementDocuments, plans, planTerms, signedAgreementText, AGREEMENT_VERSION } from "@/lib/signup";
import { leavesAnOwner, levelGrants, staffLevelGrants, staffLevels, staffPerms } from "@/lib/staff";
import { replyDueAt, slaState } from "@/lib/support";
import { messageRecipient, renderTemplate, unknownPlaceholders } from "@/lib/templates";
import { canReview, hoursByMonth, metricsText, parseMetrics, reviewDecision } from "@/lib/work";

const sql = readFileSync("drizzle/migrations/0011_client_admin_flow_gaps.sql", "utf8");

describe("staff permission levels", () => {
  it("match public.level_grants in the migration", () => {
    const body = sql.slice(sql.indexOf("FUNCTION public.level_grants"), sql.indexOf("$$;", sql.indexOf("FUNCTION public.level_grants")));
    const fromSql = (level: string, perm: string) => {
      if (level === "owner") return /_level = 'owner'/.test(body);
      const m = new RegExp(`_level = '${level}' AND _perm (?:IN \\(([^)]*)\\)|= '(\\w+)')`).exec(body);
      if (!m) return false;
      return (m[1] ?? `'${m[2]}'`).split(",").map((s) => s.trim().replaceAll("'", "")).includes(perm);
    };
    for (const level of staffLevels) for (const perm of staffPerms) expect([level, perm, levelGrants(level, perm)]).toEqual([level, perm, fromSql(level, perm)]);
  });
  it("lets only owners manage staff and viewers change nothing", () => {
    expect(staffLevelGrants.owner).toContain("staff");
    expect(staffLevels.filter((l) => levelGrants(l, "staff"))).toEqual(["owner"]);
    expect(staffLevelGrants.viewer).toEqual([]);
    expect(levelGrants(null, "work")).toBe(false);
    expect(levelGrants("superuser", "work")).toBe(false);
  });
  it("always keeps an owner", () => {
    const staff = [{ user_id: "a", level: "owner" }, { user_id: "b", level: "manager" }];
    expect(leavesAnOwner(staff, { userId: "a", level: "manager" })).toBe(false);
    expect(leavesAnOwner(staff, { userId: "a", level: null })).toBe(false);
    expect(leavesAnOwner(staff, { userId: "b", level: "owner" })).toBe(true);
  });
});

describe("two-factor sessions", () => {
  it("cover every table signed-in users can reach", () => {
    const all = readdirSync("drizzle/migrations").filter((f) => f.endsWith(".sql")).map((f) => readFileSync(`drizzle/migrations/${f}`, "utf8")).join("\n");
    const rls = new Set([...all.matchAll(/ALTER TABLE public\.(\w+) ENABLE ROW LEVEL SECURITY/gi)].map((m) => m[1]!));
    // Service-role only tables: no grants to signed-in users.
    for (const t of ["stripe_events", "job_runs", "rate_limit_hits", "app_secrets"]) rls.delete(t);
    // Tables named in every restrictive "two-factor session" loop across the migrations.
    const covered = new Set<string>();
    for (const m of all.matchAll(/FOREACH t IN ARRAY ARRAY\[([^\]]*)\] LOOP\s*EXECUTE format\('CREATE POLICY "two-factor session"/g)) for (const t of m[1]!.matchAll(/'(\w+)'/g)) covered.add(t[1]!);
    expect(covered.size).toBeGreaterThan(20);
    expect([...rls].filter((t) => !covered.has(t))).toEqual([]);
  });
});

describe("application timeline shared with clients", () => {
  it("matches the statuses the database shares", () => {
    const m = /shared boolean := NEW\.to_status IS NOT NULL AND NEW\.to_status::text IN \(([^)]*)\)/.exec(sql);
    expect(m?.[1]?.split(",").map((s) => s.trim().replaceAll("'", "")).sort()).toEqual([...clientVisibleStatuses].sort());
  });
  it("sends a client reply back to review, a step staff can also take", () => {
    expect(canTransition(clientResponse.from, clientResponse.to)).toBe(true);
  });
  it("lets templates be deleted but never financial records", () => {
    expect(deletableTables).toContain("message_templates");
    expect(deletableTables).not.toContain("documents" as never);
  });
});

describe("notification emails", () => {
  it("escape everything from the database", () => {
    const e = renderEmail({ title: "<script>x</script>", body: "Tom & \"Jerry\"", link: "/dashboard/ticket/1" }, "https://app.example.com/");
    expect(e.html).not.toContain("<script>");
    expect(e.html).toContain("&lt;script&gt;");
    expect(e.html).toContain("Tom &amp; &quot;Jerry&quot;");
    expect(e.html).toContain('href="https://app.example.com/dashboard/ticket/1"');
    expect(e.text).toContain("Open: https://app.example.com/dashboard/ticket/1");
    expect(escapeHtml("'")).toBe("&#39;");
  });
  it("only link to in-app paths", () => {
    expect(safeLink("/dashboard")).toBe("/dashboard");
    for (const bad of ["//evil.com", "https://evil.com", "javascript:alert(1)", "/", "", null]) expect(safeLink(bad)).toBeNull();
    expect(renderEmail({ title: "t", body: null, link: "//evil.com" }, "https://a.b").html).not.toContain("href");
  });
  it("send, wait or drop pending emails", () => {
    const now = new Date("2026-10-29T12:00:00Z");
    const n = { email_to: "c@example.com", email_attempts: 0, created_at: "2026-10-29T11:00:00Z" };
    expect(emailDecision(n, true, now)).toBe("send");
    expect(emailDecision(n, false, now)).toBe("wait");
    expect(emailDecision({ ...n, email_attempts: 5 }, true, now)).toBe("skip");
    expect(emailDecision({ ...n, created_at: "2026-10-20T00:00:00Z" }, true, now)).toBe("skip");
    expect(emailDecision({ ...n, email_to: "deleted-1@deleted.invalid" }, true, now)).toBe("skip");
    expect(undeliverable("no-at-sign")).toBe(true);
  });
});

describe("support response times", () => {
  const base = { status: "open", priority: "high", created_at: "2026-10-29T08:00:00Z", first_response_at: null };
  it("owes a first reply within the priority target", () => {
    expect(replyDueAt(base)?.toISOString()).toBe("2026-10-29T16:00:00.000Z");
    expect(slaState(base, new Date("2026-10-29T09:00:00Z"))).toBe("on_track");
    expect(slaState(base, new Date("2026-10-29T15:00:00Z"))).toBe("due_soon");
    expect(slaState(base, new Date("2026-10-29T17:00:00Z"))).toBe("breached");
  });
  it("restarts the clock when the client writes again", () => {
    const t = { ...base, first_response_at: "2026-10-29T09:00:00Z", last_staff_message_at: "2026-10-29T09:00:00Z", last_client_message_at: "2026-10-30T09:00:00Z" };
    expect(replyDueAt(t)?.toISOString()).toBe("2026-10-30T17:00:00.000Z");
    expect(slaState({ ...t, last_client_message_at: "2026-10-29T08:30:00Z" })).toBe("met");
  });
  it("stops while waiting on the client or closed", () => {
    expect(replyDueAt({ ...base, status: "waiting_on_client" })).toBeNull();
    expect(slaState({ ...base, status: "closed" })).toBe("none");
  });
});

describe("onboarding", () => {
  it("validates brief answers", () => {
    expect(briefSchema.safeParse({ website: "https://cal.co" }).success).toBe(true);
    expect(briefSchema.safeParse({ website: "cal" }).success).toBe(false);
    expect(briefSchema.safeParse({ ad_budget: "A million" }).success).toBe(false);
    expect(briefSchema.safeParse({ unknown_question: "x" }).success).toBe(false);
    expect(briefSchema.safeParse({ business_summary: "x".repeat(2001) }).success).toBe(false);
    expect(missingAnswers({})).toHaveLength(briefQuestions.filter((q) => q.required).length);
  });
  it("walks the client through review, payment, details and brief", () => {
    const d = { apps: [{ id: "a", status: "in_review" }], subs: [{ status: "pending", started_at: null }], invoices: [], profile: null, brief: null };
    expect(onboardingSteps(d).map((s) => s.state)).toEqual(["done", "current", "todo", "todo", "todo"]);
    const info = onboardingSteps({ ...d, apps: [{ id: "a", status: "info_requested" }] });
    expect(info[1]?.title).toBe("Reply to our question");
    const paid = onboardingSteps({ ...d, apps: [{ id: "a", status: "approved" }], subs: [{ status: "active", started_at: "2026-10-01" }] });
    expect(paid.map((s) => s.state)).toEqual(["done", "done", "done", "current", "todo"]);
  });
});

describe("message templates", () => {
  it("fills known placeholders and flags unknown ones", () => {
    expect(renderTemplate("Hi {{ first_name }}, plan {{plan}} {{oops}}", { first_name: "Cal", plan: "Growth" })).toBe("Hi Cal, plan Growth {{oops}}");
    expect(unknownPlaceholders("{{first_name}} {{oops}} {{oops}}")).toEqual(["oops"]);
  });
  it("respects marketing consent and closed accounts", () => {
    const p = { status: "active", marketing_opt_in: false, email: "c@example.com" };
    expect(messageRecipient(p, "service")).toBeNull();
    expect(messageRecipient(p, "marketing")).toBe("Not opted in to marketing");
    expect(messageRecipient({ ...p, status: "closed" }, "service")).toBe("Account closed");
  });
});

describe("admin overview", () => {
  const now = new Date("2026-10-29T12:00:00Z");
  const subs = [
    { status: "active", monthly_fee: 499, monthly_hours: 15, hours_used: 16, renews_at: "2026-11-02T00:00:00Z" },
    { status: "active", monthly_fee: "199", monthly_hours: 5, hours_used: 1, renews_at: "2026-12-01T00:00:00Z" },
    { status: "paused", monthly_fee: 999, monthly_hours: 35, hours_used: 0, renews_at: null },
  ];
  it("sums recurring fees and hours on active plans", () => {
    expect(monthlyRecurring(subs)).toBe(698);
    expect(hoursUse(subs)).toEqual({ used: 17, allowance: 20, over: 1 });
    expect(renewingWithin(subs, 7, now)).toHaveLength(1);
  });
  it("splits receivables into overdue and collections", () => {
    const r = receivables([
      { status: "open", amount: 100, due_at: "2026-11-05", kind: "first" },
      { status: "overdue", amount: 200, interest_accrued: 10, fees_accrued: 40, due_at: "2026-08-01", collection_stage: "legal" },
      { status: "paid", amount: 999, due_at: "2026-01-01" },
    ], now);
    expect(r).toEqual({ outstanding: 350, overdue: 250, overdueCount: 1, collections: 250, collectionsCount: 1, firstUnpaid: 1 });
  });
  it("buckets completed payments by month", () => {
    const m = revenueByMonth([
      { amount: 499, status: "completed", created_at: "2026-10-03T00:00:00Z" },
      { amount: -100, status: "completed", created_at: "2026-10-20T00:00:00Z" },
      { amount: 199, status: "failed", created_at: "2026-09-01T00:00:00Z" },
      { amount: 199, status: "completed", created_at: "2025-01-01T00:00:00Z" },
    ], 3, now);
    expect(m.map((x) => [x.month, x.total])).toEqual([["2026-08", 0], ["2026-09", 0], ["2026-10", 399]]);
    expect(countSince([{ created_at: "2026-10-20T00:00:00Z" }, { created_at: "2026-01-01T00:00:00Z" }], 30, now)).toBe(1);
  });
});

describe("files", () => {
  it("keep the bucket limits Lovable can't set in a migration", () => {
    // The bucket is created on first upload by ensureBucket in documents.server.ts with these limits.
    expect(MAX_FILE_BYTES).toBe(25 * 1024 * 1024);
    expect(allowedMimeTypes).not.toContain("text/html");
    expect(allowedMimeTypes).not.toContain("image/svg+xml");
  });
  it("reject unsafe uploads and keep objects in the client's folder", () => {
    expect(uploadIssue({ name: "a.pdf", size: 10, type: "application/pdf" })).toBeNull();
    expect(uploadIssue({ name: "a.html", size: 10, type: "text/html" })).toMatch(/isn't supported/);
    expect(uploadIssue({ name: "a.svg", size: 10, type: "image/svg+xml" })).toMatch(/isn't supported/);
    expect(uploadIssue({ name: "a.pdf", size: MAX_FILE_BYTES + 1, type: "application/pdf" })).toMatch(/25 MB/);
    expect(safeFileName("../../etc/pass wd.pdf")).toBe("etc-pass-wd.pdf");
    expect(storagePath("u1", "uploads", "f1", "../x.pdf")).toBe("u1/uploads/f1-x.pdf");
  });
});

describe("privacy requests", () => {
  it("block closure while money or plans are outstanding", () => {
    expect(deletionBlockers({ legal_hold: false, invoices: [{ status: "paid" }], subs: [{ status: "cancelled" }] })).toEqual([]);
    expect(deletionBlockers({ legal_hold: true, invoices: [{ status: "overdue" }], subs: [{ status: "active" }] })).toHaveLength(3);
  });
  it("anonymise personal details but keep the account number", () => {
    const p = anonymisedProfile("1234567890", new Date("2026-10-29T00:00:00Z"));
    expect(p.email).toBe("deleted-1234567890@deleted.invalid");
    expect(undeliverable(p.email)).toBe(true);
    expect(p.phone).toBeNull();
    expect(p.status).toBe("closed");
    expect(omit({ a: 1, b: 2 }, ["b"])).toEqual({ a: 1 });
  });
});

describe("deliverables, reports and hours", () => {
  it("require feedback when asking for changes", () => {
    const id = "00000000-0000-4000-8000-000000000000";
    expect(reviewDecision.safeParse({ deliverableId: id, decision: "approved" }).success).toBe(true);
    expect(reviewDecision.safeParse({ deliverableId: id, decision: "changes_requested" }).success).toBe(false);
    expect(reviewDecision.safeParse({ deliverableId: id, decision: "changes_requested", feedback: "Bigger logo" }).success).toBe(true);
    expect(canReview("in_review")).toBe(true);
    expect(canReview("approved")).toBe(false);
  });
  it("parse and print report metrics", () => {
    const m = parseMetrics("Leads: 42 (+12%)\nnot a metric\nSpend: $1,200\n");
    expect(m).toEqual([{ label: "Leads", value: "42", change: "+12%" }, { label: "Spend", value: "$1,200" }]);
    expect(metricsText(m)).toBe("Leads: 42 (+12%)\nSpend: $1,200");
    expect(metricsText(null)).toBe("");
  });
  it("group logged hours by month", () => {
    expect(hoursByMonth([{ worked_on: "2026-10-02", hours: 1.5 }, { worked_on: "2026-10-20", hours: "2" }, { worked_on: "2026-09-30", hours: 1 }]).map((h) => [h.month, h.hours]))
      .toEqual([["2026-10", 3.5], ["2026-09", 1]]);
  });
});

describe("client actions", () => {
  const sub = { status: "active", started_at: "2026-07-01T00:00:00Z", guarantee_status: "running", sales_received: false };
  it("allow a guarantee refund request only when every rule passes", () => {
    const now = new Date("2026-10-01T00:00:00Z");
    expect(guaranteeClaimable(sub, [], now)).toBe(true);
    expect(guaranteeClaimable({ ...sub, sales_received: true }, [], now)).toBe(false);
    expect(guaranteeClaimable({ ...sub, guarantee_status: "claimed" }, [], now)).toBe(false);
    expect(guaranteeClaimable(sub, [{ status: "overdue" }], now)).toBe(false);
    expect(guaranteeClaimable(sub, [], new Date("2026-09-01T00:00:00Z"))).toBe(false);
    expect(guaranteeClaimSchema.safeParse({ subscriptionId: "00000000-0000-4000-8000-000000000000", statement: "short", confirmNoSales: true }).success).toBe(false);
  });
  it("let clients turn email notifications off", () => {
    expect(profileUpdateSchema.safeParse({ email_notifications: false }).success).toBe(true);
    expect(profileUpdateSchema.safeParse({ status: "active" }).success).toBe(false);
  });
  it("store the signed agreements for the chosen plan", () => {
    const scale = plans[2];
    const docs = agreementDocuments(scale);
    expect(docs.find((d) => d.title === "Subscription and Billing Terms")?.body).toContain(planTerms(scale));
    expect(docs.some((d) => /demonstration|not submitted/i.test(d.body))).toBe(false);
    const signed = signedAgreementText(docs[0]!, { name: "Cal Client", accountNumber: "1234567890", signedAt: "2026-10-29T10:00:00Z" });
    expect(signed).toContain("Signed digitally by Cal Client (account 1234567890) on 2026-10-29T10:00:00.000Z.");
    expect(signed).toContain(AGREEMENT_VERSION);
  });
});
