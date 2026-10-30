/** Privacy request rules. Financial and legal records are retained after an account is closed; personal details are anonymised. */

/** Reasons an account can't be closed and anonymised yet. Empty when it can. */
export function deletionBlockers(o: { legal_hold: boolean; invoices: { status: string }[]; subs: { status: string; cancel_at_period_end?: boolean | null }[] }) {
  const out: string[] = [];
  if (o.legal_hold) out.push("The account is on legal hold.");
  if (o.invoices.some((i) => i.status === "open" || i.status === "overdue")) out.push("There are unpaid invoices. Settle, void or write them off first.");
  if (o.subs.some((s) => !["cancelled"].includes(s.status))) out.push("Every plan must be cancelled first.");
  return out;
}

/** Profile changes that remove personal details while keeping the account number for retained billing records. */
export function anonymisedProfile(accountNumber: string, now = new Date()) {
  return {
    first_name: "Deleted", last_name: "client", company: null, legal_name: null, phone: null, email: deletedEmail(accountNumber),
    address_line: null, city: null, state: null, postal_code: null, website: null, timezone: null, industry: null, company_size: null,
    tax_id: null, internal_notes: null, lead_source: null, account_manager: null,
    marketing_opt_in: false, sms_opt_in: false, do_not_sell: true, email_notifications: false,
    status: "closed", status_reason: "Closed and anonymised at the client's request", status_changed_at: now.toISOString(), updated_at: now.toISOString(),
  };
}
export const deletedEmail = (accountNumber: string) => `deleted-${accountNumber}@deleted.invalid`;

/** Tables exported for an access request, with columns that are staff-only left out. */
export const exportTables: { table: string; omit?: string[]; filter?: Record<string, unknown> }[] = [
  { table: "applications", omit: ["internal_notes", "assigned_to"] },
  { table: "subscriptions", omit: ["notes", "stripe_subscription_id"] },
  { table: "projects", omit: ["assigned_to"] },
  { table: "tasks", omit: ["assigned_to"] },
  { table: "deliverables", omit: ["assigned_to"] },
  { table: "time_entries" },
  { table: "invoices", omit: ["collection_notes", "stripe_invoice_id"] },
  { table: "transactions", omit: ["stripe_id"] },
  { table: "support_tickets", omit: ["assigned_to"] },
  { table: "ticket_messages", filter: { internal: false } },
  { table: "client_reports" },
  { table: "documents", omit: ["storage_path"] },
  { table: "signed_agreements" },
  { table: "compliance_requests" },
  { table: "notifications", omit: ["email_to"] },
];
export const profileExportOmit = ["internal_notes", "account_manager", "lead_source", "stripe_customer_id", "legal_hold"];

export const omit = <T extends Record<string, unknown>>(row: T, keys: string[] = []) => Object.fromEntries(Object.entries(row).filter(([k]) => !keys.includes(k)));
