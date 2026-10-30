import { z } from "zod";

/** Deliverables and client reports: statuses, review decisions and report metrics. */
export const deliverableStatuses = ["draft", "in_review", "approved", "changes_requested", "archived"] as const;
export const deliverableLabel: Record<string, string> = { draft: "Draft", in_review: "Awaiting your review", approved: "Approved", changes_requested: "Changes requested", archived: "Archived" };
export const reviewDecision = z.object({
  deliverableId: z.string().uuid(),
  decision: z.enum(["approved", "changes_requested"]),
  feedback: z.string().trim().max(4000).optional(),
}).refine((v) => v.decision === "approved" || (v.feedback?.length ?? 0) >= 3, { message: "Tell us what to change.", path: ["feedback"] });
export const canReview = (status: string) => status === "in_review";

export type Metric = { label: string; value: string; change?: string };
/** Parses report metrics typed one per line as "Label: value (change)", e.g. "Leads: 42 (+12%)". */
export function parseMetrics(text: string): Metric[] {
  return text.split("\n").map((l) => l.trim()).filter(Boolean).slice(0, 30).flatMap((line) => {
    const m = /^(.{1,80}?):\s*(.{1,80}?)(?:\s*\(([^()]{1,40})\))?$/.exec(line);
    if (!m) return [];
    return [{ label: m[1]!.trim(), value: m[2]!.trim(), ...(m[3] ? { change: m[3].trim() } : {}) }];
  });
}
export const metricsText = (metrics: unknown) => (Array.isArray(metrics) ? (metrics as Metric[]).map((m) => `${m.label}: ${m.value}${m.change ? ` (${m.change})` : ""}`).join("\n") : "");
export const metricTone = (change?: string) => (!change ? "" : change.trim().startsWith("-") ? "text-destructive" : "text-emerald-700");

/** Logged hours grouped by month (newest first), for the client's hours history. */
export function hoursByMonth(entries: { worked_on: string; hours: number | string }[]) {
  const totals = new Map<string, number>();
  for (const e of entries) { const k = e.worked_on.slice(0, 7); totals.set(k, Math.round(((totals.get(k) ?? 0) + Number(e.hours)) * 100) / 100); }
  return [...totals.entries()].sort((a, b) => b[0].localeCompare(a[0])).map(([month, hours]) => ({
    month, hours, label: new Date(`${month}-01T00:00:00Z`).toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" }),
  }));
}
