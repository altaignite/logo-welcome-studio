import { createFileRoute } from "@tanstack/react-router";

const subIdOf = (o: any): string | null =>
  o?.subscription ?? o?.parent?.subscription_details?.subscription ?? o?.lines?.data?.[0]?.parent?.subscription_item_details?.subscription ?? null;
const idOf = (v: any): string | null => (typeof v === "string" ? v : v?.id ?? null);

export const Route = createFileRoute("/api/public/stripe/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env["STRIPE_WEBHOOK_SECRET"];
        if (!secret) return new Response("Not configured", { status: 500 });
        const body = await request.text();
        const { verifyStripeSignature, audit, stripe } = await import("@/lib/stripe.server");
        if (!(await verifyStripeSignature(body, request.headers.get("stripe-signature"), secret))) return new Response("Invalid signature", { status: 400 });
        const event = JSON.parse(body);
        const B = await import("@/lib/billing.server");
        const { refundDelta } = await import("@/lib/billing");
        const { must } = B;
        const admin = await B.getAdmin();
        const seen = await admin.from("stripe_events").select("id").eq("id", event.id).maybeSingle();
        if (seen.error) {
          
          console.error("Stripe webhook couldn't record event", event.id, seen.error.message);
          return new Response("error", { status: 500 });
        }
        if (seen.data) return new Response("duplicate");
        let o = event.data?.object ?? {};
        try {
          const localSub = async () => {
            const meta = o.metadata?.subscription_id ?? o.subscription_details?.metadata?.subscription_id ?? o.parent?.subscription_details?.metadata?.subscription_id;
            if (meta) return meta as string;
            const sid = event.type.startsWith("customer.subscription") ? o.id : subIdOf(o);
            if (!sid) return null;
            const data = must(await admin.from("subscriptions").select("id").eq("stripe_subscription_id", sid).maybeSingle());
            return data?.id ?? null;
          };
          const findInvoice = async () => must(await admin.from("invoices").select("*").eq("stripe_invoice_id", o.id).maybeSingle());
          // Fetch authoritative state so delayed events cannot regress a paid or void invoice.
          if (event.type.startsWith("invoice.") && o.id) {
            o = await stripe("GET", `invoices/${o.id}`, { "expand[]": "payments" });
            const userId = must(await admin.from("profiles").select("id").eq("stripe_customer_id", idOf(o.customer)).maybeSingle())?.id;
            if (userId) {
              const { importInvoice } = await import("@/lib/stripe-import.server");
              await importInvoice(admin, userId, o);
              if (event.type === "invoice.payment_failed" && o.status === "open") {
                must(await admin.from("invoices").update({ failed_payment_at: new Date().toISOString() }).eq("stripe_invoice_id", o.id));
                const inv = await findInvoice();
                if (inv?.subscription_id) { await B.markPastDue(admin, inv.subscription_id, "Invoice payment failed"); await B.applySubscriptionStanding(admin, inv.subscription_id, "Invoice payment failed", "Stripe"); }
              }
            }
          } else if (event.type.startsWith("customer.subscription.") && o.id) {
            o = await stripe("GET", `subscriptions/${o.id}`);
            const subId = await localSub();
            if (subId) await B.syncSubscriptionFromStripe(admin, subId, o);
          }
          switch (event.type) {
            case "charge.refunded": {
              const pi = idOf(o.payment_intent);
              const stripeInv = idOf(o.invoice);
              const inv = stripeInv ? must(await admin.from("invoices").select("id, user_id, subscription_id").eq("stripe_invoice_id", stripeInv).maybeSingle()) : null;
              const tx = !inv && pi ? must(await admin.from("transactions").select("user_id, invoice_id, subscription_id").eq("stripe_payment_intent", pi).limit(1).maybeSingle()) : null;
              const userId = inv?.user_id ?? tx?.user_id ?? must(await admin.from("profiles").select("id").eq("stripe_customer_id", o.customer).maybeSingle())?.id;
              if (!userId) break;
              // amount_refunded is the running total for the charge; record only what's new since the last refund event.
              const prior = must(await admin.from("transactions").select("amount").like("stripe_id", `rf-${o.id}-%`)) ?? [];
              const amount = refundDelta(o.amount_refunded ?? 0, prior.map((r: { amount: number }) => Number(r.amount)));
              if (amount <= 0) break;
              must(await admin.from("transactions").upsert({ user_id: userId, invoice_id: inv?.id ?? tx?.invoice_id ?? null, subscription_id: inv?.subscription_id ?? tx?.subscription_id ?? null, reference: `RF-${o.id}`, description: "Refund", amount: -amount, method: "stripe", status: "completed", stripe_id: `rf-${o.id}-${o.amount_refunded}`, stripe_payment_intent: pi }, { onConflict: "stripe_id", ignoreDuplicates: true }));
              break;
            }
          }
        } catch (e) {
          console.error("Stripe webhook failed", event.type, e);

          return new Response("error", { status: 500 });
        }
        const completed = await admin.from("stripe_events").upsert({ id: event.id, type: event.type }, { onConflict: "id", ignoreDuplicates: true });
        if (completed.error) return new Response("error", { status: 500 });
        return new Response("ok");
      },
    },
  },
});
