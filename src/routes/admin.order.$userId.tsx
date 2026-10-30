import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ErrorState, PageSkeleton } from "@/components/loading";
import { OrderWizard } from "@/components/order-flow";
import { supabase } from "@/integrations/supabase/client";
import { createOrder } from "@/lib/billing.functions";

export const Route = createFileRoute("/admin/order/$userId")({
  head: () => ({ meta: [{ title: "New order — FP admin" }] }),
  component: AdminOrder,
});

/** Staff place an order for a client with the same plans and agreements the client sees. */
function AdminOrder() {
  const { userId } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const fnOrder = useServerFn(createOrder);
  const q = useQuery({ queryKey: ["admin", "order-client", userId], queryFn: async () => {
    const r = await supabase.from("profiles").select("first_name, last_name, company, email, phone, country, address_line, city, state, postal_code, account_number").eq("id", userId).single();
    if (r.error) throw r.error;
    return r.data;
  } });
  if (q.isLoading) return <PageSkeleton />;
  if (q.error || !q.data) return <ErrorState error={q.error ?? new Error("Client not found.")} retry={() => void q.refetch()} />;
  const p = q.data;
  const address = [p.address_line, [p.city, p.state, p.postal_code].filter(Boolean).join(" ")].filter(Boolean).join(", ") || null;
  return <OrderWizard mode="staff" doneLabel="Back to the client"
    client={{ name: `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim() || p.email || "Client", company: p.company, email: p.email, phone: p.phone, country: p.country, address, accountNumber: p.account_number }}
    onPlace={async (plan) => { await fnOrder({ data: { userId, planId: plan.id } }); await qc.invalidateQueries({ queryKey: ["admin"] }); }}
    onDone={() => navigate({ to: "/admin/accounts/$id", params: { id: userId } })} />;
}
