/** Imports clients, subscriptions, invoices and payments from Stripe, and links what already exists. Server only.
 * Runs a page of customers at a time so it fits in a request; the admin page calls it until there are no more pages. */
import { stripe } from "@/lib/stripe.server";
import { invoiceKind, localInvoiceStatus, localSubscriptionStatus, planFromStripe } from "@/lib/billing";
import { must, recordInvoicePaid, syncSubscriptionFromStripe } from "@/lib/billing.server";
import { GUARANTEE_CLAIM_DAYS, GUARANTEE_DAYS } from "@/lib/admin";

type Admin = any;
export type ImportCounts = { customers: number; clientsCreated: number; clientsLinked: number; subscriptions: number; invoices: number; payments: number; skipped: string[] };
const empty = (): ImportCounts => ({ customers: 0, clientsCreated: 0, clientsLinked: 0, subscriptions: 0, invoices: 0, payments: 0, skipped: [] });

/** Finds or creates the client for a Stripe customer and links it. Returns the profile id or null when it can't be imported. */
async function clientFor(admin: Admin, c: any, counts: ImportCounts): Promise<string | null> {
  const linked = must(await admin.from("profiles").select("id").eq("stripe_customer_id", c.id).maybeSingle());
  if (linked) return linked.id;
  const email = String(c.email ?? "").trim().toLowerCase();
  if (!email) { counts.skipped.push(`${c.name ?? c.id}: no email in Stripe`); return null; }
  // Never create or link staff accounts from Stripe data.
  if (/@firstpersonmarketing\.com$/i.test(email)) { counts.skipped.push(`${email}: staff email`); return null; }
  const byEmail = must(await admin.from("profiles").select("id, stripe_customer_id").ilike("email", email).maybeSingle());
  if (byEmail) {
    if (byEmail.stripe_customer_id && byEmail.stripe_customer_id !== c.id) { counts.skipped.push(`${email}: already linked to another Stripe customer`); return null; }
    must(await admin.from("profiles").update({ stripe_customer_id: c.id }).eq("id", byEmail.id));
    counts.clientsLinked++;
    return byEmail.id;
  }
  const [first, ...rest] = String(c.name ?? "").trim().split(/\s+/);
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  // A confirmed account without a password; the client signs in with "Forgot password" (or staff send a reset email).
  const made = await supabaseAdmin.auth.admin.createUser({ email, email_confirm: true, user_metadata: { first_name: first || null, last_name: rest.join(" ") || null, company: c.metadata?.company ?? null, phone: c.phone ?? null } });
  if (made.error || !made.data.user) { counts.skipped.push(`${email}: ${/disposable|database error/i.test(made.error?.message ?? "") ? "email not allowed" : made.error?.message ?? "couldn't create the account"}`); return null; }
  const a = c.address ?? {};
  must(await admin.from("profiles").update({ stripe_customer_id: c.id, status: "active", lifecycle_stage: "active", lead_source: "Stripe import", phone: c.phone ?? null,
    address_line: [a.line1, a.line2].filter(Boolean).join(", ") || null, city: a.city ?? null, state: a.state ?? null, postal_code: a.postal_code ?? null, country: a.country ?? null }).eq("id", made.data.user.id));
  counts.clientsCreated++;
  return made.data.user.id;
}

async function importSubscription(admin: Admin, userId: string, s: any, counts: ImportCounts) {
  const existing = must(await admin.from("subscriptions").select("id").eq("stripe_subscription_id", s.id).maybeSingle())
    ?? (s.metadata?.subscription_id ? must(await admin.from("subscriptions").select("id").eq("id", s.metadata.subscription_id).maybeSingle()) : null);
  if (existing) { await syncSubscriptionFromStripe(admin, existing.id, s); counts.subscriptions++; return; }
  const item = s.items?.data?.[0];
  const product = typeof item?.price?.product === "string" ? await stripe("GET", `products/${item.price.product}`).catch(() => null) : item?.price?.product;
  const { plans } = await import("@/lib/signup");
  const plan = planFromStripe(item?.price?.unit_amount, product?.name, plans);
  const started = s.start_date ? new Date(s.start_date * 1000) : new Date();
  const opens = new Date(started.getTime() + GUARANTEE_DAYS * 864e5);
  const closes = new Date(opens.getTime() + GUARANTEE_CLAIM_DAYS * 864e5);
  const status = localSubscriptionStatus(s);
  const periodEnd = s.current_period_end ?? item?.current_period_end;
  const row = must(await admin.from("subscriptions").insert({
    user_id: userId, plan_name: plan.plan_name, monthly_fee: plan.monthly_fee, monthly_hours: plan.monthly_hours, status, stripe_subscription_id: s.id, stripe_status: s.status,
    started_at: started.toISOString(), first_paid_at: started.toISOString(), renews_at: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
    current_period_end: periodEnd ? new Date(periodEnd * 1000).toISOString() : null, cancel_at_period_end: !!s.cancel_at_period_end,
    cancelled_at: s.canceled_at ? new Date(s.canceled_at * 1000).toISOString() : null, stripe_synced_at: new Date().toISOString(),
    guarantee_ends_at: opens.toISOString(), guarantee_status: new Date() > closes ? "expired" : "running",
    notes: `Imported from Stripe${plan.custom ? ". Custom plan: set the monthly hours" : ""}`,
  }).select("id").single());
  must(await admin.from("projects").insert({ user_id: userId, subscription_id: row.id, name: `${plan.plan_name} plan`, service: "Marketing", status: status === "active" ? "active" : status === "cancelled" ? "cancelled" : "on_hold", description: "Imported from Stripe" }));
  counts.subscriptions++;
}

/** Creates or updates the local copy of a Stripe invoice and records its payment. Exported for the daily sync. */
export async function importInvoice(admin: Admin, userId: string, o: any, counts?: ImportCounts) {
  const status = localInvoiceStatus(o);
  if (!status || !(o.total ?? o.amount_due)) return;
  const subStripe = o.subscription ?? o.parent?.subscription_details?.subscription ?? null;
  const subId = subStripe ? must(await admin.from("subscriptions").select("id").eq("stripe_subscription_id", typeof subStripe === "string" ? subStripe : subStripe.id).maybeSingle())?.id ?? null : (o.metadata?.subscription_id ?? null);
  const fields = {
    number: o.number ?? o.id, amount: (o.total ?? o.amount_due) / 100, description: o.description ?? o.lines?.data?.[0]?.description ?? "Service fee",
    due_at: o.due_date ? new Date(o.due_date * 1000).toISOString().slice(0, 10) : new Date((o.created ?? Date.now() / 1000) * 1000).toISOString().slice(0, 10),
    hosted_url: o.hosted_invoice_url, pdf_url: o.invoice_pdf, stripe_status: o.status, stripe_synced_at: new Date().toISOString(),
    ...(o.attempt_count > 0 && o.status !== "paid" ? { failed_payment_at: new Date().toISOString() } : {}),
  };
  let inv = must(await admin.from("invoices").select("*").eq("stripe_invoice_id", o.id).maybeSingle());
  if (!inv) {
    inv = must(await admin.from("invoices").insert({ user_id: userId, subscription_id: subId, kind: invoiceKind(o), stripe_invoice_id: o.id, ...fields,
      status: status === "paid" ? "open" : status, issued_at: new Date((o.created ?? Date.now() / 1000) * 1000).toISOString().slice(0, 10) }).select("*").single());
  } else {
    must(await admin.from("invoices").update({ ...fields, ...(status !== "paid" && inv.status !== status && inv.status !== "paid" ? { status } : {}) }).eq("id", inv.id));
  }
  if (counts) counts.invoices++;
  if (status === "paid" && inv.status !== "paid") {
    await recordInvoicePaid(admin, inv, o, typeof o.payment_intent === "string" ? o.payment_intent : o.payment_intent?.id ?? null);
    if (counts) counts.payments++;
  }
}

/** Imports one page of Stripe customers with all their subscriptions and invoices. */
export async function importStripePage(admin: Admin, startingAfter?: string) {
  const counts = empty();
  const page = await stripe("GET", "customers", { limit: 20, ...(startingAfter ? { starting_after: startingAfter } : {}) });
  for (const c of page.data ?? []) {
    if (c.deleted) continue;
    counts.customers++;
    try {
      const userId = await clientFor(admin, c, counts);
      if (!userId) continue;
      const subs = await stripe("GET", "subscriptions", { customer: c.id, status: "all", limit: 100 });
      for (const s of subs.data ?? []) await importSubscription(admin, userId, s, counts);
      let after: string | undefined;
      for (let i = 0; i < 10; i++) {
        const invs = await stripe("GET", "invoices", { customer: c.id, limit: 100, ...(after ? { starting_after: after } : {}) });
        for (const o of invs.data ?? []) await importInvoice(admin, userId, o, counts);
        if (!invs.has_more) break;
        after = invs.data[invs.data.length - 1].id;
      }
    } catch (e) { counts.skipped.push(`${c.email ?? c.id}: ${(e as Error).message}`); }
  }
  const last = page.data?.[page.data.length - 1]?.id as string | undefined;
  return { counts, next: page.has_more && last ? last : null };
}
