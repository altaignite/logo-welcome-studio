import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Check, Copy, RefreshCw, X } from "lucide-react";
import { Btn, Section } from "@/components/admin/record-bits";
import { ErrorState, SectionSkeleton, Spinner } from "@/components/loading";
import { usePopup } from "@/components/popup";
import { formatDate } from "@/lib/admin";
import { sendFirstInvoice, stripeHealth } from "@/lib/billing.functions";

/** Stripe setup status with the exact fixes, plus plans that are waiting for their first invoice. */
export function StripeHealth() {
  const qc = useQueryClient();
  const popup = usePopup();
  const check = useServerFn(stripeHealth), send = useServerFn(sendFirstInvoice);
  const [busy, setBusy] = useState<string | null>(null);
  const q = useQuery({ queryKey: ["admin", "stripe-health"], queryFn: () => check() });
  const resend = async (id: string) => {
    setBusy(id);
    try { await send({ data: { subscriptionId: id } }); await qc.invalidateQueries({ queryKey: ["admin"] }); popup({ type: "success", title: "Invoice sent", description: "Stripe emailed the first invoice. The plan starts when it's paid.", primaryLabel: "Done", secondaryLabel: null }); }
    catch (e) { popup({ type: "error", title: "Stripe didn't send the invoice", description: (e as Error).message, primaryLabel: "Close", secondaryLabel: null }); }
    setBusy(null);
  };
  return (
    <Section title="Stripe connection" actions={<Btn icon={RefreshCw} onClick={() => void q.refetch()}>Check again</Btn>}>
      {q.isLoading ? <SectionSkeleton lines={5} /> : q.error ? <div className="p-5"><ErrorState error={q.error} retry={() => void q.refetch()} /></div> : q.data && <div className="space-y-4 p-5 text-sm">
        <ul className="space-y-2">{q.data.checks.map((c) => <li key={c.label} className="flex items-start gap-2">
          <span className={`mt-0.5 grid size-5 shrink-0 place-items-center rounded-full ${c.ok ? "bg-emerald-600 text-white" : "bg-destructive text-white"}`}>{c.ok ? <Check className="size-3" /> : <X className="size-3" />}</span>
          <span><span className="font-medium">{c.label}</span><span className="block break-words text-xs text-muted-foreground">{c.detail}</span></span></li>)}</ul>
        <div className="rounded-xl bg-secondary/60 p-3 text-xs">
          <p className="font-semibold">Webhook endpoint for Stripe</p>
          <p className="mt-1 flex items-center gap-2 break-all font-mono">{q.data.webhookUrl}
            <button type="button" aria-label="Copy webhook URL" onClick={() => void navigator.clipboard.writeText(q.data!.webhookUrl)}><Copy className="size-3.5" /></button></p>
          <p className="mt-2 text-muted-foreground">Events: {q.data.events.join(", ")}</p>
        </div>
        {q.data.waiting.length > 0 && <div>
          <p className="font-semibold">Plans waiting for a first invoice ({q.data.waiting.length})</p>
          <ul className="mt-2 divide-y rounded-xl border">{q.data.waiting.map((w) => <li key={w.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
            <Link to="/admin/records/$kind/$id" params={{ kind: "subscriptions", id: w.id }} className="hover:underline">{w.plan_name} plan, created {formatDate(w.created_at)}</Link>
            <button type="button" disabled={busy === w.id} onClick={() => resend(w.id)} className="inline-flex h-8 items-center gap-1.5 rounded-full bg-foreground px-3 text-xs font-semibold text-background">{busy === w.id && <Spinner className="size-3.5" />}Send invoice</button></li>)}</ul>
          <p className="mt-1 text-xs text-muted-foreground">New signups wait here until their application is approved; approval sends the invoice.</p>
        </div>}
      </div>}
    </Section>
  );
}
