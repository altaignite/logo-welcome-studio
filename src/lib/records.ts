import type { FieldDef } from "@/components/admin/form-modal";

/** Display formats for record fields. */
export type Fmt = "text" | "money" | "date" | "day" | "status" | "bool" | "hours" | "long";
export type RecordKind = "subscriptions" | "projects" | "invoices" | "transactions" | "support_tickets" | "crm_activities" | "tasks" | "contacts" | "compliance_requests";

export type Child = { label: string; kind: RecordKind | "time_entries" | "ticket_messages" | "invoice_charges"; fk: string; columns: [string, string, Fmt][] };
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
};
/** Generic record rows and form values: columns vary per table, so they are loosely typed here. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Row = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Vals = any;

const s = (v: unknown) => (v == null ? "" : String(v));
const sel = (name: string, label: string, options: string[]): FieldDef => ({ name, label, type: "select", options });

export const recordKinds: Record<RecordKind, KindConfig> = {
  subscriptions: {
    singular: "Subscription", plural: "Subscriptions", archivable: true,
    title: (r) => `${s(r.plan_name)} subscription`,
    fields: [["Plan", "plan_name", "text"], ["Status", "status", "status"], ["Monthly fee", "monthly_fee", "money"], ["Monthly hours", "monthly_hours", "hours"],
      ["Hours used this period", "hours_used", "hours"], ["Started", "started_at", "date"], ["Renews", "renews_at", "date"], ["Cancelled", "cancelled_at", "date"],
      ["Guarantee ends", "guarantee_ends_at", "date"], ["Guarantee", "guarantee_status", "status"], ["Guarantee void reason", "guarantee_void_reason", "long"], ["Sales received", "sales_received", "bool"],
      ["Extra hours billed", "overage_billed_hours", "hours"], ["Payment warning", "payment_warning", "long"], ["Notes", "notes", "long"]],
    edit: [{ name: "plan_name", label: "Plan name", required: true }, { name: "monthly_fee", label: "Monthly fee (USD)", type: "number", required: true },
      { name: "monthly_hours", label: "Monthly hours", type: "number", required: true }, sel("status", "Status", ["pending", "active", "paused", "cancelled"]),
      sel("sales_received", "Sales received", ["no", "yes"]), sel("guarantee_status", "Guarantee", ["not_started", "running", "claimed", "refunded", "expired", "denied"]),
      { name: "renews_at", label: "Renews", type: "date" }, { name: "guarantee_ends_at", label: "Guarantee ends", type: "date" }, { name: "notes", label: "Notes", type: "textarea" }],
    parents: [{ label: "Application", kind: "applications", fk: "application_id" }],
    children: [
      { label: "Projects", kind: "projects", fk: "subscription_id", columns: [["Project", "name", "text"], ["Status", "status", "status"], ["Hours", "hours", "hours"], ["Due", "due_at", "day"]] },
      { label: "Invoices", kind: "invoices", fk: "subscription_id", columns: [["Invoice", "number", "text"], ["Amount", "amount", "money"], ["Status", "status", "status"], ["Due", "due_at", "day"]] },
      { label: "Transactions", kind: "transactions", fk: "subscription_id", columns: [["Reference", "reference", "text"], ["Amount", "amount", "money"], ["Status", "status", "status"], ["Date", "created_at", "date"]] },
      { label: "Tasks", kind: "tasks", fk: "subscription_id", columns: [["Task", "title", "text"], ["Status", "status", "status"], ["Due", "due_at", "day"], ["Assigned", "assigned_to", "text"]] },
      { label: "Support tickets", kind: "support_tickets", fk: "subscription_id", columns: [["Subject", "subject", "text"], ["Status", "status", "status"], ["Priority", "priority", "text"]] },
    ],
  },
  projects: {
    singular: "Project", plural: "Projects", archivable: true,
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
    ],
  },
  invoices: {
    singular: "Invoice", plural: "Invoices", voidable: true,
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
    title: (r) => `Transaction ${s(r.reference)}`,
    fields: [["Reference", "reference", "text"], ["Amount", "amount", "money"], ["Method", "method", "text"], ["Status", "status", "status"], ["Date", "created_at", "date"],
      ["Description", "description", "long"], ["Void reason", "void_reason", "long"]],
    edit: [{ name: "description", label: "Description", required: true }, sel("method", "Method", ["bank_transfer", "card", "ach", "check", "other"]), sel("status", "Status", ["completed", "pending", "failed"])],
    parents: [{ label: "Invoice", kind: "invoices", fk: "invoice_id" }, { label: "Subscription", kind: "subscriptions", fk: "subscription_id" }],
  },
  support_tickets: {
    singular: "Support ticket", plural: "Support tickets", archivable: true,
    title: (r) => s(r.subject),
    fields: [["Subject", "subject", "text"], ["Status", "status", "status"], ["Priority", "priority", "text"], ["Category", "category", "text"], ["Assigned to", "assigned_to", "text"],
      ["Opened", "created_at", "date"], ["Closed", "closed_at", "date"]],
    edit: [{ name: "subject", label: "Subject", required: true }, sel("status", "Status", ["open", "in_progress", "waiting_on_client", "closed"]),
      sel("priority", "Priority", ["low", "normal", "high", "urgent"]), sel("category", "Category", ["general", "billing", "project", "technical", "complaint"]), { name: "assigned_to", label: "Assigned to" }],
    parents: [{ label: "Subscription", kind: "subscriptions", fk: "subscription_id" }],
    children: [{ label: "Conversation", kind: "ticket_messages", fk: "ticket_id", columns: [["When", "created_at", "date"], ["Message", "body", "text"], ["By", "actor_label", "text"]] }],
  },
  crm_activities: {
    singular: "Activity", plural: "Activities",
    title: (r) => s(r.subject),
    fields: [["Subject", "subject", "text"], ["Type", "kind", "text"], ["Direction", "direction", "text"], ["Outcome", "outcome", "text"], ["Minutes", "duration_minutes", "text"],
      ["When", "occurred_at", "date"], ["Follow-up", "follow_up_at", "day"], ["Logged by", "actor_label", "text"], ["Summary", "body", "long"]],
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
    singular: "Privacy request", plural: "Privacy requests",
    title: (r) => `${s(r.kind).replaceAll("_", " ")} request`,
    fields: [["Request", "kind", "text"], ["Status", "status", "status"], ["Due", "due_at", "day"], ["Completed", "completed_at", "date"], ["Logged by", "actor_label", "text"],
      ["Details", "details", "long"], ["Outcome note", "outcome_note", "long"]],
    edit: [sel("status", "Status", ["open", "completed", "denied"]), { name: "details", label: "Details", type: "textarea" }, { name: "outcome_note", label: "Outcome note", type: "textarea" }],
  },
};

export const isRecordKind = (k: string): k is RecordKind => k in recordKinds;

/** Pre-fills an edit form from a record. */
export function formDefaults(fields: FieldDef[], row: Row): FieldDef[] {
  return fields.map((f) => {
    const v = row[f.name];
    const isBool = f.options?.join() === "no,yes";
    return { ...f, defaultValue: isBool ? (v ? "yes" : "no") : f.type === "date" && typeof v === "string" ? v.slice(0, 10) : v == null ? (f.options?.[0] ?? "") : String(v) };
  });
}

/** Converts form strings back into column values. */
export function toPatch(fields: FieldDef[], values: Record<string, string>): Row {
  const out: Row = {};
  for (const f of fields) {
    const v = values[f.name] ?? "";
    if (f.options?.join() === "no,yes") out[f.name] = v === "yes";
    else if (f.type === "number") out[f.name] = v === "" ? null : Number(v);
    else out[f.name] = v === "" ? null : v;
  }
  return out;
}
