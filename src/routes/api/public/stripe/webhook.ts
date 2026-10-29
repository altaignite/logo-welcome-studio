import { createFileRoute } from "@tanstack/react-router";

const subIdOf = (o: any): string | null =>
  o?.subscription ?? o?.parent?.subscription_details?.subscription ?? o?.lines?.data?.[0]?.parent?.subscription_item_details?.subscription ?? null;

export const Route = createFileRoute("/api/public/stripe/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env["STRIPE_WEBHOOK_SECRET"];
        if (!secret) return new Response("Not configured", { status: 500 });
        const body = await request.text();
        const { verifyStripeSignature, audit } = await import("@/lib/stripe.server");
        if (!(await verifyStripeSignature(body, request.headers.get("stripe-signature"), secret))) return new Response("Invalid signature", { status: 400 });
        const event = JSON.parse(body);
        const B = await import("@/lib/billing.server");
        const admin = await B.getAdmin();
        const seen = await admin.from("stripe_events").insert({ id: event.id, type: event.type });
        if (seen.error) return new Response("duplicate");
        const o = event.data?.object ?? {};
        try {
          const localSub = async () => {
            const meta = o.metadata?.subscription_id ?? o.subscription_details?.metadata?.subscription_id ?? o.parent?.subscription_details?.metadata?.subscription_id;
            if (meta) return meta as string;
            const sid = event.type.startsWith("customer.subscription") ? o.id : subIdOf(o);
            if (!sid) return null;
            const { data } = await admin.from("subscriptions").select("id").eq("stripe_subscription_id", sid).maybeSingle();
            return data?.id ?? null;
          };
          const upsertInvoice = async (status: string) => {
            const { data: ex } = await admin.from("invoices").select("*").eq("stripe_invoice_id", o.id).maybeSingle();
            if (ex) return ex;
            const userId = o.metadata?.user_id ?? (await admin.from("profiles").select("id").eq("stripe_customer_id", o.customer).maybeSingle()).data?.id;
            if (!userId || !o.amount_due) return null;
            const subId = await localSub();
            const { data } = await admin.from("invoices").insert({
              user_id: userId, subscription_id: subId, number: o.number ?? o.id, amount: o.amount_due / 100, description: o.description ?? "Monthly service fee",
              due_at: o.due_date ? new Date(o.due_date * 1000).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10),
              status, kind: o.metadata?.kind ?? "renewal", stripe_invoice_id: o.id, hosted_url: o.hosted_invoice_url, pdf_url: o.invoice_pdf,
            }).select("*").single();
            return data;
          };

          switch (event.type) {
            case "invoice.finalized": await upsertInvoice("open"); break;
            case "invoice.paid": {
              const inv = await upsertInvoice("open");
              if (!inv) break;
              await admin.from("invoices").update({ status: "paid", paid_at: new Date().toISOString(), hosted_url: o.hosted_invoice_url, pdf_url: o.invoice_pdf, collection_stage: Number(inv.interest_accrued) + Number(inv.fees_accrued) > 0 ? inv.collection_stage : (inv.collection_stage === "none" ? "none" : "settled") }).eq("id", inv.id);
              await admin.from("transactions").insert({ user_id: inv.user_id, invoice_id: inv.id, subscription_id: inv.subscription_id, reference: o.number ?? o.id, description: `Payment for ${inv.number}`, amount: (o.amount_paid ?? 0) / 100, method: "stripe", status: "completed", stripe_id: `pay-${o.id}` });
              if (o.metadata?.original_invoice_id) await admin.from("invoices").update({ collection_stage: "settled", interest_paused: true }).eq("id", o.metadata.original_invoice_id).eq("status", "paid");
              const subId = inv.subscription_id;
              if (subId) {
                if (inv.kind === "first") await B.activateSubscription(admin, subId);
                else {
                  if (inv.kind === "renewal") {
                    const next = new Date(); next.setMonth(next.getMonth() + 1);
                    const { data: cur } = await admin.from("subscriptions").select("pending_plan_id").eq("id", subId).single();
                    const { plans } = await import("@/lib/signup");
                    const np = cur?.pending_plan_id ? plans.find((p) => p.id === cur.pending_plan_id) : undefined;
                    await admin.from("subscriptions").update({ hours_used: 0, overage_billed_hours: 0, renews_at: next.toISOString(), ...(np ? { plan_name: np.name, monthly_fee: np.monthlyFee, monthly_hours: np.monthlyHours, pending_plan_id: null } : {}) }).eq("id", subId);
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
            case "invoice.voided": await admin.from("invoices").update({ status: "void", void_reason: "Voided in Stripe" }).eq("stripe_invoice_id", o.id); break;
            case "customer.subscription.updated": {
              const subId = await localSub();
              if (subId && o.status === "unpaid") await B.suspendForNonPayment(admin, subId, "Payment retries exhausted");
              if (subId && o.status === "past_due") await B.markPastDue(admin, subId, "Renewal payment overdue");
              break;
            }
            case "customer.subscription.deleted": {
              const subId = await localSub();
              if (subId) {
                await admin.from("subscriptions").update({ status: "cancelled", cancelled_at: new Date().toISOString() }).eq("id", subId).neq("status", "cancelled");
                await admin.from("projects").update({ status: "cancelled" }).eq("subscription_id", subId).in("status", ["planned", "active", "on_hold"]);
              }
              break;
            }
            case "charge.refunded": {
              const { data: tx } = await admin.from("transactions").select("*").eq("reference", o.invoice ?? "__").maybeSingle();
              const userId = (await admin.from("profiles").select("id").eq("stripe_customer_id", o.customer).maybeSingle()).data?.id;
              if (userId) await admin.from("transactions").insert({ user_id: userId, invoice_id: tx?.invoice_id ?? null, subscription_id: tx?.subscription_id ?? null, reference: `RF-${o.id}`, description: "Refund", amount: -(o.amount_refunded ?? 0) / 100, method: "stripe", status: "completed", stripe_id: `rf-${o.id}-${o.amount_refunded}` });
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
