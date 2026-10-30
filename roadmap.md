# Signup
- [x] Build screenshot-inspired plan, personal, account, review and agreement screens.
- [x] Add searchable country/phone controls and discreet browser IP country detection (free provider availability varies; manual selection remains available).
- [x] Add changing six-digit confirmation, processing and front-end completion.
- [x] Test subscription rules and verify signup on desktop and mobile.

# Signup corrections
- [x] Match desktop and tablet signup to the login layout across every step.
- [x] Offer Starter $199/5 hours, Growth $499/15 hours and Scale $999/35 hours monthly, carried through review, agreements and completion.
- [x] Add country flags using a free API, without emojis.
- [x] Verify all signup steps across desktop, tablet and mobile and run the relevant tests.
# Admin CRM overhaul
- [x] Linked application, subscription and project (auto-created on signup), eight account statuses, full client profile.
- [x] Details page for every record with client strip, linked records and audit history.
- [x] Create, edit, archive/void and delete (operational records only); bulk select and actions on tables.
- [x] Removed dot separators across the admin.
- [x] Client dashboard and Stripe payments.
- [x] App emails (in-app inbox plus email outbox; sending needs a verified email domain and RESEND_API_KEY), staff permission levels, documents, global search.
# Stripe billing
- [ ] Verify every SQL migration against the live database and apply pending updates.
- [ ] Unify Stripe invoice events, reconciliation and linked subscription/application/project/task standing.
- [ ] Add secure live refresh, regression tests and a focused security review.
- [x] Stripe invoices, orders activating on payment, pause/resume/cancel, guarantee refunds, failed-payment suspension.
- [x] Overage billing, debt recovery stages, compound interest, legal and court fees, daily job.
- [x] Taskforce, Support, Billing rules pages; client dashboard; closed tickets locked.
# Client and admin flow gaps
- [x] Notifications for clients and staff (application decisions, ticket replies, extra-hour approvals, plan changes, invoices, deliverables, reports, privacy requests), with an email outbox and daily reminders.
- [x] Client sees review notes and replies to information requests; getting-started checklist and onboarding brief.
- [x] Signed agreements stored and downloadable; private file sharing on applications, tickets, projects, deliverables and reports.
- [x] Deliverable review and sign-off; client reports with metrics; hours history by month; money-back guarantee claims.
- [x] Two-factor sign-in for clients and staff, enforced in the database; optional requirement for all staff.
- [x] Admin overview, cross-account lists (invoices, collections, subscriptions, payments, projects, deliverables, reports, follow-ups, privacy), staff levels and staff page, assignment pickers, global search, message templates and client emails, support reply targets and auto-assignment.
- [x] Privacy requests fulfilled in one step (data export, closure with anonymisation).
- [ ] Schedule /api/public/cron/notifications every 10 minutes in Lovable and set RESEND_API_KEY and EMAIL_FROM once the sending domain is verified.
