# Client portal overhaul, password reset and hardening

## What changes for clients

1. **Proper portal layout** matching the admin: sidebar on desktop/tablet (Overview, Subscriptions, Projects, Tasks, Invoices, Payments, Applications, Support, Profile, Security), bottom-sheet menu on mobile, same header with logo and separator.
2. **Every table gets an Actions column** (View plus context actions such as Pay, Download PDF, Pause, Reply, Approve hours) and every row opens a **details page**.
3. **Details pages** for subscription, project, task, invoice, payment, application and support ticket, each showing linked records (e.g. subscription shows its project, tasks, hours log, invoices, payments and tickets) and a history timeline.
4. **Multiple subscriptions managed fully**: list with plan, status, hours bar and renewal per plan; per-subscription page to pause, resume, cancel at period end, undo a scheduled cancel, change plan (upgrade now / downgrade at renewal, through Stripe), approve extra hours, see guarantee status, and **order an additional plan** (creates a Stripe invoice; activates on payment, like admin orders).
5. **Overview** rebuilt: per-plan hours, upcoming renewals, amount due with Pay now, open tasks awaiting approval, latest ticket replies, warnings.
6. **Profile management**: clients edit name, phone, address, business details, timezone and marketing/SMS choices directly (account number, email and legal fields stay staff-controlled); request data export or account closure (feeds the existing compliance requests).
7. **Security page**: change password (asks current password), change email (confirmation link), sign out of all devices.

## Password and sign-in

- **Forgot password** on the login and staff login: enter email, receive a reset link, shown result in the shared popup.
- **Reset password page** to set a new password (strength rules, confirm field).
- Leaked-password protection turned on, and a minimum password strength enforced at signup and reset.
- Suspended or closed accounts get a clear popup on sign-in instead of a generic error.

## Security and best practices

- Client edits go through a protected server action that only allows the safe profile fields; database rules stop clients changing status, account number, notes or anyone else's data.
- Clients can only see their own records on every new page; staff-only notes and internal ticket messages never reach the portal.
- Input limits and validation on every client form; plan changes and orders validated on the server against the official plan list.
- Moving the portal under the standard signed-in area so refreshes don't flash or loop.
- Focused security review of all changed boundaries, then a scan.

## Out of scope (need your go-ahead or setup)

- App emails beyond Stripe and sign-in emails (needs an email domain).
- Two-factor sign-in, documents/file sharing, staff permission levels, global search.

## Technical details

- Routes: `_authenticated/dashboard/*` layout with leaf routes per section and `dashboard/$kind/$id` generic client record page driven by a client-side config (mirroring `src/lib/records.ts`), redirect from old `/dashboard`.
- `/forgot-password` (public) and `/reset-password` (public) routes; `resetPasswordForEmail` with `redirectTo` origin + `/reset-password`; `updateUser({ password, current_password })` on Security page.
- New server fns in `src/lib/client.functions.ts` with `requireSupabaseAuth`: `updateMyProfile` (zod whitelist), `changePlan`, `orderAdditionalPlan`, `undoCancel`; reuse `billing.server.ts`.
- Migration: column-level guard trigger on `profiles` blocking non-staff changes to protected columns; no new delete policies.
- Tests: profile field whitelist, plan change proration rule (upgrade immediate, downgrade at renewal), password strength rule.
