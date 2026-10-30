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
- Keep every signup stage inside the same login-inspired split layout, with the shared cinematic photo on tablet and desktop, to preserve visual continuity.
- Render country flags from the free FlagCDN image API with empty alt text alongside country names and graceful image-failure fallback, so flags remain decorative rather than replacing accessible country labels.

- After every code or database change, do a focused security-audit-skill review (guidance mode) of the changed trust boundaries before finishing; the owner requires security checks on every change.
- Admin record pages are one generic route (/admin/records/$kind/$id) driven by src/lib/records.ts; add a record type there instead of writing a new page, so every table row opens a consistent details page.
- Financial and legal records (applications, subscriptions, invoices, transactions, audit) are archived or voided, never deleted; only tables listed in deletableTables in src/lib/admin.ts get DELETE policies.
- Stripe is called through the fetch-based client in src/lib/stripe.server.ts (Worker compatible, no SDK); billing workflows live in src/lib/billing.server.ts and pure rules in src/lib/billing.ts with tests, so the webhook, cron and server functions share one implementation.
- Local invoices and transactions mirror Stripe and are updated by the signed webhook at /api/public/stripe/webhook (idempotent via stripe_events); never mark invoices paid from the UI.
- Interest and fees accrue in invoice_charges via the daily /api/public/cron/collections job and are billed to Stripe only when staff issue an arrears invoice, to avoid sweeping them into subscription renewals.
- Staff write access follows staff levels (owner, manager, support, billing, viewer) in src/lib/staff.ts, mirrored by public.level_grants and enforced by has_perm in RLS; every staff server function calls requirePerm from src/lib/access.server.ts because service-role writes bypass RLS. New staff start as viewers.
- Server functions use requireSession (src/lib/session.middleware.ts), never requireSupabaseAuth directly, so a session that hasn't passed its two-factor code is refused; every RLS table also carries the restrictive "two-factor session" policy (a test checks new tables).
- Notifications are written by database triggers via public.notify / notify_staff (links are in-app paths only) and emailed by the /api/public/cron/notifications job (schedule every 10 minutes; needs RESEND_API_KEY and EMAIL_FROM, optional APP_URL). Don't send email from feature code.
- Client files live in the private client-files bucket under the client's own folder; uploads and downloads go only through startFileUpload, finishFileUpload and fileLink (short-lived signed URLs), never direct storage access.
- Application events moving into a client-facing status (clientVisibleStatuses in src/lib/admin.ts) are shared with the client, note included; staff can't share anything else on the timeline.
- Signed agreements are rendered server-side from agreementDocuments in src/lib/signup.ts and stored once, immutably, in signed_agreements; bump AGREEMENT_VERSION when the wording changes.
- Only the client decides on a deliverable (reviewDeliverable); staff send for review, withdraw or archive.
- Privacy requests are fulfilled with fulfilAccessRequest (export to the client's Documents) and fulfilDeletionRequest (anonymise and block sign-in, keeping financial and legal records).
