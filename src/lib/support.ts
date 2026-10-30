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
