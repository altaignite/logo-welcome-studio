import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Download, RefreshCw } from "lucide-react";
import { Section } from "@/components/admin/record-bits";
import { Spinner } from "@/components/loading";
import { usePopup } from "@/components/popup";
import { importFromStripe, syncStripeNow } from "@/lib/billing.functions";

type Counts = { customers: number; clientsCreated: number; clientsLinked: number; subscriptions: number; invoices: number; payments: number; skipped: string[] };
const zero = (): Counts => ({ customers: 0, clientsCreated: 0, clientsLinked: 0, subscriptions: 0, invoices: 0, payments: 0, skipped: [] });

/** Imports clients, subscriptions, invoices and payments from Stripe, and re-syncs every status on demand. */
export function StripeImport() {
  const qc = useQueryClient();
  const popup = usePopup();
  const runImport = useServerFn(importFromStripe), runSync = useServerFn(syncStripeNow);
  const [busy, setBusy] = useState<"import" | "sync" | null>(null);
  const [totals, setTotals] = useState<Counts | null>(null);
  const importAll = () => popup({
    type: "info", title: "Import everything from Stripe?",
    description: "Every Stripe customer becomes a client (matched by email if they already exist), with their subscriptions, invoices and payments. Existing records are updated, nothing is duplicated, and no emails are sent.",
    primaryLabel: "Import", secondaryLabel: "Cancel",
    onPrimary: async () => {
      setBusy("import");
      const t = zero(); setTotals({ ...t });
      try {
        let cursor: string | undefined;
        for (let page = 0; page < 500; page++) {
          const r = await runImport({ data: cursor ? { cursor } : {} });
          for (const k of ["customers", "clientsCreated", "clientsLinked", "subscriptions", "invoices", "payments"] as const) t[k] += r.counts[k];
          t.skipped.push(...r.counts.skipped); setTotals({ ...t, skipped: [...t.skipped] });
          if (!r.next) break;
          cursor = r.next;
        }
        await qc.invalidateQueries({ queryKey: ["admin"] });
      } catch (e) { popup({ type: "error", title: "The import stopped", description: (e as Error).message, primaryLabel: "Close", secondaryLabel: null }); }
      setBusy(null);
    },
  });
  const syncAll = async () => {
    setBusy("sync");
    try {
      const r = await runSync(); await qc.invalidateQueries({ queryKey: ["admin"] });
      popup({ type: "success", title: "Synced with Stripe", description: `${r.subs} subscriptions and ${r.invoices} invoices checked against Stripe.`, primaryLabel: "Done", secondaryLabel: null });
    } catch (e) { popup({ type: "error", title: "Sync failed", description: (e as Error).message, primaryLabel: "Close", secondaryLabel: null }); }
    setBusy(null);
  };
  const btn = "inline-flex h-10 items-center gap-2 rounded-full px-5 text-sm font-semibold disabled:opacity-60";
  return (
    <Section title="Stripe data">
      <div className="space-y-4 p-5 text-sm">
        <p className="text-muted-foreground">Stripe is the source of truth for billing. Statuses update from Stripe's webhook as they happen and are re-checked every day. Use these to bring in existing Stripe data or force a check now.</p>
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={!!busy} onClick={importAll} className={`${btn} bg-foreground text-background`}>{busy === "import" ? <Spinner /> : <Download className="size-4" />}Import from Stripe</button>
          <button type="button" disabled={!!busy} onClick={syncAll} className={`${btn} border`}>{busy === "sync" ? <Spinner /> : <RefreshCw className="size-4" />}Sync all statuses now</button>
        </div>
        {totals && <div className="rounded-xl bg-secondary/60 p-3">
          <p className="font-semibold">{busy === "import" ? "Importing…" : "Import finished"}</p>
          <p className="mt-1 text-muted-foreground">{totals.customers} Stripe customers: {totals.clientsCreated} new clients, {totals.clientsLinked} linked to existing clients, {totals.subscriptions} subscriptions, {totals.invoices} invoices, {totals.payments} payments recorded.</p>
          {totals.skipped.length > 0 && <details className="mt-2"><summary className="cursor-pointer">{totals.skipped.length} skipped</summary><ul className="mt-1 list-disc pl-5 text-xs">{totals.skipped.slice(0, 200).map((x, i) => <li key={i}>{x}</li>)}</ul></details>}
          {totals.clientsCreated > 0 && !busy && <p className="mt-2 text-xs text-muted-foreground">New clients have no password yet. They can use "Forgot password" on the sign-in page, or send them a reset email from their account's Security tab.</p>}
        </div>}
      </div>
    </Section>
  );
}
