import { createFileRoute, Link } from "@tanstack/react-router";
import { ErrorState, PageSkeleton } from "@/components/loading";
import { AlertTriangle, Check, Circle } from "lucide-react";
import { Section } from "@/components/admin/record-bits";
import { StatusBadge } from "@/components/admin/data-table";
import { ActBtn, invoiceTotal, useClient, useClientActions, type R } from "@/components/client/portal";
import { formatDate, formatDay, money } from "@/lib/admin";
import { onboardingSteps } from "@/lib/onboarding";

export const Route = createFileRoute("/dashboard/")({ component: Overview });

function Overview() {
  const { data, isLoading, error, userId } = useClient();
  const a = useClientActions();
  if (error) return <ErrorState error={error} retry={() => location.reload()} />;
  if (isLoading || !data) return <PageSkeleton />;
  const live = data.subs.filter((s) => ["active", "past_due", "paused", "suspended"].includes(s.status));
  const unpaid = data.invoices.filter((i) => i.status === "open" || i.status === "overdue");
  const approvals = data.tasks.filter((t) => t.over_allowance && !t.overage_approved && !["completed", "cancelled"].includes(t.status));
  const replies = data.messages.filter((m: R) => m.actor_id !== userId).slice(-3).reverse();
  const warnings = [
    ...data.subs.filter((s) => s.payment_warning).map((s) => `${s.plan_name} plan: ${s.payment_warning}`),
    ...live.filter((s) => Number(s.hours_used) > Number(s.monthly_hours)).map((s) => `${s.plan_name} plan is ${Number(s.hours_used) - Number(s.monthly_hours)} hours over its monthly allowance. Extra hours are billed separately.`),
    ...unpaid.filter((i) => i.status === "overdue").map((i) => `Invoice ${i.number} is overdue. Interest of 5% per month is added until it's paid.`),
  ];
  const p = data.profile;
  const reviews = data.deliverables.filter((d: R) => d.status === "in_review");
  const asks = data.apps.filter((x) => x.status === "info_requested");
  const steps = onboardingSteps({ apps: [...data.apps].reverse(), subs: data.subs, invoices: data.invoices, profile: p, brief: data.brief });
  const stepsLeft = steps.filter((x) => x.state !== "done").length;
  return <>
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h1 className="text-2xl font-extrabold sm:text-3xl">Welcome{p?.first_name ? `, ${p.first_name}` : ""}</h1>
      <div className="flex gap-2"><ActBtn onClick={a.order}>Add a plan</ActBtn><ActBtn dark onClick={() => a.newTicket()}>Get help</ActBtn></div>
    </div>
    {warnings.length > 0 && <div className="space-y-2">{warnings.map((w) => <p key={w} className="flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm"><AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" />{w}</p>)}</div>}
    {stepsLeft > 0 && <Section title={`Getting started, ${steps.length - stepsLeft} of ${steps.length} done`}>
      <ol className="divide-y">{steps.map((x) => {
        const body = <div className="flex items-start gap-3 px-5 py-3 text-sm">
          <span className={`mt-0.5 grid size-6 shrink-0 place-items-center rounded-full ${x.state === "done" ? "bg-foreground text-background" : x.state === "current" ? "border-2 border-primary" : "border"}`}>{x.state === "done" ? <Check className="size-3.5" /> : x.state === "current" ? <Circle className="size-2 fill-primary text-primary" /> : null}</span>
          <span className="min-w-0"><span className={`block font-semibold ${x.state === "todo" ? "text-muted-foreground" : ""}`}>{x.title}{x.state === "current" && <span className="ml-2 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">Next</span>}</span><span className="text-muted-foreground">{x.text}</span></span>
        </div>;
        if (x.state === "done" || !x.to) return <li key={x.id}>{body}</li>;
        return <li key={x.id}>{"section" in x.to
          ? <Link to="/dashboard/$section" params={{ section: x.to.section }} className="block hover:bg-secondary/60">{body}</Link>
          : <Link to="/dashboard/$kind/$id" params={{ kind: x.to.kind, id: x.to.id }} className="block hover:bg-secondary/60">{body}</Link>}</li>;
      })}</ol>
    </Section>}
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {([["Active plans", data.subs.filter((s) => s.status === "active").length], ["Hours used this month", `${live.reduce((x, s) => x + Number(s.hours_used), 0)} of ${live.reduce((x, s) => x + Number(s.monthly_hours), 0)}`],
        ["Open tasks", data.tasks.filter((t) => !["completed", "cancelled"].includes(t.status)).length], ["Amount due", money(unpaid.reduce((x, i) => x + invoiceTotal(i), 0))]] as const).map(([l, v]) => (
        <div key={l} className="rounded-2xl border bg-card p-4"><p className="text-sm text-muted-foreground">{l}</p><p className="mt-1 text-2xl font-bold">{v}</p></div>
      ))}
    </div>
    <div className="space-y-6">
      <Section title="Your plans">
        <ul className="divide-y">{data.subs.map((s) => {
          const pct = Math.min(100, (Number(s.hours_used) / Math.max(1, Number(s.monthly_hours))) * 100);
          return <li key={s.id}><Link to="/dashboard/$kind/$id" params={{ kind: "subscription", id: s.id }} className="block px-5 py-4 text-sm hover:bg-secondary/60">
            <div className="flex flex-wrap items-center justify-between gap-2"><span className="font-semibold">{s.plan_name} plan</span><StatusBadge status={s.status} /></div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-secondary"><div className={`h-full ${pct >= 100 ? "bg-destructive" : "bg-primary"}`} style={{ width: `${pct}%` }} /></div>
            <p className="mt-1 text-xs text-muted-foreground">{s.hours_used} of {s.monthly_hours} hours used{s.renews_at ? `, ${s.cancel_at_period_end ? "ends" : "renews"} ${formatDay(s.renews_at)}` : ""}</p></Link></li>;
        })}{data.subs.length === 0 && <li className="px-5 py-6 text-sm text-muted-foreground">No plans yet.</li>}</ul>
      </Section>
      <Section title="Needs your attention">
        <ul className="divide-y text-sm">
          {asks.map((x) => <li key={x.id} className="flex items-center justify-between gap-3 px-5 py-3"><span>We need more information for your {x.plan_name} application</span><Link to="/dashboard/$kind/$id" params={{ kind: "application", id: x.id }} className="h-8 shrink-0 rounded-full bg-foreground px-3 text-xs font-semibold leading-8 text-background">Reply</Link></li>)}
          {reviews.map((d: R) => <li key={d.id} className="flex items-center justify-between gap-3 px-5 py-3"><span>{d.title} is ready for your review</span><Link to="/dashboard/$kind/$id" params={{ kind: "deliverable", id: d.id }} className="h-8 shrink-0 rounded-full bg-foreground px-3 text-xs font-semibold leading-8 text-background">Review</Link></li>)}
          {unpaid.map((i) => <li key={i.id} className="flex items-center justify-between gap-3 px-5 py-3"><span>Invoice {i.number}, {money(invoiceTotal(i))}, due {formatDay(i.due_at)}</span>{i.hosted_url && <a href={i.hosted_url} target="_blank" rel="noopener noreferrer" className="h-8 shrink-0 rounded-full bg-foreground px-3 text-xs font-semibold leading-8 text-background">Pay now</a>}</li>)}
          {approvals.map((t) => <li key={t.id} className="flex items-center justify-between gap-3 px-5 py-3"><span>Extra hours needed for {t.title}</span><ActBtn dark onClick={() => a.approve(t)}>Approve</ActBtn></li>)}
          {replies.map((m: R) => <li key={m.id} className="px-5 py-3"><Link to="/dashboard/$kind/$id" params={{ kind: "ticket", id: m.ticket_id }} className="hover:underline">New reply from the FP team, {formatDate(m.created_at)}</Link></li>)}
          {asks.length + reviews.length + unpaid.length + approvals.length + replies.length === 0 && <li className="px-5 py-6 text-muted-foreground">You're all caught up.</li>}
        </ul>
      </Section>
    </div>
    {a.modalEl}
  </>;
}
