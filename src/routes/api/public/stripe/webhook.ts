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
        const { invoiceKind, nextRenewalAt, refundDelta } = await import("@/lib/billing");
        const { must } = B;
        const admin = await B.getAdmin();
        const seen = await admin.from("stripe_events").insert({ id: event.id, type: event.type });
        if (seen.error) {
          if (seen.error.code === "23505") return new Response("duplicate");
          console.error("Stripe webhook couldn't record event", event.id, seen.error.message);
          return new Response("error", { status: 500 });
        }
        const o = event.data?.object ?? {};
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
          const upsertInvoice = async (status: string) => {
            const ex = await findInvoice();
            if (ex) return ex;
            const userId = o.metadata?.user_id ?? must(await admin.from("profiles").select("id").eq("stripe_customer_id", o.customer).maybeSingle())?.id;
            if (!userId || !(o.total ?? o.amount_due)) return null;
            const subId = await localSub();
            const ins = await admin.from("invoices").insert({
              user_id: userId, subscription_id: subId, number: o.number ?? o.id, amount: (o.total ?? o.amount_due) / 100, description: o.description ?? "Monthly service fee",
              due_at: o.due_date ? new Date(o.due_date * 1000).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10),
              status, kind: invoiceKind(o), stripe_invoice_id: o.id, hosted_url: o.hosted_invoice_url, pdf_url: o.invoice_pdf,
            }).select("*").single();
            // Another delivery for the same invoice may have created it first.
            if (ins.error?.code === "23505") return await findInvoice();
            return must(ins);
          };
          const paymentIntentOf = async (): Promise<string | null> => {
            const direct = idOf(o.payment_intent) ?? idOf(o.payments?.data?.[0]?.payment?.payment_intent);
            if (direct) return direct;
            const full = await stripe("GET", `invoices/${o.id}`, { "expand[]": "payments" }).catch(() => null);
            return idOf(full?.payment_intent) ?? idOf(full?.payments?.data?.[0]?.payment?.payment_intent);
          };

          // Every invoice event records Stripe's live invoice status on the local copy.
          if (event.type.startsWith("invoice.") && o.id) {
            must(await admin.from("invoices").update({ stripe_status: o.status ?? null, stripe_synced_at: new Date().toISOString(),
              ...(event.type === "invoice.payment_failed" ? { failed_payment_at: new Date().toISOString() } : {}) }).eq("stripe_invoice_id", o.id));
          }
          switch (event.type) {
            case "invoice.finalized": await upsertInvoice("open"); break;
            case "invoice.paid": {
              const inv = await upsertInvoice("open");
              if (!inv) break;
              must(await admin.from("invoices").update({ status: "paid", paid_at: new Date().toISOString(), hosted_url: o.hosted_invoice_url, pdf_url: o.invoice_pdf, collection_stage: Number(inv.interest_accrued) + Number(inv.fees_accrued) > 0 ? inv.collection_stage : (inv.collection_stage === "none" ? "none" : "settled") }).eq("id", inv.id));
              must(await admin.from("transactions").upsert({ user_id: inv.user_id, invoice_id: inv.id, subscription_id: inv.subscription_id, reference: o.number ?? o.id, description: `Payment for ${inv.number}`, amount: (o.amount_paid ?? 0) / 100, method: "stripe", status: "completed", stripe_id: `pay-${o.id}`, stripe_payment_intent: await paymentIntentOf() }, { onConflict: "stripe_id", ignoreDuplicates: true }));
              if (o.metadata?.original_invoice_id) must(await admin.from("invoices").update({ collection_stage: "settled", interest_paused: true }).eq("id", o.metadata.original_invoice_id).eq("status", "paid"));
              const subId = inv.subscription_id;
              if (subId) {
                if (inv.kind === "first") await B.activateSubscription(admin, subId);
                else {
                  // Only a billing-cycle renewal starts a new hours period; proration and one-off invoices don't.
                  if (inv.kind === "renewal") {
                    const cur = must(await admin.from("subscriptions").select("pending_plan_id").eq("id", subId).single());
                    const { plans } = await import("@/lib/signup");
                    const np = cur?.pending_plan_id ? plans.find((p) => p.id === cur.pending_plan_id) : undefined;
                    must(await admin.from("subscriptions").update({ hours_used: 0, overage_billed_hours: 0, renews_at: nextRenewalAt(o).toISOString(), ...(np ? { plan_name: np.name, monthly_fee: np.monthlyFee, monthly_hours: np.monthlyHours, pending_plan_id: null } : {}) }).eq("id", subId));
                  }
                  await B.reinstateAfterPayment(admin, subId);
                }
              }
              await audit(admin, inv.user_id, "invoices", inv.id, "paid", { status: { from: inv.status, to: "paid" } }, null, "Stripe");
              break;
            }
            case "invoice.payment_failed": {
              const inv = await upsertInvoice("overdue");
              const subId = inv?.subscription_id ?? (await localSub());
              if (subId) {
                await B.markPastDue(admin, subId, o.last_finalization_error?.message ?? "Card payment was declined");
                if (!o.next_payment_attempt) await B.suspendForNonPayment(admin, subId, `Invoice ${o.number ?? o.id} unpaid after all retries`);
              }
              break;
            }
            case "invoice.marked_uncollectible": {
              const subId = await localSub();
              if (subId) await B.suspendForNonPayment(admin, subId, `Invoice ${o.number ?? o.id} marked uncollectible`);
              break;
            }
            case "invoice.voided": must(await admin.from("invoices").update({ status: "void", void_reason: "Voided in Stripe" }).eq("stripe_invoice_id", o.id).neq("status", "void")); break;
            case "customer.subscription.created":
            case "customer.subscription.updated":
            case "customer.subscription.paused":
            case "customer.subscription.resumed":
            case "customer.subscription.deleted": {
              // The local plan follows Stripe's live status (shared with the daily reconciliation).
              const subId = await localSub();
              if (subId) await B.syncSubscriptionFromStripe(admin, subId, event.type === "customer.subscription.deleted" ? { ...o, status: "canceled" } : o);
              break;
            }
            case "invoice.updated": case "invoice.created": case "invoice.sent": break;
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
          await admin.from("stripe_events").delete().eq("id", event.id);
          return new Response("error", { status: 500 });
        }
        return new Response("ok");
      },
    },
  },
});
