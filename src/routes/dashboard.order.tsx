import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { ErrorState, PageSkeleton } from "@/components/loading";
import { OrderWizard } from "@/components/order-flow";
import { useClient } from "@/components/client/portal";
import { invoicePaymentDetails, orderAdditionalPlan } from "@/lib/client.functions";
import { planFromSearch, type PlanId } from "@/lib/signup";

export const Route = createFileRoute("/dashboard/order")({
  validateSearch: (s: Record<string, unknown>): { plan?: PlanId } => { const plan = planFromSearch(s["plan"]); return plan ? { plan } : {}; },
  head: () => ({ meta: [{ title: "Add a plan — FP" }] }),
  component: OrderPage,
});

/** Signed-in clients add a plan with the same plans, agreements and signature as signup. */
function OrderPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data, isLoading, error, refetch, email } = useClient();
  const fnOrder = useServerFn(orderAdditionalPlan);
  const fnPayment = useServerFn(invoicePaymentDetails);
  const { plan } = Route.useSearch();
  if (isLoading) return <PageSkeleton />;
  if (error || !data?.profile) return <ErrorState error={error ?? new Error("We couldn't load your account.")} retry={() => void refetch()} />;
  const p = data.profile;
  const address = [p.address_line, [p.city, p.state, p.postal_code].filter(Boolean).join(" ")].filter(Boolean).join(", ") || null;
  return <OrderWizard mode="client" doneLabel="Go to my dashboard" {...(plan ? { initialPlan: plan } : {})}
    client={{ name: `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim() || email, company: p.company, email: p.email ?? email, phone: p.phone, country: p.country, address, accountNumber: p.account_number }}
    onPlace={async (plan) => { const placed = await fnOrder({ data: { planId: plan.id, signed: true } }); await qc.invalidateQueries({ queryKey: ["client"] }); return placed; }}
    loadPayment={(invoiceId) => fnPayment({ data: { invoiceId } })}
    onDone={() => { void qc.invalidateQueries({ queryKey: ["client"] }); void navigate({ to: "/dashboard" }); }} />;
}
