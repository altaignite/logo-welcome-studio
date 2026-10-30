import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ErrorState, PageSkeleton } from "@/components/loading";
import { usePopup } from "@/components/popup";
import { useClient } from "@/components/client/portal";
import { AgreementsList, PlanCards } from "@/components/order-flow";
import { DoneStep, FlowStep, NavButtons, ReasonForm, ReviewAndSign, applicationIssue, type Application } from "@/components/change-flow";
import { agreementDocuments } from "@/lib/agreements";
import { cancelNowAllowed } from "@/lib/billing";
import { submitCancellation, submitPlanChange } from "@/lib/changes.functions";
import { planChangeTiming } from "@/lib/client";
import { formatDay, money } from "@/lib/admin";
import { plans, type Plan } from "@/lib/signup";

export const Route = createFileRoute("/dashboard/change/$id")({
  validateSearch: (s: Record<string, unknown>): { action?: "cancel" } => (s["action"] === "cancel" ? { action: "cancel" } : {}),
  head: () => ({ meta: [{ title: "Change or cancel your plan — FP" }] }),
  component: ChangePage,
});

/** Upgrade, downgrade or cancel as a signed application, in the signup style. Actioned at once and kept for staff review. */
function ChangePage() {
  const { id } = Route.useParams();
  const { action } = Route.useSearch();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const popup = usePopup();
  const { data, isLoading, error, refetch, email } = useClient();
  const fnChange = useServerFn(submitPlanChange), fnCancel = useServerFn(submitCancellation);
  const [mode, setMode] = useState<"cancel" | "change" | null>(action === "cancel" ? "cancel" : null);
  const [target, setTarget] = useState<Plan | null>(null);
  const [step, setStep] = useState(action === "cancel" ? 1 : 0);
  const [app, setApp] = useState<Application>({ reason: "", details: "", feedback: {} });
  const [result, setResult] = useState<{ effectiveAt: string | null; immediate?: boolean } | null>(null);
  if (isLoading) return <PageSkeleton />;
  const sub = data?.subs?.find((s: { id: string }) => s.id === id);
  if (error || !sub || !data?.profile) return <ErrorState error={error ?? new Error("We couldn't find this plan.")} retry={() => void refetch()} />;
  const current = plans.find((p) => p.name === sub.plan_name);
  const kind = mode === "cancel" ? "cancel" : target && current && planChangeTiming(current.name, target.id) === "now" ? "upgrade" : "downgrade";
  const renews = sub.renews_at ? formatDay(sub.renews_at) : "the end of your billing period";
  const immediateCancel = cancelNowAllowed(sub);
  const p = data.profile;
  const client = { name: `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim() || email, company: p.company, email: p.email ?? email, phone: p.phone, country: p.country, accountNumber: p.account_number };
  const unpaid = (data.invoices ?? []).filter((i: { subscription_id: string; status: string }) => i.subscription_id === sub.id && ["open", "overdue"].includes(i.status)).length;

  const submit = async (): Promise<boolean> => {
    try {
      const body = { subscriptionId: sub.id, reason: app.reason, signed: true as const, ...(app.details.trim() ? { details: app.details.trim() } : {}), ...(Object.keys(app.feedback).length ? { feedback: app.feedback } : {}) };
      const r = mode === "cancel" ? await fnCancel({ data: body }) : await fnChange({ data: { ...body, planId: target!.id } });
      setResult(r); setStep(3); await qc.invalidateQueries({ queryKey: ["client"] }); return true;
    } catch (e) { popup({ type: "error", title: "We couldn't submit your application", description: (e as Error).message, primaryLabel: "Close", secondaryLabel: null }); return false; }
  };
  const nextFromReason = () => { const issue = applicationIssue(app); if (issue) { popup({ type: "error", title: "Almost there", description: issue, primaryLabel: "OK", secondaryLabel: null }); return; } setStep(2); };

  if (sub.status !== "active" && !(mode === "cancel" && ["pending", "past_due", "paused"].includes(sub.status))) {
    return <FlowStep title="This plan can't be changed right now" subtitle={`It's ${String(sub.status).replace("_", " ")}. Contact support if you need help.`}><Button className="signup-primary" onClick={() => navigate({ to: "/dashboard/$section", params: { section: "subscriptions" } })}>Back to my plans</Button></FlowStep>;
  }

  if (step === 0) return <FlowStep wide title="Change your plan" subtitle={`You're on the ${sub.plan_name} plan. Upgrades start now; downgrades start at your next renewal on ${renews}.`}>
    <PlanCards {...(current ? { current: current.id } : {})} onChoose={(pl) => { setMode("change"); setTarget(pl); setStep(1); }} />
    <p className="mt-6 text-center text-sm text-muted-foreground">Want to stop instead? <button type="button" className="font-medium text-foreground underline underline-offset-4" onClick={() => { setMode("cancel"); setStep(1); }}>Cancel this plan</button></p>
  </FlowStep>;

  if (step === 1) return <FlowStep title={mode === "cancel" ? "Why are you cancelling?" : `Why ${kind === "upgrade" ? "upgrade" : "downgrade"} to ${target?.name}?`} subtitle="Your answers help our team review the change and improve our service.">
    <ReasonForm kind={kind} value={app} onChange={setApp} />
    <NavButtons onBack={() => (action === "cancel" ? navigate({ to: "/dashboard/$section", params: { section: "subscriptions" } }) : setStep(0))} onNext={nextFromReason} nextLabel="Review" />
  </FlowStep>;

  if (step === 2) {
    const rows: [string, string][] = mode === "cancel"
      ? [["Plan", `${sub.plan_name}, ${money(Number(sub.monthly_fee))}/month`], ["Change", "Cancel the plan"], ["Effective", immediateCancel ? "Now (the plan hasn't started)" : `End of the billing period, ${renews}`], ["Reason", app.reason]]
      : [["Current plan", `${sub.plan_name}, ${money(Number(sub.monthly_fee))}/month`], ["New plan", `${target!.name}, ${money(target!.monthlyFee)}/month, ${target!.monthlyHours} hours`], ["Effective", kind === "upgrade" ? "Now" : `Next renewal, ${renews}`], ["Reason", app.reason]];
    const notes = mode === "cancel"
      ? (immediateCancel ? ["This order never started, so it ends now and its unpaid first invoice is cancelled."] : [`Your plan, hours and projects continue until ${renews}. You won't be charged again.`, "Cancellations take effect at the end of the paid period; there are no refunds for the current period except under the money-back guarantee.", ...(unpaid ? [`${unpaid} unpaid invoice${unpaid > 1 ? "s" : ""} on this plan must still be paid.`] : []), "You can keep the plan any time before it ends from your Plans page."])
      : kind === "upgrade" ? [`You get ${target!.monthlyHours} hours a month from today.`, "Stripe charges the prorated difference for the rest of this billing period now."] : [`You keep your current hours until ${renews}, then move to ${target!.monthlyHours} hours a month.`, `Your next invoice will be ${money(target!.monthlyFee)}.`];
    return <FlowStep title="Review and sign" subtitle="Check the details. Your change is applied as soon as you sign.">
      <ReviewAndSign rows={rows} notes={notes} onBack={() => setStep(1)} signTitle={mode === "cancel" ? "Confirm your cancellation" : "Confirm your plan change"} onSign={submit} confirmLabel={mode === "cancel" ? "Sign and cancel" : "Accept & sign"}>
        {mode === "change" && <div className="mt-6"><p className="mb-2 text-sm font-semibold">Agreements for the {target!.name} plan</p><AgreementsList documents={agreementDocuments(target!, client)} /></div>}
      </ReviewAndSign>
    </FlowStep>;
  }

  return <DoneStep title={mode === "cancel" ? "Cancellation confirmed" : kind === "upgrade" ? "Plan upgraded" : "Downgrade scheduled"}
    text={mode === "cancel" ? (result?.immediate ? "Your order has been cancelled and its unpaid invoice withdrawn." : `Your ${sub.plan_name} plan continues until ${result?.effectiveAt ? formatDay(result.effectiveAt) : renews}, then ends. We've sent your reasons to our team.`) : kind === "upgrade" ? `You're now on the ${target!.name} plan.` : `Your plan moves to ${target!.name} on ${renews}.`}
    action={<Button className="signup-primary" onClick={() => navigate({ to: "/dashboard/$section", params: { section: "subscriptions" } })}>Back to my plans</Button>} />;
}
