import type { FieldDef } from "@/components/admin/form-modal";
import { metricsText, parseMetrics } from "@/lib/work";

/** Display formats for record fields. */
export type Fmt = "text" | "money" | "date" | "day" | "status" | "bool" | "hours" | "long" | "metrics";
export type RecordKind = "subscriptions" | "projects" | "invoices" | "transactions" | "support_tickets" | "crm_activities" | "tasks" | "contacts" | "compliance_requests" | "deliverables" | "client_reports";

export type Child = { label: string; kind: RecordKind | "time_entries" | "ticket_messages" | "invoice_charges"; fk: string; columns: [string, string, Fmt][] };
/** A saved filter on the cross-account list page for a record type. */
export type ListView = { id: string; label: string; match: (r: Row, today: string) => boolean };
export type Parent = { label: string; kind: RecordKind | "applications"; fk: string };

export type KindConfig = {
  singular: string;
  plural: string;
  title: (r: Row) => string;
  fields: [string, string, Fmt][];
  edit: FieldDef[];
  parents?: Parent[];
  children?: Child[];
  /** Records that may be voided (kept but cancelled) instead of deleted. */
  voidable?: boolean;
  archivable?: boolean;
  /** Cross-account list at /admin/records/$kind: columns, saved views and newest-first sort column. */
  list?: { columns: [string, string, Fmt][]; views: ListView[]; order: string };
  /** Files can be attached to these records (documents.related_table). */
  files?: boolean;
  /** Form fields stored in another shape (for example report metrics typed one per line). */
  codec?: Record<string, { toForm: (v: unknown) => string; fromForm: (v: string) => unknown }>;
};
/** Generic record rows and form values: columns vary per table, so they are loosely typed here. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Row = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Vals = any;

const s = (v: unknown) => (v == null ? "" : String(v));
const sel = (name: string, label: string, options: string[]): FieldDef => ({ name, label, type: "select", options });
const all: ListView = { id: "all", label: "All", match: () => true };
const unpaid = (r: Row) => r.status === "open" || r.status === "overdue";

export const recordKinds: Record<RecordKind, KindConfig> = {
  subscriptions: {
    singular: "Subscription", plural: "Subscriptions", archivable: true,
    list: { order: "created_at", columns: [["Plan", "plan_name", "text"], ["Status", "status", "status"], ["Fee", "monthly_fee", "money"], ["Hours used", "hours_used", "hours"], ["Renews", "renews_at", "day"], ["Guarantee", "guarantee_status", "status"]],
      views: [{ id: "active", label: "Active", match: (r) => r.status === "active" }, { id: "pending", label: "Awaiting first payment", match: (r) => r.status === "pending" },
        { id: "renewing", label: "Renewing in 14 days", match: (r, today) => r.status === "active" && !!r.renews_at && String(r.renews_at).slice(0, 10) >= today && new Date(r.renews_at).getTime() - Date.parse(today) <= 14 * 864e5 },
        { id: "trouble", label: "Past due or suspended", match: (r) => r.status === "past_due" || r.status === "suspended" },
        { id: "over", label: "Over hours", match: (r) => Number(r.hours_used) > Number(r.monthly_hours) }, { id: "claimed", label: "Guarantee claims", match: (r) => r.guarantee_status === "claimed" }, all] },
    title: (r) => `${s(r.plan_name)} subscription`,
    fields: [["Plan", "plan_name", "text"], ["Status", "status", "status"], ["Monthly fee", "monthly_fee", "money"], ["Monthly hours", "monthly_hours", "hours"],
      ["Hours used this period", "hours_used", "hours"], ["Started", "started_at", "date"], ["Renews", "renews_at", "date"], ["Cancelled", "cancelled_at", "date"],
      ["Guarantee ends", "guarantee_ends_at", "date"], ["Guarantee", "guarantee_status", "status"], ["Guarantee void reason", "guarantee_void_reason", "long"], ["Sales received", "sales_received", "bool"],
      ["Extra hours billed", "overage_billed_hours", "hours"], ["Payment warning", "payment_warning", "long"], ["Notes", "notes", "long"]],
    // Plan, price, status and renewal mirror Stripe and change through the billing actions, not this form.
    edit: [sel("sales_received", "Sales received", ["no", "yes"]), sel("guarantee_status", "Guarantee", ["not_started", "running", "claimed", "refunded", "expired", "denied"]),
      { name: "guarantee_ends_at", label: "Guarantee ends", type: "date" }, { name: "notes", label: "Notes", type: "textarea" }],
    parents: [{ label: "Application", kind: "applications", fk: "application_id" }],
    children: [
      { label: "Projects", kind: "projects", fk: "subscription_id", columns: [["Project", "name", "text"], ["Status", "status", "status"], ["Hours", "hours", "hours"], ["Due", "due_at", "day"]] },
      { label: "Invoices", kind: "invoices", fk: "subscription_id", columns: [["Invoice", "number", "text"], ["Amount", "amount", "money"], ["Status", "status", "status"], ["Due", "due_at", "day"]] },
      { label: "Transactions", kind: "transactions", fk: "subscription_id", columns: [["Reference", "reference", "text"], ["Amount", "amount", "money"], ["Status", "status", "status"], ["Date", "created_at", "date"]] },
      { label: "Tasks", kind: "tasks", fk: "subscription_id", columns: [["Task", "title", "text"], ["Status", "status", "status"], ["Due", "due_at", "day"], ["Assigned", "assigned_to", "text"]] },
      { label: "Support tickets", kind: "support_tickets", fk: "subscription_id", columns: [["Subject", "subject", "text"], ["Status", "status", "status"], ["Priority", "priority", "text"]] },
      { label: "Reports", kind: "client_reports", fk: "subscription_id", columns: [["Report", "title", "text"], ["Period starting", "period_start", "day"], ["Published", "published_at", "date"]] },
    ],
  },
  projects: {
    singular: "Project", plural: "Projects", archivable: true, files: true,
    list: { order: "created_at", columns: [["Project", "name", "text"], ["Status", "status", "status"], ["Hours", "hours", "hours"], ["Assigned to", "assigned_to", "text"], ["Due", "due_at", "day"]],
      views: [{ id: "open", label: "In progress", match: (r) => ["planned", "active", "on_hold"].includes(r.status) && !r.archived_at },
        { id: "overdue", label: "Overdue", match: (r, today) => !!r.due_at && r.due_at < today && !["completed", "cancelled"].includes(r.status) }, all] },
    title: (r) => s(r.name),
    fields: [["Project", "name", "text"], ["Service", "service", "text"], ["Status", "status", "status"], ["Hours logged", "hours", "hours"], ["Assigned to", "assigned_to", "text"],
      ["Start", "started_at", "day"], ["Due", "due_at", "day"], ["Completed", "completed_at", "date"], ["Scope", "description", "long"]],
    edit: [{ name: "name", label: "Project name", required: true }, sel("service", "Service", ["Marketing", "Design", "Development"]),
      sel("status", "Status", ["planned", "active", "on_hold", "completed", "cancelled"]), { name: "assigned_to", label: "Assigned to" },
      { name: "started_at", label: "Start date", type: "date" }, { name: "due_at", label: "Due date", type: "date" }, { name: "description", label: "Scope", type: "textarea" }],
    parents: [{ label: "Subscription", kind: "subscriptions", fk: "subscription_id" }],
    children: [
      { label: "Time entries", kind: "time_entries", fk: "project_id", columns: [["Date", "worked_on", "day"], ["Hours", "hours", "hours"], ["Work", "description", "text"], ["By", "actor_label", "text"]] },
      { label: "Tasks", kind: "tasks", fk: "project_id", columns: [["Task", "title", "text"], ["Status", "status", "status"], ["Due", "due_at", "day"]] },
      { label: "Deliverables", kind: "deliverables", fk: "project_id", columns: [["Deliverable", "title", "text"], ["Status", "status", "status"], ["Sent", "submitted_at", "date"]] },
    ],
  },
  invoices: {
    singular: "Invoice", plural: "Invoices", voidable: true,
    list: { order: "issued_at", columns: [["Invoice", "number", "text"], ["Type", "kind", "text"], ["Amount", "amount", "money"], ["Status", "status", "status"], ["Collections", "collection_stage", "status"], ["Due", "due_at", "day"]],
      views: [{ id: "unpaid", label: "Unpaid", match: unpaid }, { id: "overdue", label: "Overdue", match: (r, today) => unpaid(r) && (r.status === "overdue" || (!!r.due_at && r.due_at < today)) },
        { id: "collections", label: "In collections", match: (r) => unpaid(r) && ["debt_recovery", "legal", "court"].includes(r.collection_stage) },
        { id: "first", label: "First invoices unpaid", match: (r) => unpaid(r) && r.kind === "first" }, { id: "paid", label: "Paid", match: (r) => r.status === "paid" }, all] },
    title: (r) => `Invoice ${s(r.number)}`,
    fields: [["Number", "number", "text"], ["Amount", "amount", "money"], ["Status", "status", "status"], ["Issued", "issued_at", "day"], ["Due", "due_at", "day"],
      ["Paid", "paid_at", "date"], ["Type", "kind", "text"], ["Collection stage", "collection_stage", "status"], ["Interest accrued", "interest_accrued", "money"],
      ["Legal and court fees", "fees_accrued", "money"], ["Interest paused", "interest_paused", "bool"], ["Description", "description", "long"], ["Collection notes", "collection_notes", "long"], ["Void reason", "void_reason", "long"]],
    edit: [{ name: "description", label: "Description", required: true }],
    parents: [{ label: "Subscription", kind: "subscriptions", fk: "subscription_id" }],
    children: [{ label: "Interest and fees", kind: "invoice_charges", fk: "invoice_id", columns: [["Date", "created_at", "date"], ["Type", "kind", "text"], ["Charge", "description", "text"], ["Amount", "amount", "money"]] },
      { label: "Payments", kind: "transactions", fk: "invoice_id", columns: [["Reference", "reference", "text"], ["Amount", "amount", "money"], ["Method", "method", "text"], ["Date", "created_at", "date"]] }],
  },
  transactions: {
    singular: "Transaction", plural: "Transactions", voidable: true,
    list: { order: "created_at", columns: [["Reference", "reference", "text"], ["Amount", "amount", "money"], ["Method", "method", "text"], ["Status", "status", "status"], ["Date", "created_at", "date"]],
      views: [{ id: "recent", label: "Last 30 days", match: (r, today) => Date.parse(today) - new Date(r.created_at).getTime() <= 30 * 864e5 }, { id: "refunds", label: "Refunds", match: (r) => Number(r.amount) < 0 },
        { id: "failed", label: "Failed", match: (r) => r.status === "failed" }, all] },
    title: (r) => `Transaction ${s(r.reference)}`,
    fields: [["Reference", "reference", "text"], ["Amount", "amount", "money"], ["Method", "method", "text"], ["Status", "status", "status"], ["Date", "created_at", "date"],
      ["Description", "description", "long"], ["Void reason", "void_reason", "long"]],
    edit: [{ name: "description", label: "Description", required: true }, sel("method", "Method", ["bank_transfer", "card", "ach", "check", "other"]), sel("status", "Status", ["completed", "pending", "failed"])],
    parents: [{ label: "Invoice", kind: "invoices", fk: "invoice_id" }, { label: "Subscription", kind: "subscriptions", fk: "subscription_id" }],
  },
  support_tickets: {
    singular: "Support ticket", plural: "Support tickets", archivable: true, files: true,
    title: (r) => s(r.subject),
    fields: [["Subject", "subject", "text"], ["Status", "status", "status"], ["Department", "department", "text"], ["Priority", "priority", "text"], ["Reply by", "contact_preference", "text"], ["Phone to call", "contact_phone", "text"], ["Assigned to", "assigned_to", "text"],
      ["Opened", "created_at", "date"], ["Closed", "closed_at", "date"]],
    edit: [{ name: "subject", label: "Subject", required: true }, sel("department", "Department", ["account", "billing", "technical", "projects", "marketing", "complaints"]),
      sel("status", "Status", ["open", "in_progress", "waiting_on_client", "closed"]), sel("priority", "Priority", ["low", "normal", "high", "urgent"]),
      sel("contact_preference", "Reply by", ["dashboard", "email", "phone"]), { name: "contact_phone", label: "Phone to call" }, { name: "assigned_to", label: "Assigned to" }],
    parents: [{ label: "Subscription", kind: "subscriptions", fk: "subscription_id" }, { label: "Project", kind: "projects", fk: "project_id" }],
    children: [{ label: "Conversation", kind: "ticket_messages", fk: "ticket_id", columns: [["When", "created_at", "date"], ["Message", "body", "text"], ["By", "actor_label", "text"]] }],
  },
  crm_activities: {
    singular: "Activity", plural: "Activities",
    list: { order: "occurred_at", columns: [["When", "occurred_at", "date"], ["Type", "kind", "text"], ["Subject", "subject", "text"], ["Follow-up", "follow_up_at", "day"], ["By", "actor_label", "text"]],
      views: [{ id: "due", label: "Follow-ups due", match: (r, today) => !!r.follow_up_at && r.follow_up_at <= today && !r.follow_up_done_at },
        { id: "upcoming", label: "Upcoming follow-ups", match: (r, today) => !!r.follow_up_at && r.follow_up_at > today && !r.follow_up_done_at }, all] },
    title: (r) => s(r.subject),
    fields: [["Subject", "subject", "text"], ["Type", "kind", "text"], ["Direction", "direction", "text"], ["Outcome", "outcome", "text"], ["Minutes", "duration_minutes", "text"],
      ["When", "occurred_at", "date"], ["Follow-up", "follow_up_at", "day"], ["Follow-up done", "follow_up_done_at", "date"], ["Logged by", "actor_label", "text"], ["Summary", "body", "long"]],
    edit: [{ name: "subject", label: "Subject", required: true }, sel("kind", "Type", ["call", "email", "meeting", "note"]), sel("direction", "Direction", ["outbound", "inbound", "internal"]),
      sel("outcome", "Outcome", ["completed", "no_answer", "left_voicemail", "follow_up_needed", "resolved"]), { name: "duration_minutes", label: "Duration (minutes)", type: "number" },
      { name: "follow_up_at", label: "Follow-up date", type: "date" }, { name: "body", label: "Summary", type: "textarea" }],
  },
  tasks: {
    singular: "Task", plural: "Tasks",
    title: (r) => s(r.title),
    fields: [["Task", "title", "text"], ["Status", "status", "status"], ["Priority", "priority", "text"], ["Due", "due_at", "day"], ["Assigned to", "assigned_to", "text"],
      ["Completed", "completed_at", "date"], ["Estimated hours", "estimated_hours", "hours"], ["Over allowance", "over_allowance", "bool"], ["Extra hours approved", "overage_approved", "bool"],
      ["Created by", "actor_label", "text"], ["Details", "details", "long"]],
    edit: [{ name: "title", label: "Task", required: true }, sel("status", "Status", ["open", "in_progress", "review", "completed", "cancelled"]), sel("priority", "Priority", ["low", "normal", "high", "urgent"]),
      { name: "due_at", label: "Due date", type: "date" }, { name: "assigned_to", label: "Assigned to" }, { name: "details", label: "Details", type: "textarea" }],
    parents: [{ label: "Subscription", kind: "subscriptions", fk: "subscription_id" }, { label: "Project", kind: "projects", fk: "project_id" }],
  },
  contacts: {
    singular: "Contact", plural: "Contacts",
    title: (r) => s(r.name),
    fields: [["Name", "name", "text"], ["Role", "role", "text"], ["Email", "email", "text"], ["Phone", "phone", "text"], ["Added", "created_at", "date"], ["Notes", "notes", "long"]],
    edit: [{ name: "name", label: "Name", required: true }, sel("role", "Role", ["primary", "billing", "technical", "marketing", "decision_maker", "other"]),
      { name: "email", label: "Email", type: "email" }, { name: "phone", label: "Phone" }, { name: "notes", label: "Notes", type: "textarea" }],
  },
  compliance_requests: {
    singular: "Privacy request", plural: "Privacy requests", files: true,
    list: { order: "created_at", columns: [["Request", "kind", "text"], ["Status", "status", "status"], ["Due", "due_at", "day"], ["Logged by", "actor_label", "text"]],
      views: [{ id: "open", label: "Open", match: (r) => r.status === "open" }, { id: "late", label: "Due within 7 days or late", match: (r, today) => r.status === "open" && Date.parse(r.due_at) - Date.parse(today) <= 7 * 864e5 }, all] },
    title: (r) => `${s(r.kind).replaceAll("_", " ")} request`,
    fields: [["Request", "kind", "text"], ["Status", "status", "status"], ["Due", "due_at", "day"], ["Completed", "completed_at", "date"], ["Logged by", "actor_label", "text"],
      ["Details", "details", "long"], ["Outcome note", "outcome_note", "long"]],
    edit: [sel("status", "Status", ["open", "completed", "denied"]), { name: "details", label: "Details", type: "textarea" }, { name: "outcome_note", label: "Outcome note", type: "textarea" }],
  },
  deliverables: {
    singular: "Deliverable", plural: "Deliverables", archivable: true, files: true,
    title: (r) => s(r.title),
    fields: [["Deliverable", "title", "text"], ["Status", "status", "status"], ["Assigned to", "assigned_to", "text"], ["Due", "due_at", "day"], ["Review round", "review_round", "text"],
      ["Sent for review", "submitted_at", "date"], ["Client decision", "decided_at", "date"], ["Client feedback", "client_feedback", "long"], ["Description", "description", "long"]],
    // Status moves through Send for review, Withdraw and the client's decision, not this form.
    edit: [{ name: "title", label: "Deliverable", required: true }, { name: "assigned_to", label: "Assigned to" }, { name: "due_at", label: "Due date", type: "date" }, { name: "description", label: "What the client should review", type: "textarea" }],
    parents: [{ label: "Subscription", kind: "subscriptions", fk: "subscription_id" }, { label: "Project", kind: "projects", fk: "project_id" }, { label: "Task", kind: "tasks", fk: "task_id" }],
    list: { order: "updated_at", columns: [["Deliverable", "title", "text"], ["Status", "status", "status"], ["Assigned to", "assigned_to", "text"], ["Sent", "submitted_at", "date"], ["Due", "due_at", "day"]],
      views: [{ id: "review", label: "With the client", match: (r) => r.status === "in_review" }, { id: "changes", label: "Changes requested", match: (r) => r.status === "changes_requested" },
        { id: "draft", label: "Drafts", match: (r) => r.status === "draft" && !r.archived_at }, { id: "approved", label: "Approved", match: (r) => r.status === "approved" }, all] },
  },
  client_reports: {
    singular: "Report", plural: "Client reports", archivable: true, files: true,
    title: (r) => s(r.title),
    fields: [["Report", "title", "text"], ["Period starting", "period_start", "day"], ["Published", "published_at", "date"], ["Prepared by", "actor_label", "text"], ["Metrics", "metrics", "metrics"], ["Summary", "summary", "long"]],
    edit: [{ name: "title", label: "Report title", required: true }, { name: "period_start", label: "Period starting", type: "date", required: true },
      { name: "metrics", label: "Metrics, one per line as Label: value (change)", type: "textarea", placeholder: "Leads: 42 (+12%)\nAd spend: $1,200" }, { name: "summary", label: "Summary for the client", type: "textarea" }],
    codec: { metrics: { toForm: metricsText, fromForm: parseMetrics } },
    parents: [{ label: "Subscription", kind: "subscriptions", fk: "subscription_id" }],
    list: { order: "period_start", columns: [["Report", "title", "text"], ["Period starting", "period_start", "day"], ["Published", "published_at", "date"], ["Prepared by", "actor_label", "text"]],
      views: [{ id: "draft", label: "Not published", match: (r) => !r.published_at && !r.archived_at }, { id: "published", label: "Published", match: (r) => !!r.published_at }, all] },
  },
};

export const isRecordKind = (k: string): k is RecordKind => k in recordKinds;

/** Pre-fills an edit form from a record. */
export function formDefaults(fields: FieldDef[], row: Row, codec?: KindConfig["codec"]): FieldDef[] {
  return fields.map((f) => {
    if (codec?.[f.name]) return { ...f, defaultValue: codec[f.name]!.toForm(row[f.name]) };
    const v = row[f.name];
    const isBool = f.options?.join() === "no,yes";
    return { ...f, defaultValue: isBool ? (v ? "yes" : "no") : f.type === "date" && typeof v === "string" ? v.slice(0, 10) : v == null ? (f.options?.[0] ?? "") : String(v) };
  });
}

/** Converts form strings back into column values. */
export function toPatch(fields: FieldDef[], values: Record<string, string>, codec?: KindConfig["codec"]): Row {
  const out: Row = {};
  for (const f of fields) {
    const v = values[f.name] ?? "";
    if (codec?.[f.name]) out[f.name] = codec[f.name]!.fromForm(v);
    else if (f.options?.join() === "no,yes") out[f.name] = v === "yes";
    else if (f.type === "number") out[f.name] = v === "" ? null : Number(v);
    else out[f.name] = v === "" ? null : v;
  }
  return out;
}
