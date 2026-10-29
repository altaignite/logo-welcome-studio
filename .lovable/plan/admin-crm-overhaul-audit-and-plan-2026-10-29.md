# Admin CRM overhaul: audit and plan

## Audit: what's wrong today
1. **Generic statuses.** The account status is just active/suspended/closed, and it sits apart from the lifecycle stage. Status badges also reuse the same few colours everywhere.
2. **Profile assumes one subscription.** The summary cards ("Starter · active") pick the first application and subscription only. They break once a client has several orders.
3. **Application detail is cut off.** It shows no profile, subscriptions, projects, invoices or payments, and only links back through the account number.
4. **CRUD is partial.** Many records can be added but not edited, archived or opened. Applications can only change status.
5. **No detail pages.** Table rows for subscriptions, projects, invoices, transactions, tickets, activities and privacy requests don't open anything.
6. **Nothing links together.** Applications, subscriptions and projects have no connection in the data. Signup creates no project.
7. **"·" separators** appear throughout the admin.
8. **No bulk actions.** Tables have no checkboxes, no select-all and no actions for several records at once.

## Also missing for a full CRM and business
- **Contacts:** a client can have only one contact person, and there are no billing or technical contacts.
- **Tasks and follow-ups:** follow-up dates exist on activities, but there's no task list, owner, due-today view or overdue flag.
- **Documents:** no stored signed agreements, attachments on tickets or projects, or invoice PDFs.
- **90-day money-back guarantee:** no record of the guarantee window per subscription, no claim tracking and no "sales received" evidence.
- **Billing:** no tax/VAT number, invoice line items, credit notes or automatic monthly invoice on renewal. There's also no real payment provider.
- **Hours:** no overage warning, monthly reset on renewal, or rollover rule.
- **Staff:** no staff list, permission levels (owner, manager, specialist) or assignment of staff to accounts and projects. There's also no two-step sign-in for staff.
- **Client side:** clients can sign in, but there's no client portal to see their subscription, hours, invoices or tickets. There's also no password reset.
- **Notifications:** no emails to clients on approval, rejection, an info request or an invoice. No staff alerts either.
- **Overview:** no dashboard with recurring revenue, open applications, overdue invoices, hours used or tickets waiting. No global search across all records.
- **Legal records:** no signed agreement version stored per application. There are also no consent change history, a retention/erasure workflow tied to legal hold, or time-stamped acceptance evidence. These need confirming with counsel.

## What I'll build (this pass)

### Linked data model
```text
Account (client profile)
 ├─ Contacts
 ├─ Applications ── each creates ──> Subscription ── has ──> Project(s)
 │                                      ├─ hours, renewals, guarantee window
 │                                      ├─ time entries
 │                                      └─ invoices -> transactions
 ├─ Tickets, Activities, Tasks, Privacy requests
 └─ Audit log
```
- Signup creates the application, a pending subscription linked to it and a project named after the business, all linked together.
- Approving the application activates the subscription and starts the project and the 90-day guarantee window.

### Account statuses
- A single clear status set: Prospect, Onboarding, Active, Past due, On hold, Suspended, Cancelled and Closed.
- Each status gets its own badge colour.
- Lifecycle stage stays as a separate sales field.

### Account profile page
- The top cards show totals instead of one plan: active subscriptions, monthly fees, hours used out of total, open balance and open tickets.
- Full profile sections: company and legal details, tax number, contacts, address, consent and status history.
- Tabs: Overview, Contacts, Applications, Subscriptions, Projects, Invoices, Transactions, Tickets, Activities, Tasks, Privacy and Audit.

### A details page for every record
- Applications, subscriptions, projects, invoices, transactions, tickets, activities, tasks and privacy requests each get their own page.
- Every detail page shows a header with the client's name and a link back to their profile.
- Every detail page lists its linked records, such as an invoice's payments or a subscription's projects.
- Every detail page has its own audit history.
- The application page adds a client panel and its linked subscription, project, invoices and transactions.

### Full create, edit and delete everywhere
- Create and edit forms for every record type.
- Delete for operational records: contacts, tasks, activities and notes.
- Financial and legal records (invoices, transactions, applications, audit) are voided or archived instead of deleted. This keeps the legal trail.
- Applications can be edited (plan, assignee, details) as well as moved through the workflow.

### Subscriptions as the project hub
- From a subscription you can see and change the plan and hours, renew, pause, cancel and log time.
- You can also manage its projects and track the guarantee window with claim status.

### Bulk actions
- Every table gets checkboxes and select-all for the filtered rows.
- Each table has its own actions: assign, change status, export the selection, archive or void. Each action asks for confirmation in the shared popup style.

### Styling rule
- Every "·" separator is removed. Values are split with spacing, labels or stacked lines instead.

## Questions before I start
- **Navigation:** should the sidebar stay at only Accounts and Applications, with subscriptions and projects reached through accounts? Or should I add Subscriptions as a third item?
- **Second pass:** the client portal, emails, real payments and staff permission levels are large features. Should I leave them for a second pass?

## Technical details
- Additive database changes:
  - Expand the account status values.
  - Add `application_id` to subscriptions and `subscription_id` to projects.
  - Add new `contacts` and `tasks` tables.
  - Add archive and void columns.
  - Add guarantee fields to subscriptions.
  - Update the signup trigger to create the linked project.
  - Add DELETE policies for operational tables only. All new tables get grants, RLS and admin-only policies via `has_role`.
- New routes: `admin.subscriptions.$id`, `admin.projects.$id`, `admin.invoices.$id`, `admin.transactions.$id`, `admin.tickets.$id`, `admin.activities.$id`, `admin.tasks.$id`, `admin.compliance.$id`.
- Split the large account page into tab components.
- Add row selection and a bulk action bar to `DataTable`.
- Add tests for the status map, bulk-action rules, the void/archive rules and the signup trigger linkage.
- Run a security review of all new policies and the server function.
