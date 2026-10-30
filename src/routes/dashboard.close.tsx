import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ErrorState, PageSkeleton } from "@/components/loading";
import { usePopup } from "@/components/popup";
import { useClient } from "@/components/client/portal";
import { DoneStep, FlowStep, NavButtons, ReasonForm, ReviewAndSign, applicationIssue, type Application } from "@/components/change-flow";
import { cancelNowAllowed } from "@/lib/billing";
import { submitAccountClosure } from "@/lib/changes.functions";
import { formatDay, money } from "@/lib/admin";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/dashboard/close")({
  head: () => ({ meta: [{ title: "Close your account — FP" }] }),
  component: ClosePage,
});

type Sub = { id: string; plan_name: string; monthly_fee: number; status: string; started_at: string | null; renews_at: string | null; cancel_at_period_end: boolean };

/** Account closure as a signed application. Plans end at the end of their paid period in Stripe, invoices stay payable, and the
 * account is closed (kept, not deleted) with sign-in blocked. */
function ClosePage() {
  const navigate = useNavigate();
  const popup = usePopup();
  const { data, isLoading, error, refetch } = useClient();
  const fnClose = useServerFn(submitAccountClosure);
  const [step, setStep] = useState(0);
  const [app, setApp] = useState<Application>({ reason: "", details: "", feedback: {} });
  if (isLoading) return <PageSkeleton />;
  if (error || !data?.profile) return <ErrorState error={error ?? new Error("We couldn't load your account.")} retry={() => void refetch()} />;
  const subs = ((data.subs ?? []) as Sub[]).filter((s) => s.status !== "cancelled");
  const unpaid = (data.invoices ?? []).filter((i: { status: string }) => ["open", "overdue"].includes(i.status));
  const owed = unpaid.reduce((n: number, i: { amount: number; interest_accrued: number; fees_accrued: number }) => n + Number(i.amount) + Number(i.interest_accrued) + Number(i.fees_accrued), 0);
  const ends = (s: Sub) => (cancelNowAllowed(s) ? "now (not started)" : s.renews_at ? formatDay(s.renews_at) : "end of the billing period");

  const submit = async (): Promise<boolean> => {
    try {
      await fnClose({ data: { reason: app.reason, signed: true, ...(app.details.trim() ? { details: app.details.trim() } : {}), ...(Object.keys(app.feedback).length ? { feedback: app.feedback } : {}) } });
      setStep(3);
      await supabase.auth.signOut();
      return true;
    } catch (e) { popup({ type: "error", title: "We couldn't close your account", description: (e as Error).message, primaryLabel: "Close", secondaryLabel: null }); return false; }
  };

  if (step === 0) return <FlowStep title="Close your account" subtitle="Before you go, here's exactly what happens.">
    <ul className="divide-y border-y text-sm">
      <li className="py-3"><span className="font-medium">Your plans end at the end of their paid period.</span> <span className="text-muted-foreground">We don't end plans early or charge you again.</span></li>
      {subs.map((s) => <li key={s.id} className="flex justify-between gap-3 py-3"><span>{s.plan_name}, {money(Number(s.monthly_fee))}/month</span><span className="text-muted-foreground">ends {ends(s)}</span></li>)}
      <li className="py-3"><span className="font-medium">Invoices stay payable.</span> <span className="text-muted-foreground">{unpaid.length ? `You have ${unpaid.length} unpaid invoice${unpaid.length > 1 ? "s" : ""} (${money(owed)}). Closing doesn't cancel them.` : "You have no unpaid invoices."}</span></li>
      <li className="py-3"><span className="font-medium">You'll be signed out and can't sign in again.</span> <span className="text-muted-foreground">Contact us to reopen the account.</span></li>
      <li className="py-3"><span className="font-medium">Your records are kept.</span> <span className="text-muted-foreground">Invoices, payments and signed agreements are kept as the law requires. To have your personal details removed, make a privacy request on your Profile page.</span></li>
    </ul>
    <NavButtons onBack={() => navigate({ to: "/dashboard/$section", params: { section: "profile" } })} onNext={() => setStep(1)} nextLabel="Continue" />
  </FlowStep>;

  if (step === 1) return <FlowStep title="Why are you leaving?" subtitle="Your answers go to our team and help us improve.">
    <ReasonForm kind="close_account" value={app} onChange={setApp} />
    <NavButtons onBack={() => setStep(0)} onNext={() => { const issue = applicationIssue(app); if (issue) { popup({ type: "error", title: "Almost there", description: issue, primaryLabel: "OK", secondaryLabel: null }); return; } setStep(2); }} nextLabel="Review" />
  </FlowStep>;

  if (step === 2) return <FlowStep title="Review and sign" subtitle="Your account is closed as soon as you sign.">
    <ReviewAndSign onBack={() => setStep(1)} signTitle="Confirm closing your account" onSign={submit} confirmLabel="Sign and close account"
      rows={[["Change", "Close my account"], ["Plans", subs.length ? subs.map((s) => `${s.plan_name} (ends ${ends(s)})`).join(", ") : "None"], ["Unpaid invoices", unpaid.length ? `${unpaid.length}, ${money(owed)}` : "None"], ["Reason", app.reason]]}
      notes={["Every plan is cancelled in billing at the end of its paid period.", "Unpaid invoices remain payable and follow the normal collections process.", "You're signed out on every device straight away."]} />
  </FlowStep>;

  return <DoneStep title="Your account is closed" text="Your plans will end at the end of their paid periods. We've sent your reasons to our team. Thank you for working with us." action={<Button className="signup-primary" onClick={() => navigate({ to: "/" })}>Done</Button>} />;
}
