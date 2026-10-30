import { countryName } from "@/lib/security";
import type { Database } from "@/integrations/supabase/types";

export type AppStatus = Database["public"]["Enums"]["application_status"];

export const statusLabel: Record<AppStatus, string> = {
  submitted: "Submitted",
  in_review: "In review",
  info_requested: "Info requested",
  escalated: "Escalated",
  approved: "Approved",
  rejected: "Rejected",
  suspended: "Suspended",
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
  suspended: [],
};

export function canTransition(from: AppStatus, to: AppStatus) {
  return workflowActions[from].some((a) => a.to === to);
}

/** Moving into these statuses is shared with the client, note included (enforced by set_event_visibility in the database). */
export const clientVisibleStatuses: AppStatus[] = ["submitted", "info_requested", "approved", "rejected", "suspended"];
export const sharedWithClient = (to: AppStatus) => clientVisibleStatuses.includes(to);
/** When the client answers an information request, the application goes back to review (the staff "Information received" step). */
export const clientResponse = { from: "info_requested", to: "in_review" } as const satisfies { from: AppStatus; to: AppStatus };

/** Client account statuses, in lifecycle order. */
export const accountStatuses = ["prospect", "onboarding", "active", "past_due", "on_hold", "suspended", "cancelled", "closed"] as const;
export type AccountStatus = (typeof accountStatuses)[number];
export const accountStatusLabel: Record<AccountStatus, string> = {
  prospect: "Prospect", onboarding: "Onboarding", active: "Active", past_due: "Past due",
  on_hold: "On hold", suspended: "Suspended", cancelled: "Cancelled", closed: "Closed",
};
/** Statuses that block the client from signing in. */
export const signInBlocked = (s: string) => s === "suspended" || s === "closed";
/** Statuses in which the client can't change their own plans (staff hold, suspension or closure). */
export const clientActionsBlocked = (s: string) => ["on_hold", "suspended", "cancelled", "closed"].includes(s);
/** Statuses in which the client can't order another plan. */
export const orderingBlocked = (s: string) => s === "past_due" || clientActionsBlocked(s);
/** What happens to running subscriptions when an account moves to a status. */
export function subscriptionEffect(s: string): "paused" | "cancelled" | null {
  if (s === "on_hold" || s === "suspended") return "paused";
  if (s === "cancelled" || s === "closed") return "cancelled";
  return null;
}

/** 90-day money-back guarantee: a refund can be requested once the plan has run for 90 days (see guaranteeCheck in src/lib/billing.ts). */
export const GUARANTEE_DAYS = 90;
/** Days after day 90 in which the refund can be requested. */
export const GUARANTEE_CLAIM_DAYS = 30;
/** Day the refund request opens, counted from the subscription start (stored as guarantee_ends_at). */
export function guaranteeEnd(startedAt: Date) {
  const d = new Date(startedAt); d.setDate(d.getDate() + GUARANTEE_DAYS); return d;
}

/** Financial and legal records are never deleted, only voided or archived. */
export const deletableTables = ["contacts", "tasks", "crm_activities", "support_tickets", "message_templates"] as const;
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
  draft: "bg-zinc-100 text-zinc-700 ring-zinc-300", changes_requested: "bg-orange-50 text-orange-700 ring-orange-200",
  waiting_on_client: "bg-yellow-50 text-yellow-800 ring-yellow-200", running: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  claimed: "bg-fuchsia-50 text-fuchsia-700 ring-fuchsia-200", refunded: "bg-sky-50 text-sky-700 ring-sky-200", denied: "bg-red-50 text-red-700 ring-red-200",
  published: "bg-emerald-50 text-emerald-700 ring-emerald-200", breached: "bg-red-50 text-red-700 ring-red-200", due_soon: "bg-amber-50 text-amber-700 ring-amber-200",
  on_track: "bg-blue-50 text-blue-700 ring-blue-200", met: "bg-emerald-50 text-emerald-700 ring-emerald-200",
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
/** A readable audit value: dates formatted, yes/no for booleans, status codes in words, nested values flattened. */
export function auditValue(v: unknown): string {
  if (v == null || v === "") return "—";
  if (typeof v === "boolean") return v ? "Yes" : "No";
  if (typeof v === "number") return String(v);
  if (typeof v === "string") {
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(v) && !Number.isNaN(Date.parse(v))) return formatDate(v);
    if (/^[a-z]+(_[a-z]+)+$/.test(v)) return humanize(v);
    return v;
  }
  if (Array.isArray(v)) return v.map(auditValue).join(", ") || "—";
  return Object.entries(v as Record<string, unknown>).map(([k, x]) => `${fieldLabel(k)}: ${auditValue(x)}`).join(", ") || "—";
}
const fieldLabel = (k: string) => { const h = humanize(k); return h.charAt(0).toUpperCase() + h.slice(1); };
const isChange = (v: unknown): v is { from?: unknown; to?: unknown } => !!v && typeof v === "object" && !Array.isArray(v) && ("from" in v || "to" in v);

/** One row per changed field. Updates and status changes show before and after; other actions show the key details. */
export function auditRows(action: string, changes: unknown): { field: string; from: string | null; to: string }[] {
  if (!changes || typeof changes !== "object") return [];
  const c = changes as Record<string, unknown>;
  const entries = action === "update" || Object.values(c).some(isChange) ? Object.entries(c)
    : ["subject", "name", "title", "number", "reference", "kind", "status", "amount", "hours", "plan_name", "reason"].filter((k) => c[k] != null).map((k) => [k, c[k]] as const);
  const val = (k: string, x: unknown) => (k === "country" && typeof x === "string" ? countryName(x) || "—" : auditValue(x));
  // A flag that's off or a blank detail says nothing; only real changes and set values are shown.
  return entries.filter(([, v]) => isChange(v) || (v !== false && v != null && v !== "")).map(([k, v]) => isChange(v) ? { field: fieldLabel(k), from: val(k, v.from), to: val(k, v.to) } : { field: fieldLabel(k), from: null, to: val(k, v) });
}
export function auditLines(action: string, changes: unknown): string[] {
  const rows = auditRows(action, changes);
  return rows.length ? rows.map((r) => `${r.field}: ${r.from != null ? `${r.from} → ` : ""}${r.to}`) : [humanize(action)];
}
export const auditSummary = (action: string, changes: unknown) => auditLines(action, changes).join("; ");
