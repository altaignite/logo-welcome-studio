import { useEffect, useMemo, useState, type FormEvent } from "react";
import { loadStripe } from "@stripe/stripe-js";
import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import { Lock, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/loading";
import { ReviewRow, ReviewSection } from "@/components/order-flow";
import { money } from "@/lib/admin";
import { reportError, friendlyError } from "@/lib/errors";
import type { Plan } from "@/lib/signup";

/** What the server returns for an open invoice (invoicePayment in src/lib/billing.server.ts). */
export type PaymentDetails = { invoiceId: string; number: string; amount: number; payUrl: string | null; clientSecret: string | null; publishableKey: string | null };

/** "Pay your first month": the last step of every client order, after signing. Stripe's own card form (in its iframe, so card
 * details never touch our servers) pays the order's first invoice. The browser only reports success to the client; the invoice is
 * marked paid by the signed Stripe webhook. Without a publishable key it falls back to Stripe's hosted invoice page. */
export function PayStep({ payment, plan, returnPath, onPaid }: { payment: PaymentDetails; plan: Plan; returnPath: string; onPaid: (status: "succeeded" | "processing") => void }) {
  const stripePromise = useMemo(() => (payment.publishableKey ? loadStripe(payment.publishableKey) : null), [payment.publishableKey]);
  // Stripe's script can be blocked (ad blockers, strict networks): then Stripe's hosted page takes over.
  const [blocked, setBlocked] = useState(false);
  useEffect(() => {
    if (!stripePromise) return;
    const timer = window.setTimeout(() => setBlocked(true), 15000);
    stripePromise.then((s) => { window.clearTimeout(timer); if (!s) setBlocked(true); }, (e: unknown) => { window.clearTimeout(timer); reportError(e, { area: "stripe.js" }, "warning"); setBlocked(true); });
    return () => window.clearTimeout(timer);
  }, [stripePromise]);
  return <div>
    <ReviewSection title="Due today">
      <ReviewRow label={`${plan.name} plan, first month`} value={money(payment.amount)} />
      <ReviewRow label="Then" value={`${money(plan.monthlyFee)} a month plus applicable taxes, renewing automatically. Cancel any time in your dashboard, effective at the end of the paid month.`} />
      <ReviewRow label="Money-back guarantee" value="90 days on service fees if you receive no sales, under the conditions in your agreement." />
    </ReviewSection>
    {stripePromise && payment.clientSecret && !blocked
      ? <Elements stripe={stripePromise} options={{ clientSecret: payment.clientSecret, appearance: { theme: "stripe", variables: { colorPrimary: "#111111", borderRadius: "12px", fontFamily: "Inter, system-ui, sans-serif" } } }}>
          <CardForm amount={payment.amount} returnPath={returnPath} onPaid={onPaid} />
        </Elements>
      : payment.payUrl
        ? <div>
            <Button asChild className="signup-primary"><a href={payment.payUrl} target="_blank" rel="noopener noreferrer"><Lock /> Pay {money(payment.amount)} securely with Stripe</a></Button>
            <p className="mt-3 text-center text-xs text-muted-foreground">Opens Stripe's secure payment page. Your plan starts as soon as it's paid; the invoice is also in your inbox.</p>
          </div>
        : <p className="text-sm text-muted-foreground">Your invoice is in your inbox and your dashboard; your plan starts as soon as it's paid.</p>}
  </div>;
}

function CardForm({ amount, returnPath, onPaid }: { amount: number; returnPath: string; onPaid: (status: "succeeded" | "processing") => void }) {
  const stripe = useStripe();
  const elements = useElements();
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!stripe || !elements || busy) return;
    setBusy(true); setError(null);
    // Cards confirm here (3-D Secure opens in Stripe's popup); methods that must leave the page come back to returnPath.
    const res = await stripe.confirmPayment({ elements, redirect: "if_required", confirmParams: { return_url: `${window.location.origin}${returnPath}` } });
    setBusy(false);
    if (res.error) {
      // Card and validation errors are written by Stripe for the cardholder; anything else is ours to look at.
      if (res.error.type !== "card_error" && res.error.type !== "validation_error") reportError(res.error, { area: "payment" });
      setError(friendlyError(res.error) ?? "The payment didn't go through. Please try again or use another card.");
      return;
    }
    const status = res.paymentIntent?.status;
    if (status === "succeeded" || status === "processing") onPaid(status);
    else setError("The payment needs another step. Please try again or use another card.");
  };
  return <form onSubmit={submit} className="mt-2">
    {!ready && <div className="flex justify-center py-8"><Spinner className="size-5" /></div>}
    <PaymentElement onReady={() => setReady(true)} options={{ layout: "tabs" }} />
    {error && <p role="alert" className="mt-3 text-sm text-destructive">{error}</p>}
    <Button type="submit" className="signup-primary mt-6" disabled={!stripe || !ready || busy}>{busy ? <Spinner /> : <Lock />} Pay {money(amount)} and start</Button>
    <p className="mt-3 flex items-center justify-center gap-1.5 text-center text-xs text-muted-foreground"><ShieldCheck className="size-3.5" /> Secured by Stripe. We never see or store your card number.</p>
  </form>;
}
