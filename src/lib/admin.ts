import type { Database } from "@/integrations/supabase/types";

export type AppStatus = Database["public"]["Enums"]["application_status"];

export const statusLabel: Record<AppStatus, string> = {
  submitted: "Submitted",
  in_review: "In review",
  info_requested: "Info requested",
  escalated: "Escalated",
  approved: "Approved",
  rejected: "Rejected",
};

/** Ordered workflow stages shown in the application progress tracker. */
export const workflowStages: AppStatus[] = ["submitted", "in_review", "approved"];

export type WorkflowAction = { to: AppStatus; label: string; tone: "primary" | "secondary" | "danger"; needsNote: boolean };

/** Allowed next steps for an application in each status. Final decisions cannot be changed. */
export const workflowActions: Record<AppStatus, WorkflowAction[]> = {
  submitted: [{ to: "in_review", label: "Start review", tone: "primary", needsNote: false }],
  in_review: [
    { to: "approved", label: "Approve client", tone: "primary", needsNote: false },
    { to: "info_requested", label: "Request information", tone: "secondary", needsNote: true },
    { to: "escalated", label: "Escalate", tone: "secondary", needsNote: true },
    { to: "rejected", label: "Reject", tone: "danger", needsNote: true },
  ],
  info_requested: [{ to: "in_review", label: "Information received", tone: "primary", needsNote: false }],
  escalated: [
    { to: "approved", label: "Approve client", tone: "primary", needsNote: false },
    { to: "in_review", label: "Return to review", tone: "secondary", needsNote: false },
    { to: "rejected", label: "Reject", tone: "danger", needsNote: true },
  ],
  approved: [],
  rejected: [],
};

export function canTransition(from: AppStatus, to: AppStatus) {
  return workflowActions[from].some((a) => a.to === to);
}

/** Client account statuses, in lifecycle order. */
export const accountStatuses = ["prospect", "onboarding", "active", "past_due", "on_hold", "suspended", "cancelled", "closed"] as const;
export type AccountStatus = (typeof accountStatuses)[number];
export const accountStatusLabel: Record<AccountStatus, string> = {
  prospect: "Prospect", onboarding: "Onboarding", active: "Active", past_due: "Past due",
  on_hold: "On hold", suspended: "Suspended", cancelled: "Cancelled", closed: "Closed",
};
/** Statuses that block the client from signing in. */
export const signInBlocked = (s: string) => s === "suspended" || s === "closed";
/** What happens to running subscriptions when an account moves to a status. */
export function subscriptionEffect(s: string): "paused" | "cancelled" | null {
  if (s === "on_hold" || s === "suspended") return "paused";
  if (s === "cancelled" || s === "closed") return "cancelled";
  return null;
}

/** 90-day money-back guarantee window, counted from the subscription start. */
export const GUARANTEE_DAYS = 90;
export function guaranteeEnd(startedAt: Date) {
  const d = new Date(startedAt); d.setDate(d.getDate() + GUARANTEE_DAYS); return d;
}
/** Eligible for a service-fee refund only inside the window and when no sales were received. */
export function guaranteeEligible(sub: { guarantee_ends_at: string | null; sales_received: boolean }, now = new Date()) {
  return !!sub.guarantee_ends_at && now <= new Date(sub.guarantee_ends_at) && !sub.sales_received;
}

/** Financial and legal records are never deleted, only voided or archived. */
export const deletableTables = ["contacts", "tasks", "crm_activities", "support_tickets"] as const;
export const canDelete = (table: string) => (deletableTables as readonly string[]).includes(table);

const tones: Record<string, string> = {
  active: "bg-emerald-50 text-emerald-700 ring-emerald-200", approved: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  paid: "bg-emerald-50 text-emerald-700 ring-emerald-200", completed: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  prospect: "bg-sky-50 text-sky-700 ring-sky-200", onboarding: "bg-blue-50 text-blue-700 ring-blue-200",
  submitted: "bg-blue-50 text-blue-700 ring-blue-200", planned: "bg-blue-50 text-blue-700 ring-blue-200",
  in_review: "bg-indigo-50 text-indigo-700 ring-indigo-200", in_progress: "bg-indigo-50 text-indigo-700 ring-indigo-200",
  past_due: "bg-orange-50 text-orange-700 ring-orange-200", overdue: "bg-orange-50 text-orange-700 ring-orange-200",
  on_hold: "bg-amber-50 text-amber-700 ring-amber-200", paused: "bg-amber-50 text-amber-700 ring-amber-200",
  pending: "bg-amber-50 text-amber-700 ring-amber-200", open: "bg-amber-50 text-amber-700 ring-amber-200",
  info_requested: "bg-yellow-50 text-yellow-800 ring-yellow-200", escalated: "bg-fuchsia-50 text-fuchsia-700 ring-fuchsia-200",
  suspended: "bg-red-50 text-red-700 ring-red-200", rejected: "bg-red-50 text-red-700 ring-red-200", failed: "bg-red-50 text-red-700 ring-red-200",
  cancelled: "bg-zinc-100 text-zinc-700 ring-zinc-300", void: "bg-zinc-100 text-zinc-700 ring-zinc-300",
  closed: "bg-zinc-200 text-zinc-800 ring-zinc-300", archived: "bg-zinc-100 text-zinc-600 ring-zinc-300",
};
export function statusTone(s: string) {
  return tones[s] ?? "bg-secondary text-foreground ring-border";
}

export const formatAccount = (n: string) => n.replace(/(\d{4})(\d{3})(\d{3})/, "$1 $2 $3");
export const formatDate = (d: string | null) => (d ? new Date(d).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" }) : "—");
export const formatDay = (d: string | null) => (d ? new Date(d).toLocaleDateString("en-GB", { dateStyle: "medium" }) : "—");
export const money = (n: number) => `$${Number(n).toLocaleString("en-US", { minimumFractionDigits: 0 })}`;
export const humanize = (s: string | null | undefined) => (s ? s.replaceAll("_", " ") : "—");

export const lifecycleStages = ["onboarding", "active", "at_risk", "churned", "won_back"] as const;
export const complianceKinds = ["access", "deletion", "correction", "opt_out_of_sale", "marketing_opt_out"] as const;

/** Readable lines for an audit log entry, one per changed field. */
export function auditLines(action: string, changes: unknown): string[] {
  if (!changes || typeof changes !== "object") return [action];
  const c = changes as Record<string, unknown>;
  if (action !== "update") {
    const pick = ["subject", "name", "title", "number", "reference", "kind", "status", "amount", "hours", "plan_name"].filter((k) => c[k] != null);
    return pick.length ? pick.map((k) => `${humanize(k)}: ${String(c[k])}`) : [action];
  }
  return Object.entries(c).map(([k, v]) => {
    const d = v as { from?: unknown; to?: unknown };
    return `${humanize(k)}: ${d.from ?? "—"} → ${d.to ?? "—"}`;
  });
}
export const auditSummary = (action: string, changes: unknown) => auditLines(action, changes).join("; ");
