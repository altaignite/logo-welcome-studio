/** Saved payment cards, shared by the client dashboard and the staff tools. Card numbers never reach our servers: new cards are
 * entered in Stripe's own form (SetupIntent), and we only ever see Stripe's card summary (brand, last 4, expiry). Every function
 * takes the account id and checks that the card belongs to that account's Stripe customer before acting. Server only. */
import { ensureCustomer, stripe, audit } from "@/lib/stripe.server";
import { cardExpiry } from "@/lib/cards";
import { applyDefaultCard, applySubscriptionStanding, must, stripePublishableKey } from "@/lib/billing.server";

type Admin = any;

export type SavedCard = { id: string; brand: string; last4: string; expMonth: number; expYear: number; isDefault: boolean; expired: boolean; expiresSoon: boolean; plans: string[] };

const idOf = (v: any): string | null => (typeof v === "string" ? v : v?.id ?? null);
const RUNNING = ["active", "past_due", "trialing", "unpaid", "paused"];

/** Cards on the account, the default first, with the plans each one pays for. */
export async function listCards(admin: Admin, userId: string, now = new Date()): Promise<SavedCard[]> {
  const customer = await ensureCustomer(admin, userId);
  const [pms, cust, subs] = await Promise.all([
    stripe("GET", "payment_methods", { customer, type: "card", limit: 20 }),
    stripe("GET", `customers/${customer}`),
    stripe("GET", "subscriptions", { customer, status: "all", limit: 100 }),
  ]);
  const local = must(await admin.from("subscriptions").select("plan_name, stripe_subscription_id").eq("user_id", userId).not("stripe_subscription_id", "is", null)) ?? [];
  const planOf = (sid: string) => local.find((l: any) => l.stripe_subscription_id === sid)?.plan_name ?? "Plan";
  const def = idOf(cust.invoice_settings?.default_payment_method);
  return (pms.data ?? []).map((pm: any) => {
    const c = pm.card ?? {};
    return {
      id: pm.id, brand: String(c.display_brand ?? c.brand ?? "card"), last4: String(c.last4 ?? ""), expMonth: Number(c.exp_month), expYear: Number(c.exp_year),
      isDefault: pm.id === def, ...cardExpiry(Number(c.exp_month), Number(c.exp_year), now),
      plans: (subs.data ?? []).filter((s: any) => RUNNING.includes(s.status) && idOf(s.default_payment_method) === pm.id).map((s: any) => planOf(s.id)),
    };
  }).sort((a: SavedCard, b: SavedCard) => Number(b.isDefault) - Number(a.isDefault));
}

/** Loads a card and refuses it unless it's attached to this account's Stripe customer. */
async function ownCard(admin: Admin, userId: string, paymentMethodId: string) {
  if (!/^pm_[A-Za-z0-9]+$/.test(paymentMethodId)) throw new Error("Card not found.");
  const customer = await ensureCustomer(admin, userId);
  const pm = await stripe("GET", `payment_methods/${paymentMethodId}`).catch(() => null);
  if (!pm || idOf(pm.customer) !== customer) throw new Error("Card not found.");
  return { customer, pm };
}

/** Stripe's form for adding a card: a SetupIntent saving the card for automatic charges (off_session). */
export async function startCardSetup(admin: Admin, userId: string) {
  const customer = await ensureCustomer(admin, userId);
  const si = await stripe("POST", "setup_intents", { customer, usage: "off_session", "payment_method_types[]": "card", "metadata[user_id]": userId });
  return { clientSecret: si.client_secret as string, publishableKey: await stripePublishableKey(admin) };
}

/** Makes a card the default for the account and every running plan, so renewals and new charges use it. */
export async function setDefaultCard(admin: Admin, userId: string, paymentMethodId: string, actor: { id: string | null; label: string }) {
  const { customer, pm } = await ownCard(admin, userId, paymentMethodId);
  await stripe("POST", `customers/${customer}`, { "invoice_settings[default_payment_method]": pm.id });
  const plans = await applyDefaultCard(customer, pm.id);
  await audit(admin, userId, "payment_methods", userId, "default_card_changed", { card: `${pm.card?.brand ?? "card"} ${pm.card?.last4 ?? ""}`, plans }, actor.id, actor.label);
  return { plans };
}

/** Removes a card. A card paying for running plans can only go once another card takes over: the next card is made the default
 * first, and with no other card the removal is refused (renewals would otherwise fail). */
export async function removeCard(admin: Admin, userId: string, paymentMethodId: string, actor: { id: string | null; label: string }) {
  const { customer, pm } = await ownCard(admin, userId, paymentMethodId);
  const cards = await listCards(admin, userId);
  const card = cards.find((c) => c.id === pm.id);
  if (card && (card.isDefault || card.plans.length)) {
    const next = cards.find((c) => c.id !== pm.id && !c.expired);
    const running = (await stripe("GET", "subscriptions", { customer, status: "all", limit: 100 })).data?.some((s: any) => RUNNING.includes(s.status) && s.collection_method === "charge_automatically");
    if (!next && running) throw new Error("This card pays for your plans. Add another card first, then remove this one.");
    if (next) await setDefaultCard(admin, userId, next.id, actor);
  }
  await stripe("POST", `payment_methods/${pm.id}/detach`);
  await audit(admin, userId, "payment_methods", userId, "card_removed", { card: `${pm.card?.brand ?? "card"} ${pm.card?.last4 ?? ""}` }, actor.id, actor.label);
  return { ok: true };
}

/** An open invoice of this account, with its Stripe copy. */
async function ownOpenInvoice(admin: Admin, userId: string, invoiceId: string) {
  const inv = must(await admin.from("invoices").select("*").eq("id", invoiceId).maybeSingle());
  if (!inv || inv.user_id !== userId) throw new Error("Invoice not found.");
  if (!inv.stripe_invoice_id) throw new Error("This invoice isn't in Stripe, so it can't be charged.");
  const live = await stripe("GET", `invoices/${inv.stripe_invoice_id}`);
  if (live.status !== "open") throw new Error(live.status === "paid" ? "This invoice is already paid." : "Only open invoices can be charged.");
  return { inv, live };
}

export type ChargeResult = { status: "paid" | "processing" | "needs_authentication" | "failed"; message: string; payUrl: string | null };

/** Staff charge a saved card for an open invoice, without the client present (off_session). Stripe decides: paid (recorded by the
 * signed webhook, as always), declined, or the bank wants the cardholder to confirm (3-D Secure), in which case the client is sent
 * the invoice to pay themselves. One attempt per invoice and card per minute, so a double click can't charge twice. */
export async function chargeInvoice(admin: Admin, userId: string, invoiceId: string, paymentMethodId: string, actor: { id: string; label: string }): Promise<ChargeResult> {
  const { inv, live } = await ownOpenInvoice(admin, userId, invoiceId);
  const { pm } = await ownCard(admin, userId, paymentMethodId);
  const card = `${pm.card?.brand ?? "card"} ending ${pm.card?.last4 ?? ""}`;
  let result: ChargeResult;
  try {
    const paid = await stripe("POST", `invoices/${live.id}/pay`, { payment_method: pm.id, off_session: true }, `staff-pay-${live.id}-${pm.id}-${Math.floor(Date.now() / 60000)}`);
    result = paid.status === "paid" ? { status: "paid", message: `Charged ${card}. The invoice is marked paid as soon as Stripe confirms it.`, payUrl: null }
      : { status: "processing", message: `The payment on ${card} is processing. The invoice updates when the bank confirms.`, payUrl: null };
  } catch (e) {
    const msg = (e as Error).message;
    const auth = /authenticat|action_required|requires_action/i.test(msg);
    result = auth
      ? { status: "needs_authentication", message: `The bank wants the cardholder to confirm this payment, so it can't be charged without them. We've sent the client the invoice to pay.`, payUrl: live.hosted_invoice_url ?? null }
      : { status: "failed", message: msg.replace(/^Stripe couldn't complete this: /, "The card was declined: "), payUrl: live.hosted_invoice_url ?? null };
    if (auth) must(await admin.rpc("notify", { _user: userId, _kind: "invoice", _title: `Please confirm your payment for invoice ${inv.number}`, _body: "Your bank asked you to confirm this payment. Open the invoice to pay it with your card.", _link: `/dashboard/invoice/${inv.id}`, _email: true, _dedupe: `confirm-pay:${inv.id}` }));
  }
  await audit(admin, userId, "invoices", inv.id, "staff_card_charge", { card, outcome: result.status, amount: Number(live.amount_remaining ?? 0) / 100 }, actor.id, actor.label);
  if (inv.subscription_id && result.status !== "paid") await applySubscriptionStanding(admin, inv.subscription_id, `Card charge ${result.status}`, actor.label);
  return result;
}

/** Staff ask the client to add or replace a card (for example after a decline or an expiry); the client gets an in-app and email
 * notification linking to their payment cards. Staff never type card numbers. */
export async function requestNewCard(admin: Admin, userId: string, note: string | null, actor: { id: string; label: string }) {
  must(await admin.rpc("notify", { _user: userId, _kind: "invoice", _title: "Please update your payment card", _body: note || "Add a new card in your dashboard so your plans keep running without interruption.", _link: "/dashboard/invoices", _email: true, _dedupe: `card-request:${userId}:${new Date().toISOString().slice(0, 10)}` }));
  await audit(admin, userId, "payment_methods", userId, "card_update_requested", { note }, actor.id, actor.label);
}
