# Stripe billing, Taskforce, Support, Client dashboard and debt recovery

## 1. Stripe as the single source of billing
- Use your saved Stripe restricted key on the server only. All invoices, payments, refunds, subscriptions, pauses and cancellations go through Stripe.
- A Stripe webhook keeps the CRM in sync: invoice paid / failed / voided, subscription paused / resumed / cancelled, refunds and disputes. Every event writes an audit record.
- Each client account is linked to a Stripe customer, created on first billing action.
- Invoices and transactions in the admin become read-mostly mirrors of Stripe, with links to the hosted invoice and PDF.
- The restricted key needs permissions for Customers, Products/Prices, Invoices, Subscriptions, Payment Intents, Refunds and Webhook Endpoints (read and write). I will check this first and tell you if anything is missing.

## 2. Admin-created orders
- New "Create order" on an account: pick plan, start date, notes.
- Creates application (approved), subscription (pending payment) and project (pending), plus a Stripe invoice that is emailed to the client by Stripe.
- Activation happens only when the webhook reports the invoice is paid. The 90-day guarantee starts on that date.

## 3. Hour overages
- Each plan keeps its monthly hours. When logged time pushes a period past its allowance:
  - The task is flagged "Over allowance" and the client sees a warning.
  - Extra hours are billed at a per-plan overage rate as a Stripe invoice item added to the next invoice (or invoiced immediately if staff choose).
  - Optional rule: staff must approve overage work before it is logged against a task.

## 4. Failed payments
- On a failed payment: subscription goes to Past due with a warning on the account, the client dashboard and the project.
- After Stripe's retry period ends unpaid: subscription, project and linked application are suspended automatically, each with a note and audit entry. Paying the invoice reactivates them.
- Any failed payment after the first successful one voids the 90-day guarantee, recorded with the reason.

## 5. Pause and cancel (client and admin)
- Pause, resume and cancel go through Stripe from both dashboards, with a confirmation popup.
- Pausing within the first 90 days shows a clear warning and voids the guarantee once confirmed.
- Cancel options: at period end or immediately. All logged in the audit trail.

## 6. Debt recovery and legal stages
Stages for an unpaid invoice:
```text
Due -> Overdue -> Debt recovery (flagged) -> Legal (90 days unpaid) -> Court (staff escalation) -> Settled / Written off
```
- Interest: 5% per month, compounded monthly from the due date until settled. A daily scheduled job recalculates and adds the interest to Stripe as invoice items.
- At 90 days unpaid: moved to Legal automatically, with a collection/legal fee added (default 15% of the outstanding amount, minimum $40; editable in settings).
- Court escalation (staff only): adds court fees from a fee list (filing, summons service, hearing), each editable per case.
- Each stage sends a notice email, adds a note and an audit record. Staff can pause interest, settle, agree a payment plan, or write off.

## 7. New admin pages (sidebar: Accounts, Applications, Taskforce, Support)
- **Taskforce:** all tasks across projects. List and board views (To do, In progress, Review, Done), filters by client, project, assignee, priority and due date, overdue and over-allowance flags, bulk assign/status, time logging, hours used vs available.
- **Support:** all tickets with status, priority, client, assignee and last reply. Threaded replies, internal notes, assign, merge, close. Closed tickets are locked for clients.

## 8. Client dashboard (signed-in clients)
- Overview: active plans, hours used this month, open tasks, unpaid invoices, warnings (past due, suspended, over allowance).
- Projects and tasks (view, comment, approve overage work).
- Subscriptions: pause, resume, cancel, with guarantee status.
- Applications and their status timeline.
- Billing: invoices, receipts, pay now and update card through Stripe's hosted pages.
- Support: open tickets and reply; closed tickets are read-only with no reopen or reply. This is enforced in the database too, not just hidden.
- Profile and consent settings.

## 9. Other essentials
- App emails for: invoice sent, payment failed, suspension, debt-stage notices, ticket replies.
- Settings page for overage rates, legal fee rule and court fee list.
- Tests for: interest compounding, 90-day legal trigger, fee calculation, guarantee voiding (pause within 90 days, failed payment after first success), closed-ticket lock, activation only on payment.

## Points to confirm
- The overage rate per plan (suggest $60/hour Starter, $55 Growth, $50 Scale) and whether overage needs client approval first.
- The 15% / $40 legal fee and court fee amounts are my placeholders. 5% monthly compounded interest (about 80% a year) and automatic legal fees may be unenforceable in many places; please have a lawyer confirm them and show them clearly in the client agreement.

## Technical details
- Stripe calls via server functions using `STRIPE_RESTRICTED_API_KEY`; webhook at `/api/public/stripe/webhook` with signature verification (needs a `STRIPE_WEBHOOK_SECRET`, requested after the endpoint exists).
- New columns: Stripe ids on profiles, subscriptions, invoices; invoice collection stage, interest/fee ledger table; overage rate on plans; guarantee_voided reason.
- Daily cron route for interest and stage changes, protected by a cron secret.
- RLS: clients read only their own rows; ticket reply insert blocked when ticket is closed; financial rows never deleted.
- Security audit review of the new payment and webhook boundaries after building.
