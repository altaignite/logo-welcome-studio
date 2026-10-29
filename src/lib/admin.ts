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

export function statusTone(s: string) {
  if (s === "approved" || s === "active" || s === "paid" || s === "completed" || s === "closed") return "bg-emerald-50 text-emerald-700 ring-emerald-200";
  if (s === "rejected" || s === "failed" || s === "overdue") return "bg-red-50 text-red-700 ring-red-200";
  if (s === "escalated" || s === "info_requested" || s === "pending" || s === "open") return "bg-amber-50 text-amber-700 ring-amber-200";
  return "bg-secondary text-foreground ring-border";
}

export const formatAccount = (n: string) => n.replace(/(\d{4})(\d{3})(\d{3})/, "$1 $2 $3");
export const formatDate = (d: string | null) => (d ? new Date(d).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" }) : "—");
export const money = (n: number) => `$${Number(n).toLocaleString("en-US", { minimumFractionDigits: 0 })}`;
