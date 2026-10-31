import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { loadStripe, type Stripe } from "@stripe/stripe-js";
import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import { Lock, Plus, Send, Star, Trash2, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ErrorState, SectionSkeleton, Spinner } from "@/components/loading";
import { usePopup } from "@/components/popup";
import { Btn, Section } from "@/components/admin/record-bits";
import { FormModal } from "@/components/admin/form-modal";
import { addMyCard, chargeClientCard, clientCards, myCards, removeClientCard, removeMyCard, requestClientCard, setClientDefaultCard, setMyDefaultCard } from "@/lib/cards.functions";
import { invoicePaymentDetails } from "@/lib/client.functions";
import { money } from "@/lib/admin";
import { reportError } from "@/lib/errors";

/** Saved cards for clients (Invoices page) and staff (account page). Card numbers are only ever typed into Stripe's own form. */
export type SavedCard = { id: string; brand: string; last4: string; expMonth: number; expYear: number; isDefault: boolean; expired: boolean; expiresSoon: boolean; plans: string[]; holder: string | null; funding: string | null; country: string | null; wallet: string | null };

const brandName = (b: string) => ({ visa: "Visa", mastercard: "Mastercard", amex: "American Express", discover: "Discover", diners: "Diners Club", jcb: "JCB", unionpay: "UnionPay", cartes_bancaires: "Cartes Bancaires" } as Record<string, string>)[b] ?? b.charAt(0).toUpperCase() + b.slice(1);
export const cardLabel = (c: Pick<SavedCard, "brand" | "last4">) => `${brandName(c.brand)} ending ${c.last4}`;
const expiry = (c: SavedCard) => `${String(c.expMonth).padStart(2, "0")}/${String(c.expYear).slice(-2)}`;
const appearance = { theme: "stripe" as const, variables: { colorPrimary: "#111111", borderRadius: "12px", fontFamily: "Inter, system-ui, sans-serif" } };


/** Network colours for the card preview. The bank's own card artwork isn't available from Stripe (or any card API), so the preview
 * shows the network, last 4 digits, expiry, cardholder and card type on the network's colours. */
const looks: Record<string, { bg: string; mark: ReactNode }> = {
  visa: { bg: "linear-gradient(135deg,#1a1f71 0%,#2b3a9e 55%,#1a1f71 100%)", mark: <span className="text-[1.35em] font-black italic tracking-tight">VISA</span> },
  mastercard: { bg: "linear-gradient(135deg,#1c1c1c 0%,#3a3a3a 100%)", mark: <span className="relative inline-flex h-[1.6em] w-[2.6em]" aria-hidden><span className="absolute left-0 h-[1.6em] w-[1.6em] rounded-full bg-[#eb001b]" /><span className="absolute right-0 h-[1.6em] w-[1.6em] rounded-full bg-[#f79e1b] mix-blend-screen" /></span> },
  amex: { bg: "linear-gradient(135deg,#006fcf 0%,#4aa3e8 100%)", mark: <span className="rounded-sm border border-white/80 px-1 text-[0.8em] font-bold tracking-wide">AMERICAN EXPRESS</span> },
  discover: { bg: "linear-gradient(135deg,#2b2b2b 0%,#4a4a4a 70%,#ff6000 100%)", mark: <span className="text-[1em] font-bold tracking-wide">DISCOVER</span> },
  jcb: { bg: "linear-gradient(135deg,#0e4c96 0%,#c8102e 50%,#007b40 100%)", mark: <span className="text-[1.1em] font-black italic">JCB</span> },
  unionpay: { bg: "linear-gradient(135deg,#e21836 0%,#00447c 55%,#007b84 100%)", mark: <span className="text-[0.9em] font-bold">UnionPay</span> },
  diners: { bg: "linear-gradient(135deg,#0079be 0%,#2c2c2c 100%)", mark: <span className="text-[0.85em] font-bold">Diners Club</span> },
};

/** A picture of the card: chip, network mark, •••• last 4, expiry and cardholder. "mini" is a small thumbnail for lists. */
export function CardVisual({ card, size = "full" }: { card: SavedCard; size?: "full" | "mini" }) {
  const look = looks[card.brand] ?? { bg: "linear-gradient(135deg,#334155 0%,#64748b 100%)", mark: <span className="text-[0.9em] font-bold">{brandName(card.brand)}</span> };
  const label = `${cardLabel(card)}, expires ${expiry(card)}${card.expired ? ", expired" : ""}`;
  if (size === "mini") return <span role="img" aria-label={label} className={`relative inline-flex h-9 w-14 shrink-0 items-end justify-end overflow-hidden rounded-md p-1 text-[7px] text-white shadow-sm ${card.expired ? "grayscale" : ""}`} style={{ background: look.bg }}>
    <span className="absolute left-1.5 top-1.5 h-2 w-2.5 rounded-[2px] bg-gradient-to-br from-amber-200 to-amber-400" />{look.mark}</span>;
  return <div role="img" aria-label={label} className={`relative aspect-[1.586] w-full max-w-[340px] overflow-hidden rounded-2xl p-5 text-white shadow-lg ${card.expired ? "grayscale" : ""}`} style={{ background: look.bg, fontSize: "clamp(11px, 3.6vw, 14px)" }}>
    <span className="pointer-events-none absolute -right-10 -top-16 h-48 w-48 rounded-full bg-white/10" />
    <span className="pointer-events-none absolute -bottom-20 -left-10 h-48 w-48 rounded-full bg-white/5" />
    <div className="relative flex h-full flex-col justify-between">
      <div className="flex items-start justify-between">
        <span className="h-[2.1em] w-[2.9em] rounded-md bg-gradient-to-br from-amber-100 via-amber-300 to-amber-500 shadow-inner" aria-hidden />
        <span className="text-right text-[0.75em] font-medium uppercase tracking-wider text-white/80">{[card.wallet ? card.wallet.replace(/_/g, " ") : null, card.funding && card.funding !== "unknown" ? card.funding : null].filter(Boolean).join(" · ")}</span>
      </div>
      <p className="font-mono text-[1.35em] tracking-[0.18em]" aria-hidden>•••• •••• •••• {card.last4}</p>
      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[0.65em] uppercase tracking-wider text-white/70">{card.holder ? "Cardholder" : "Card"}</p>
          <p className="truncate text-[0.95em] font-semibold uppercase tracking-wide">{card.holder ?? brandName(card.brand)}</p>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-[0.65em] uppercase tracking-wider text-white/70">{card.expired ? "Expired" : "Expires"}</p>
          <p className="font-mono text-[0.95em] font-semibold">{expiry(card)}</p>
        </div>
        <span className="shrink-0">{look.mark}</span>
      </div>
    </div>
  </div>;
}

const stripes = new Map<string, Promise<Stripe | null>>();
const stripeFor = (key: string) => { if (!stripes.has(key)) stripes.set(key, loadStripe(key)); return stripes.get(key)!; };

function CardRow({ card, children }: { card: SavedCard; children?: ReactNode }) {
  return <li className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
    <div className="flex min-w-0 items-center gap-3">
      <CardVisual card={card} size="mini" />
      <div className="min-w-0">
        <p className="text-sm font-semibold">{cardLabel(card)}{card.isDefault && <span className="ml-2 rounded-full bg-secondary px-2 py-0.5 text-[11px] font-medium">Default</span>}</p>
        <p className={`text-xs ${card.expired ? "text-destructive" : card.expiresSoon ? "text-amber-700 dark:text-amber-400" : "text-muted-foreground"}`}>
          {card.expired ? `Expired ${expiry(card)}` : card.expiresSoon ? `Expires ${expiry(card)}: add a new card soon` : `Expires ${expiry(card)}`}
          {card.plans.length > 0 && ` · Pays for ${card.plans.join(", ")}`}
        </p>
      </div>
    </div>
    {children && <div className="flex flex-wrap gap-2">{children}</div>}
  </li>;
}

/** Stripe's card form in setup mode: saves a card on the account for automatic charges, without charging it. */
function AddCardForm({ onAdded, onCancel, submitLabel = "Save card" }: { onAdded: (paymentMethodId: string) => Promise<void> | void; onCancel: () => void; submitLabel?: string }) {
  const fnSetup = useServerFn(addMyCard);
  const setup = useQuery({ queryKey: ["card-setup"], queryFn: () => fnSetup(), staleTime: 0, gcTime: 0, retry: false });
  if (setup.isLoading) return <div className="flex justify-center py-8"><Spinner className="size-5" /></div>;
  if (setup.error || !setup.data) return <ErrorState error={setup.error ?? new Error("Couldn't open the card form.")} retry={() => void setup.refetch()} />;
  if (!setup.data.publishableKey) return <p className="text-sm text-muted-foreground">Card payments aren't set up yet. Please contact us.</p>;
  return <Elements stripe={stripeFor(setup.data.publishableKey)} options={{ clientSecret: setup.data.clientSecret, appearance }}>
    <SetupForm onAdded={onAdded} onCancel={onCancel} submitLabel={submitLabel} />
  </Elements>;
}

function SetupForm({ onAdded, onCancel, submitLabel }: { onAdded: (paymentMethodId: string) => Promise<void> | void; onCancel: () => void; submitLabel: string }) {
  const stripe = useStripe(); const elements = useElements();
  const [ready, setReady] = useState(false); const [busy, setBusy] = useState(false); const [error, setError] = useState<string | null>(null);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!stripe || !elements || busy) return;
    setBusy(true); setError(null);
    const res = await stripe.confirmSetup({ elements, redirect: "if_required", confirmParams: { return_url: `${window.location.origin}/dashboard/invoices?card=updated` } });
    if (res.error) {
      if (res.error.type !== "card_error" && res.error.type !== "validation_error") reportError(res.error, { area: "card setup" });
      setError(res.error.message ?? "The card couldn't be saved. Please try another card."); setBusy(false); return;
    }
    const pm = res.setupIntent?.payment_method;
    try { await onAdded(typeof pm === "string" ? pm : pm?.id ?? ""); } catch (err) { setError((err as Error).message); }
    setBusy(false);
  };
  return <form onSubmit={submit}>
    {!ready && <div className="flex justify-center py-6"><Spinner className="size-5" /></div>}
    <PaymentElement onReady={() => setReady(true)} options={{ layout: "tabs" }} />
    {error && <p role="alert" className="mt-3 text-sm text-destructive">{error}</p>}
    <div className="mt-5 flex gap-2">
      <Button type="button" variant="secondary" className="h-11 flex-1 rounded-full" onClick={onCancel} disabled={busy}>Cancel</Button>
      <Button type="submit" className="h-11 flex-1 rounded-full" disabled={!stripe || !ready || busy}>{busy ? <Spinner /> : <Lock />} {submitLabel}</Button>
    </div>
    <p className="mt-3 text-center text-xs text-muted-foreground">Saved securely by Stripe. We never see your card number. By saving it, you allow First Person Marketing to charge it for your plans and invoices under your agreement.</p>
  </form>;
}

function Modal({ open, onClose, title, description, children }: { open: boolean; onClose: () => void; title: string; description: string; children: ReactNode }) {
  return <Dialog.Root open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
    <Dialog.Portal><Dialog.Overlay className="fixed inset-0 z-40 bg-foreground/40 backdrop-blur-sm" />
      <Dialog.Content className="app-modal max-h-[90dvh] overflow-y-auto sm:max-w-md">
        <Dialog.Title className="pr-8 text-lg font-bold">{title}</Dialog.Title>
        <Dialog.Description className="mt-1 text-sm text-muted-foreground">{description}</Dialog.Description>
        <div className="mt-5">{children}</div>
      </Dialog.Content></Dialog.Portal>
  </Dialog.Root>;
}

/** Client: their saved cards, add a card, choose the default (which all plans renew on), remove a card. */
export function MyPaymentCards() {
  const popup = usePopup(); const qc = useQueryClient();
  const fnList = useServerFn(myCards), fnDefault = useServerFn(setMyDefaultCard), fnRemove = useServerFn(removeMyCard);
  const cards = useQuery({ queryKey: ["client", "cards"], queryFn: () => fnList() as Promise<SavedCard[]> });
  const [adding, setAdding] = useState(false);
  const refresh = () => qc.invalidateQueries({ queryKey: ["client", "cards"] });
  const fail = (e: unknown) => popup({ type: "error", title: "That didn't work", description: (e as Error).message, primaryLabel: "Close", secondaryLabel: null });
  const makeDefault = async (c: SavedCard) => { try { await fnDefault({ data: { paymentMethodId: c.id } }); await refresh(); } catch (e) { fail(e); } };
  const remove = (c: SavedCard) => popup({ type: "info", title: `Remove ${cardLabel(c)}?`, description: c.isDefault || c.plans.length ? "Your plans will renew on your next card instead." : "You can add it again any time.", primaryLabel: "Remove card", secondaryLabel: "Keep it",
    onPrimary: async () => { try { await fnRemove({ data: { paymentMethodId: c.id } }); await refresh(); } catch (e) { fail(e); } } });
  const list = cards.data ?? [];
  const warn = list.length > 0 && list.every((c) => c.expired || c.expiresSoon);
  return <section className="mb-4 overflow-hidden rounded-2xl border bg-card">
    <div className="flex flex-wrap items-center justify-between gap-2 border-b px-5 py-3"><h2 className="font-semibold">Payment cards</h2>
      <button type="button" onClick={() => setAdding(true)} className="inline-flex h-8 items-center gap-1.5 rounded-full bg-foreground px-3 text-xs font-semibold text-background"><Plus className="size-3.5" />Add a card</button></div>
    {warn && <p className="border-b bg-amber-50 px-5 py-2 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">Your card {list.some((c) => c.expired) ? "has expired" : "expires soon"}. Add a new card so your plans keep running.</p>}
    {cards.isLoading ? <div className="p-5"><SectionSkeleton /></div> : cards.error ? <div className="p-5"><ErrorState error={cards.error} retry={() => void cards.refetch()} /></div>
      : list.length === 0 ? <p className="px-5 py-4 text-sm text-muted-foreground">No saved cards yet. The card you pay your first invoice with is saved automatically for your plan's renewals.</p>
      : <ul className="grid gap-5 p-5 sm:grid-cols-2">{list.map((c) => <li key={c.id} className="space-y-2">
          <CardVisual card={c} />
          <div className="flex max-w-[340px] flex-wrap items-center justify-between gap-2">
            <p className={`text-xs ${c.expired ? "text-destructive" : c.expiresSoon ? "text-amber-700 dark:text-amber-400" : "text-muted-foreground"}`}>
              {c.isDefault ? "Default card" : c.expired ? "Expired" : c.expiresSoon ? "Expires soon" : "Saved card"}{c.plans.length > 0 && ` · Pays for ${c.plans.join(", ")}`}
            </p>
            <span className="flex gap-1">
              {!c.isDefault && !c.expired && <button type="button" onClick={() => void makeDefault(c)} className="h-8 rounded-full bg-secondary px-3 text-xs font-semibold">Make default</button>}
              <button type="button" onClick={() => remove(c)} className="h-8 rounded-full px-3 text-xs font-semibold text-muted-foreground underline underline-offset-4">Remove</button>
            </span>
          </div>
        </li>)}</ul>}
    <Modal open={adding} onClose={() => setAdding(false)} title="Add a card" description="Your new card becomes the default: your plans renew on it from now on.">
      {adding && <AddCardForm onCancel={() => setAdding(false)} onAdded={async (pm) => { await fnDefault({ data: { paymentMethodId: pm } }); setAdding(false); await refresh();
        popup({ type: "success", title: "Card saved", description: "Your plans renew on this card from now on.", primaryLabel: "Got it", secondaryLabel: null }); }} />}
    </Modal>
  </section>;
}

/** Client: pay an open invoice with a saved card or a new one (a new card is saved first, then charged). 3-D Secure checks open in
 * Stripe's popup. Success here only updates the screen; the invoice is marked paid by the signed Stripe webhook. */
export function PayInvoiceButton({ invoice }: { invoice: { id: string; number: string; hosted_url?: string | null } }) {
  const [open, setOpen] = useState(false);
  return <>
    <button type="button" onClick={() => setOpen(true)} className="h-8 rounded-full bg-foreground px-3 text-xs font-semibold leading-8 text-background">Pay now</button>
    <Modal open={open} onClose={() => setOpen(false)} title={`Pay invoice ${invoice.number}`} description="Choose a saved card or add a new one.">
      {open && <PayInvoice invoice={invoice} onDone={() => setOpen(false)} />}
    </Modal>
  </>;
}

function PayInvoice({ invoice, onDone }: { invoice: { id: string; number: string; hosted_url?: string | null }; onDone: () => void }) {
  const popup = usePopup(); const qc = useQueryClient();
  const fnPay = useServerFn(invoicePaymentDetails), fnList = useServerFn(myCards);
  const details = useQuery({ queryKey: ["pay", invoice.id], queryFn: () => fnPay({ data: { invoiceId: invoice.id } }), staleTime: 0, gcTime: 0, retry: false });
  const cards = useQuery({ queryKey: ["client", "cards"], queryFn: () => fnList() as Promise<SavedCard[]> });
  const usable = useMemo(() => (cards.data ?? []).filter((c) => !c.expired), [cards.data]);
  const [choice, setChoice] = useState<string | "new" | null>(null);
  useEffect(() => { if (choice === null && cards.data) setChoice(usable[0]?.id ?? "new"); }, [cards.data, usable, choice]);
  const [busy, setBusy] = useState(false); const [error, setError] = useState<string | null>(null);
  if (details.isLoading || cards.isLoading) return <div className="flex justify-center py-8"><Spinner className="size-5" /></div>;
  if (details.error || !details.data) return <div className="space-y-3"><ErrorState error={details.error ?? new Error("This invoice can't be paid online.")} />{invoice.hosted_url && <a href={invoice.hosted_url} target="_blank" rel="noopener noreferrer" className="block text-center text-sm underline underline-offset-4">Pay on Stripe's page instead</a>}</div>;
  const d = details.data;
  const pay = async (paymentMethodId: string) => {
    if (!d.publishableKey || !d.clientSecret) throw new Error("Card payments aren't available for this invoice. Use Stripe's page instead.");
    const stripe = await stripeFor(d.publishableKey);
    if (!stripe) throw new Error("Stripe couldn't load. Check your connection or ad blocker, or use Stripe's page instead.");
    const res = await stripe.confirmPayment({ clientSecret: d.clientSecret, redirect: "if_required", confirmParams: { payment_method: paymentMethodId, return_url: `${window.location.origin}/dashboard/invoices` } });
    if (res.error) { if (res.error.type !== "card_error" && res.error.type !== "validation_error") reportError(res.error, { area: "invoice payment" }); throw new Error(res.error.message ?? "The payment didn't go through."); }
    const st = res.paymentIntent?.status;
    if (st !== "succeeded" && st !== "processing") throw new Error("The payment needs another step. Please try again or use another card.");
    await qc.invalidateQueries({ queryKey: ["client"] });
    onDone();
    popup({ type: "success", title: st === "succeeded" ? "Payment received" : "Payment processing", description: st === "succeeded" ? `Thank you. Invoice ${d.number} is marked paid within a minute, and your receipt is on its way.` : "Your bank is confirming the payment. The invoice updates as soon as it's done.", primaryLabel: "Got it", secondaryLabel: null });
  };
  const paySaved = async () => { if (!choice || choice === "new") return; setBusy(true); setError(null); try { await pay(choice); } catch (e) { setError((e as Error).message); } setBusy(false); };
  return <div>
    <p className="mb-4 flex items-baseline justify-between border-b pb-3 text-sm"><span className="text-muted-foreground">Amount due</span><span className="text-lg font-bold">{money(d.amount)}</span></p>
    {usable.length > 0 && <fieldset className="space-y-2">
      <legend className="sr-only">Card</legend>
      {usable.map((c) => <label key={c.id} className={`flex cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 text-sm ${choice === c.id ? "border-foreground" : ""}`}>
        <input type="radio" name="card" checked={choice === c.id} onChange={() => setChoice(c.id)} className="accent-foreground" />
        <CardVisual card={c} size="mini" /><span className="flex-1">{cardLabel(c)}<span className="block text-xs text-muted-foreground">Expires {expiry(c)}{c.isDefault ? " · Default" : ""}</span></span>
      </label>)}
      <label className={`flex cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 text-sm ${choice === "new" ? "border-foreground" : ""}`}>
        <input type="radio" name="card" checked={choice === "new"} onChange={() => setChoice("new")} className="accent-foreground" /><span>Use a new card</span>
      </label>
    </fieldset>}
    {choice === "new"
      ? <div className="mt-4"><AddCardForm submitLabel={`Pay ${money(d.amount)}`} onCancel={onDone} onAdded={(pm) => pay(pm)} /></div>
      : <>
          {error && <p role="alert" className="mt-3 text-sm text-destructive">{error}</p>}
          <Button className="signup-primary mt-5" disabled={busy || !choice} onClick={() => void paySaved()}>{busy ? <Spinner /> : <Lock />} Pay {money(d.amount)}</Button>
        </>}
    {d.payUrl && <a href={d.payUrl} target="_blank" rel="noopener noreferrer" className="mt-3 block text-center text-xs text-muted-foreground underline underline-offset-4">Other ways to pay on Stripe's page</a>}
  </div>;
}

/** Staff (billing permission): a client's cards, the default, removing a card, asking the client for a new one, and charging a saved
 * card for an open invoice. Staff never type card numbers: new cards come from the client, through Stripe. */
export function ClientPaymentCards({ userId, invoices, onChanged }: { userId: string; invoices: { id: string; number: string; amount: number; status: string; stripe_invoice_id?: string | null }[]; onChanged: () => void }) {
  const popup = usePopup(); const qc = useQueryClient();
  const fnList = useServerFn(clientCards), fnDefault = useServerFn(setClientDefaultCard), fnRemove = useServerFn(removeClientCard), fnCharge = useServerFn(chargeClientCard), fnRequest = useServerFn(requestClientCard);
  const cards = useQuery({ queryKey: ["admin", "cards", userId], queryFn: () => fnList({ data: { userId } }) as Promise<SavedCard[]> });
  const [modal, setModal] = useState<"charge" | "request" | null>(null);
  const refresh = () => qc.invalidateQueries({ queryKey: ["admin", "cards", userId] });
  const fail = (e: unknown) => popup({ type: "error", title: "That didn't work", description: (e as Error).message, primaryLabel: "Close", secondaryLabel: null });
  const list = cards.data ?? [];
  const usable = list.filter((c) => !c.expired);
  const open = invoices.filter((i) => ["open", "overdue"].includes(i.status) && i.stripe_invoice_id);
  const invLabel = (i: (typeof open)[number]) => `${i.number}, ${money(Number(i.amount))}`;
  const makeDefault = (c: SavedCard) => popup({ type: "info", title: `Make ${cardLabel(c)} the default?`, description: "All of this client's plans renew on it from now on, and the client sees the change in their dashboard.", primaryLabel: "Make default", secondaryLabel: "Cancel",
    onPrimary: async () => { try { await fnDefault({ data: { userId, paymentMethodId: c.id } }); await refresh(); } catch (e) { fail(e); } } });
  const remove = (c: SavedCard) => popup({ type: "info", title: `Remove ${cardLabel(c)}?`, description: c.isDefault || c.plans.length ? "Plans on this card move to the client's next card. With no other card, removal is refused." : "The client can add it again.", primaryLabel: "Remove card", secondaryLabel: "Cancel",
    onPrimary: async () => { try { await fnRemove({ data: { userId, paymentMethodId: c.id } }); await refresh(); } catch (e) { fail(e); } } });
  return <Section title="Payment cards" actions={<>
    <Btn icon={Zap} disabled={!usable.length || !open.length} onClick={() => setModal("charge")}>Charge a card</Btn>
    <Btn icon={Send} onClick={() => setModal("request")}>Ask for a new card</Btn>
  </>}>
    {cards.isLoading ? <div className="p-5"><SectionSkeleton /></div> : cards.error ? <div className="p-5"><ErrorState error={cards.error} retry={() => void cards.refetch()} /></div>
      : list.length === 0 ? <p className="px-5 py-4 text-sm text-muted-foreground">No saved cards. Use "Ask for a new card" to send the client a secure link to add one.</p>
      : <ul className="divide-y">{list.map((c) => <CardRow key={c.id} card={c}>
          {!c.isDefault && !c.expired && <Btn icon={Star} onClick={() => makeDefault(c)}>Make default</Btn>}
          <Btn icon={Trash2} danger onClick={() => remove(c)}>Remove</Btn>
        </CardRow>)}</ul>}
    {!open.length && list.length > 0 && <p className="border-t px-5 py-2 text-xs text-muted-foreground">Nothing to charge: the client has no open Stripe invoices. Issue an invoice first from the Invoices tab.</p>}
    {modal === "charge" && <FormModal title="Charge a saved card" submitLabel="Charge card" onClose={() => setModal(null)}
      description="Charges the card now, without the client present. If their bank asks them to confirm, the payment isn't taken and the client is sent the invoice to pay. The charge is recorded in the audit log."
      fields={[{ name: "invoice", label: "Open invoice", type: "select", options: open.map(invLabel) }, { name: "card", label: "Card", type: "select", options: usable.map(cardLabel) }]}
      onSubmit={async (v) => {
        const inv = open.find((i) => invLabel(i) === v.invoice) ?? open[0]; const card = usable.find((c) => cardLabel(c) === v.card) ?? usable[0];
        if (!inv || !card) return "Choose an invoice and a card.";
        try {
          const r = await fnCharge({ data: { userId, invoiceId: inv.id, paymentMethodId: card.id } });
          setModal(null); onChanged();
          popup({ type: r.status === "paid" || r.status === "processing" ? "success" : "error", title: { paid: "Card charged", processing: "Payment processing", needs_authentication: "The client needs to confirm", failed: "The charge didn't go through" }[r.status], description: r.message, primaryLabel: "Close", secondaryLabel: null });
          return null;
        } catch (e) { return (e as Error).message; }
      }} />}
    {modal === "request" && <FormModal title="Ask the client for a new card" submitLabel="Send request" onClose={() => setModal(null)}
      description="The client gets an email and a dashboard notification linking to their payment cards, where they add a card securely through Stripe."
      fields={[{ name: "note", label: "Message (optional)", type: "textarea", max: 500 }]}
      onSubmit={async (v) => { try { await fnRequest({ data: { userId, ...(v.note ? { note: v.note } : {}) } }); setModal(null); popup({ type: "success", title: "Request sent", description: "We've asked the client to add a new card.", primaryLabel: "Close", secondaryLabel: null }); return null; } catch (e) { return (e as Error).message; } }} />}
  </Section>;
}
