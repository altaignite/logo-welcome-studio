import { NY_MAX_MONTHLY_INTEREST_PCT, cappedInterestPct } from "@/lib/billing";
import { createFileRoute } from "@tanstack/react-router";
import { PageSkeleton } from "@/components/loading";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { db, Section } from "@/components/admin/record-bits";
import { usePopup } from "@/components/popup";
import { SwitchField } from "@/components/switch-field";
import { defaultRules, type BillingRules } from "@/lib/billing";
import { runCollectionsNow } from "@/lib/billing.functions";
import { StripeHealth } from "@/components/admin/stripe-health";
import { StripeImport } from "@/components/admin/stripe-import";

export const Route = createFileRoute("/admin/settings")({ component: Settings });

function F ({ label, children }: { label: string; children: React.ReactNode }) { return <label className="block text-sm"><span className="mb-1 block font-medium">{label}</span>{children}</label>; }

function Settings() {
  const qc = useQueryClient();
  const popup = usePopup();
  const run = useServerFn(runCollectionsNow);
  const { data } = useQuery({ queryKey: ["admin", "billing-rules"], queryFn: async () => ((await db.from("billing_settings").select("*").eq("id", 1).maybeSingle()).data ?? defaultRules) as BillingRules });
  const [r, setR] = useState<BillingRules | null>(null);
  useEffect(() => { if (data) setR(data); }, [data]);
  if (!r) return <PageSkeleton />;
  const num = (v: string) => Math.max(0, Number(v) || 0);
  const save = async () => {
    const { error } = await db.from("billing_settings").update({ ...r, updated_at: new Date().toISOString() }).eq("id", 1);
    popup(error ? { type: "error", title: "Couldn't save", description: error.message, primaryLabel: "Close", secondaryLabel: null } : { type: "success", title: "Billing rules saved", description: "New charges use these values.", primaryLabel: "Done", secondaryLabel: null });
    qc.invalidateQueries({ queryKey: ["admin"] });
  };
  const input = "signup-input h-10 w-full";
  return (
    <div className="max-w-3xl space-y-6">
      <div><h1 className="text-2xl font-extrabold sm:text-3xl">Billing rules</h1><p className="mt-1 text-sm text-muted-foreground">Extra-hour rates, interest and legal fees. Confirm these with your lawyer and show them in the client agreement.</p></div>
      <StripeHealth />
      <StripeImport />
      <Section title="Extra hours">
        <div className="grid gap-4 p-5 sm:grid-cols-3">
          {Object.keys(r.overage_rates).map((p) => <F key={p} label={`${p} rate per hour (USD)`}><input className={input} type="number" value={r.overage_rates[p]} onChange={(e) => setR({ ...r, overage_rates: { ...r.overage_rates, [p]: num(e.target.value) } })} /></F>)}
          <SwitchField className="sm:col-span-3" checked={r.overage_needs_approval} onCheckedChange={(v) => setR({ ...r, overage_needs_approval: v })} label="Extra hours need approval before time is logged" />
        </div>
      </Section>
      <Section title="Unpaid invoices">
        <div className="grid gap-4 p-5 sm:grid-cols-2">
          <F label={`Monthly interest, compounded (%), New York maximum ${NY_MAX_MONTHLY_INTEREST_PCT}`}><input className={input} type="number" step="0.01" min={0} max={NY_MAX_MONTHLY_INTEREST_PCT} value={r.monthly_interest_pct} onChange={(e) => setR({ ...r, monthly_interest_pct: cappedInterestPct(num(e.target.value)) })} /></F>
          <F label="Move to legal after (days unpaid)"><input className={input} type="number" value={r.legal_after_days} onChange={(e) => setR({ ...r, legal_after_days: num(e.target.value) })} /></F>
          <F label="Legal and collection fee (%)"><input className={input} type="number" value={r.legal_fee_pct} onChange={(e) => setR({ ...r, legal_fee_pct: num(e.target.value) })} /></F>
          <F label="Minimum legal fee (USD)"><input className={input} type="number" value={r.legal_fee_min} onChange={(e) => setR({ ...r, legal_fee_min: num(e.target.value) })} /></F>
        </div>
      </Section>
      <Section title="Court fees (added when escalated to court)">
        <div className="space-y-3 p-5">
          {r.court_fees.map((f, i) => (
            <div key={i} className="grid grid-cols-[1fr_8rem] gap-3">
              <input aria-label="Fee name" className={input} value={f.name} onChange={(e) => setR({ ...r, court_fees: r.court_fees.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)) })} />
              <input aria-label="Amount" className={input} type="number" value={f.amount} onChange={(e) => setR({ ...r, court_fees: r.court_fees.map((x, j) => (j === i ? { ...x, amount: num(e.target.value) } : x)) })} />
            </div>
          ))}
          <button type="button" className="text-sm font-medium underline" onClick={() => setR({ ...r, court_fees: [...r.court_fees, { name: "Other court fee", amount: 0 }] })}>Add fee</button>
        </div>
      </Section>
      <div className="flex flex-wrap gap-3">
        <button type="button" onClick={save} className="h-11 rounded-full bg-foreground px-6 text-sm font-semibold text-background">Save rules</button>
        <button type="button" onClick={async () => { try { const x = await run(); popup({ type: "success", title: "Collections updated", description: `${x.touched} unpaid invoices checked. This also runs automatically every day.`, primaryLabel: "Done", secondaryLabel: null }); qc.invalidateQueries({ queryKey: ["admin"] }); } catch (e) { popup({ type: "error", title: "Couldn't run collections", description: (e as Error).message, primaryLabel: "Close", secondaryLabel: null }); } }} className="h-11 rounded-full bg-secondary px-6 text-sm font-semibold">Run collections now</button>
      </div>
    </div>
  );
}
