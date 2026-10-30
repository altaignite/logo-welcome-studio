import { z } from "zod";

/** Onboarding brief questions. Answers are validated on the server with briefSchema before they are saved. */
export type BriefQuestion = { id: string; label: string; help?: string; type: "text" | "textarea" | "url" | "select"; options?: string[]; required?: boolean; max: number };
export const briefQuestions: BriefQuestion[] = [
  { id: "business_summary", label: "What does your business do?", type: "textarea", required: true, max: 2000 },
  { id: "offer", label: "Which products or services should we promote first?", type: "textarea", required: true, max: 2000 },
  { id: "audience", label: "Who are your ideal customers?", help: "Where they are, what they need and why they buy.", type: "textarea", required: true, max: 2000 },
  { id: "goals", label: "What should the first 90 days achieve?", help: "For example more enquiries, online sales or bookings.", type: "textarea", required: true, max: 2000 },
  { id: "competitors", label: "Competitors or brands you admire", type: "textarea", max: 1000 },
  { id: "brand_assets", label: "Logo, brand colours and fonts", help: "Describe them or upload files under Documents.", type: "textarea", max: 1000 },
  { id: "website", label: "Website", type: "url", max: 200 },
  { id: "social", label: "Social media accounts", type: "textarea", max: 1000 },
  { id: "ad_budget", label: "Monthly advertising budget", help: "Advertising budgets are separate from your service fee.", type: "select", options: ["None yet", "Under $500", "$500 to $2,000", "$2,000 to $10,000", "Over $10,000"], max: 40 },
  { id: "access_notes", label: "Accounts we'll need access to", help: "Website, ads and analytics. Never send passwords here; we'll arrange secure access.", type: "textarea", max: 1000 },
  { id: "anything_else", label: "Anything else we should know?", type: "textarea", max: 2000 },
];

const answer = (q: BriefQuestion): z.ZodTypeAny => {
  const s = z.string().trim().max(q.max);
  if (q.type === "url") return s.refine((v) => v === "" || /^https?:\/\/[^\s]+\.[^\s]+$/i.test(v), "Enter a full web address starting with https://");
  if (q.type === "select") return s.refine((v) => v === "" || q.options!.includes(v), "Choose one of the options.");
  return s;
};
/** Drafts may be partial; a submitted brief must answer every required question. */
export const briefSchema = z.object(Object.fromEntries(briefQuestions.map((q) => [q.id, answer(q).optional()]))).strict();
export type BriefAnswers = Partial<Record<string, string>>;
export const missingAnswers = (a: BriefAnswers) => briefQuestions.filter((q) => q.required && !a[q.id]?.trim()).map((q) => q.label);

type StepState = "done" | "current" | "todo";
export type OnboardingStep = { id: string; title: string; text: string; state: StepState; to?: { section: string } | { kind: string; id: string } };
type Data = {
  apps: { id: string; status: string }[];
  subs: { status: string; started_at: string | null }[];
  invoices: { status: string; kind: string; hosted_url: string | null }[];
  profile: { website: string | null; address_line: string | null; city: string | null; industry: string | null } | null;
  brief: { submitted_at: string | null } | null;
};

/** Getting-started checklist for the client overview, in order. The first unfinished step is current. */
export function onboardingSteps(d: Data): OnboardingStep[] {
  const app = d.apps[d.apps.length - 1] ?? d.apps[0];
  const approved = d.apps.some((a) => a.status === "approved");
  const paid = d.subs.some((s) => !!s.started_at);
  const p = d.profile;
  const steps: (Omit<OnboardingStep, "state"> & { done: boolean })[] = [
    { id: "applied", title: "Application submitted", text: "Your signed application is with our team.", done: d.apps.length > 0 },
    { id: "review", title: app?.status === "info_requested" ? "Reply to our question" : "Application review", done: approved,
      text: app?.status === "info_requested" ? "We need a little more information before we can approve your plan." : app?.status === "rejected" ? "We couldn't approve this application. See the details for why." : "We review new applications within one business day.",
      ...(app ? { to: { kind: "application", id: app.id } } : {}) },
    { id: "pay", title: "Pay your first invoice", text: "Your plan and hours start as soon as the first invoice is paid.", done: paid, to: { section: "invoices" } },
    { id: "profile", title: "Complete your business details", text: "Address, website and industry help us plan your work.", done: !!(p?.website && p.address_line && p.city && p.industry), to: { section: "profile" } },
    { id: "brief", title: "Send your onboarding brief", text: "Tell us about your customers, goals and brand.", done: !!d.brief?.submitted_at, to: { section: "onboarding" } },
  ];
  let current = false;
  return steps.map(({ done, ...s }) => {
    const state: StepState = done ? "done" : current ? "todo" : "current";
    if (!done) current = true;
    return { ...s, state };
  });
}
