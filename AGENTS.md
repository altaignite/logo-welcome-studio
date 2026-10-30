<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

- Signup creates a real Lovable Cloud account on signature; a database trigger on new users builds the profile, application, audit event and pending subscription from signup metadata so no client writes are needed.
- Admin access is a role in user_roles granted by trigger only to verified staff-domain emails; the /admin layout gates by has_role and RLS enforces it.
- Application status changes follow the transition map in src/lib/admin.ts, and every change or note is written to application_events as the audit log.
- Keep selectable plan data, finite service-hour allowances, subscription terms and input validation in the shared signup module with concrete tests, so selection, review, downloaded agreements and completion use the same chosen plan.
- Use libphonenumber-js metadata for countries and dial codes; optional browser IP preselection must not overwrite manual choices or block signup.
- Treat displayed signature codes as local confirmation only, generated with Web Crypto and never reused within the current application, not as identity verification.
- Signup is a single centred column on every screen size (no photo panel), with minimal boxes: plain headings and dividers, cards only for plan choice.
- Agreement wording, operator details (Lanex Group, LLC), the client details table and the markup parser (headings, "|" tables, "!" notices) live in src/lib/agreements.ts (agreementDocuments(plan, client, date)); the on-screen reader (AgreementText) and the PDF (downloadAgreementPdf in src/lib/agreement-pdf.ts, logo letterhead) render the same blocks. Have agreement changes reviewed by counsel.
- Every order uses the same flow components in src/components/order-flow.tsx (PlanCards, review, AgreementsList, SignDialog): signup, /dashboard/order (client signs; orderAdditionalPlan records signed_at) and /admin/order/$userId (staff place it; client accepts by paying). No stepper bars.
- Render country flags from the free FlagCDN image API with empty alt text alongside country names and graceful image-failure fallback, so flags remain decorative rather than replacing accessible country labels.

- After every code or database change, do a focused security-audit-skill review (guidance mode) of the changed trust boundaries before finishing; the owner requires security checks on every change.
- Admin record pages are one generic route (/admin/records/$kind/$id) driven by src/lib/records.ts; add a record type there instead of writing a new page, so every table row opens a consistent details page.
- Financial and legal records (applications, subscriptions, invoices, transactions, audit) are archived or voided, never deleted; only tables listed in deletableTables in src/lib/admin.ts get DELETE policies.
- Stripe is called through the fetch-based client in src/lib/stripe.server.ts (Worker compatible, no SDK; key from STRIPE_SECRET_KEY, or the older STRIPE_RESTRICTED_API_KEY); orders check Stripe before creating local rows and cancel them if the invoice fails; Billing rules shows the Stripe setup check; billing workflows live in src/lib/billing.server.ts and pure rules in src/lib/billing.ts with tests, so the webhook, cron and server functions share one implementation.
- Local invoices and transactions mirror Stripe: the signed webhook at /api/public/stripe/webhook (idempotent via stripe_events), the daily reconcileStripe and the Stripe import (src/lib/stripe-import.server.ts) all record payments through recordInvoicePaid from verified Stripe data; never mark invoices paid from the UI.
- Interest and fees accrue in invoice_charges via the daily /api/public/cron/collections job and are billed to Stripe only when staff issue an arrears invoice, to avoid sweeping them into subscription renewals.
- Staff write access follows staff levels (owner, manager, support, billing, viewer) in src/lib/staff.ts, mirrored by public.level_grants and enforced by has_perm in RLS; every staff server function calls requirePerm from src/lib/access.server.ts because service-role writes bypass RLS. New staff start as viewers.
- Server functions use requireSession (src/lib/session.middleware.ts), never requireSupabaseAuth directly, so a session that hasn't passed its two-factor code is refused; every RLS table also carries the restrictive "two-factor session" policy (a test checks new tables).
- Notifications are written by database triggers via public.notify / notify_staff (links are in-app paths only) and emailed by the /api/public/cron/notifications job (schedule every 10 minutes; needs RESEND_API_KEY and EMAIL_FROM, optional APP_URL). Don't send email from feature code.
- Client files live in the private client-files bucket under the client's own folder; uploads and downloads go only through startFileUpload, finishFileUpload and fileLink (short-lived signed URLs), never direct storage access.
- Application events moving into a client-facing status (clientVisibleStatuses in src/lib/admin.ts) are shared with the client, note included; staff can't share anything else on the timeline.
- Signed agreements are rendered server-side from agreementDocuments in src/lib/agreements.ts and stored once, immutably, in signed_agreements; bump AGREEMENT_VERSION when the wording changes.
- Only the client decides on a deliverable (reviewDeliverable); staff send for review, withdraw or archive.
- Privacy requests are fulfilled with fulfilAccessRequest (export to the client's Documents) and fulfilDeletionRequest (anonymise and block sign-in, keeping financial and legal records).
- Account status changes go only through setAccountStatus: suspended/closed ban sign-in and end every session (revoke_user_sessions), on hold/suspended pause plans in Stripe (marked paused_by_account_status so reactivation resumes them), cancelled/closed cancel them; the restrictive "active account" policy and requireSession lock suspended and closed accounts out immediately (a test checks new tables).
- Clients never write tables directly: tickets, replies, uploads, reviews and requests go through server functions with validation and rate limits.
- Disposable email domains live in src/lib/disposable-domains.ts and are seeded into blocked_email_domains; handle_new_user and sync_profile_email refuse them on the server.
- Sign-ins are recorded once per session by requireSession (sign_in_events, Cloudflare location headers); a new location notifies the account's staff and the user.
- Subscriptions and invoices follow Stripe's live status through syncSubscriptionFromStripe (webhook and the daily reconcileStripe in /api/public/cron/collections); payments are recorded only from verified Stripe data (webhook or Stripe API). Staff can import all Stripe customers, subscriptions and invoices and force a sync from Billing rules; the admin shows a banner when a migration is missing (schemaStatus).
- Money-back guarantee rules are guaranteeCheck in src/lib/billing.ts: request after 90 days, within the next 30, no failed or late invoices, not voided, no sales.
- The client-files bucket is created on first use by ensureBucket (Lovable Cloud migrations can't create storage buckets).
- Errors: show them with ErrorState (inline, with retry) or an error popup, and use friendlyError for wording; every error popup, failed query or save, route error and unhandled rejection is reported to Lovable through reportError (src/lib/errors.ts).
- Loading: use PageSkeleton, TableSkeleton, SectionSkeleton, Spinner and AppLoader from src/components/loading.tsx, never "Loading…" text; TopProgress shows any navigation, fetch or save.
- Protected layouts use guardClient / guardStaff (src/lib/session-guard.ts): local session, cached staff check, background sign-in check. Don't add network calls to layout beforeLoad.
- Every admin list (/admin/records/$kind) creates records through the client picker; invoices and subscriptions go through Stripe server functions, and Stripe-mirrored transactions can't be created by hand.
- A subscription's status follows its invoices through applySubscriptionStanding (rules in subscriptionStanding, src/lib/billing.ts): nothing unpaid is active, overdue is past due, debt recovery/legal/court or Stripe "unpaid" is suspended (Stripe collection paused, projects on hold, application suspended), and a new order whose first invoice is voided is cancelled. Call it after any invoice change; the daily sync re-checks every plan.
- Rate limits: every server function uses limited("<name>") from src/lib/session.middleware.ts with a rule in src/lib/limits.ts (a test checks every function), on top of the per-user request limit in requireSession; counts live in rate_limit_hits via hit_rate_limit (service role only).
- Buttons are black (Button default variant and .signup-primary, including hover); red is only for destructive actions. Text actions use foreground with underline, not the red brand colour.
- Mobile numbers are stored and validated in international format; the input next to the dial-code picker shows only the national part (phoneNational in src/lib/signup.ts), so the dial code appears once.
- Agreements include the Collections and Debt Recovery Policy and the Service and Account Policy, generated from the real rules (billing defaults or live billing_settings, support departments and response times, account statuses, file limits); keep them in step when those rules change.
- One account per client, many plans: a signed-in user choosing a plan on /signup goes to /dashboard/order?plan=…; a signup whose email already exists (Supabase returns a user with no identities and creates nothing) is sent to sign in with ?plan=…, which continues to /dashboard/order after sign-in and two-factor.
