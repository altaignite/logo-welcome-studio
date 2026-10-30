/** Support ticket statuses and response-time targets shared by the support pages and the daily reminders. */
export const ticketStatuses = ["open", "in_progress", "waiting_on_client", "closed"] as const;
export type TicketStatus = (typeof ticketStatuses)[number];
export const ticketStatusLabel: Record<TicketStatus, string> = { open: "Open", in_progress: "In progress", waiting_on_client: "Waiting on client", closed: "Closed" };

/** Hours until the first staff reply is due, by priority. */
export const firstResponseHours: Record<string, number> = { urgent: 2, high: 8, normal: 24, low: 72 };
/** Share of the target left when a ticket counts as due soon. */
const DUE_SOON = 0.25;

export type SlaState = "met" | "on_track" | "due_soon" | "breached" | "none";
type TicketLike = { status: string; priority: string; created_at: string; first_response_at: string | null; last_client_message_at?: string | null; last_staff_message_at?: string | null };

/** The reply the team owes next: the first response, or an answer to the client's latest message. */
export function replyDueAt(t: TicketLike): Date | null {
  if (t.status === "closed" || t.status === "waiting_on_client") return null;
  const hours = firstResponseHours[t.priority] ?? firstResponseHours["normal"]!;
  if (!t.first_response_at) return new Date(new Date(t.created_at).getTime() + hours * 36e5);
  const client = t.last_client_message_at ? new Date(t.last_client_message_at) : null;
  const staff = t.last_staff_message_at ? new Date(t.last_staff_message_at) : null;
  if (client && (!staff || client > staff)) return new Date(client.getTime() + hours * 36e5);
  return null;
}

export function slaState(t: TicketLike, now = new Date()): SlaState {
  if (t.status === "closed") return t.first_response_at ? "met" : "none";
  const due = replyDueAt(t);
  if (!due) return t.first_response_at ? "met" : "none";
  const hours = firstResponseHours[t.priority] ?? firstResponseHours["normal"]!;
  const left = due.getTime() - now.getTime();
  if (left < 0) return "breached";
  return left <= hours * 36e5 * DUE_SOON ? "due_soon" : "on_track";
}
export const slaLabel: Record<SlaState, string> = { met: "Answered", on_track: "On track", due_soon: "Reply due soon", breached: "Overdue reply", none: "—" };

/** Departments clients choose when they open a ticket. Each maps to the older category field for existing views. */
export const departments = [
  { id: "account", label: "Account management", help: "Your plan, onboarding, strategy and general questions.", category: "general" },
  { id: "billing", label: "Billing and payments", help: "Invoices, payments, refunds and the money-back guarantee.", category: "billing" },
  { id: "technical", label: "Technical support", help: "Websites, hosting, email, tracking and anything not working.", category: "technical" },
  { id: "projects", label: "Projects and design", help: "Work in progress, deliverables, changes and deadlines.", category: "project" },
  { id: "marketing", label: "Marketing and ads", help: "Campaigns, social media, ads and results.", category: "general" },
  { id: "complaints", label: "Complaints", help: "Something went wrong and you'd like it reviewed.", category: "complaint" },
] as const;
export type DepartmentId = (typeof departments)[number]["id"];
/** Staff-only department for automatic security and KYC reviews (not offered to clients). */
export const securityDepartment = { id: "security", label: "Security and KYC" } as const;
export const departmentLabel = (id: string) => (id === securityDepartment.id ? securityDepartment.label : departments.find((d) => d.id === id)?.label ?? id);
export const clientPriorities = [
  { id: "low", label: "Low", help: "A question or idea, no rush." },
  { id: "normal", label: "Normal", help: "Needs an answer within a day." },
  { id: "high", label: "High", help: "Affecting your work or customers." },
  { id: "urgent", label: "Urgent", help: "Your site or campaigns are down." },
] as const;
export const contactPreferences = [
  { id: "dashboard", label: "Reply in my dashboard" }, { id: "email", label: "Email me" }, { id: "phone", label: "Call me" },
] as const;
