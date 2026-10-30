import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { ArrowLeft } from "lucide-react";
import { DataTable, StatusBadge } from "@/components/admin/data-table";
import { FieldGrid, Section } from "@/components/admin/record-bits";
import { ActBtn, Actions, SubButtons, invoiceTotal, useClient, useClientActions, type R, type RecordKind } from "@/components/client/portal";
import { formatDate, formatDay, humanize, money, statusLabel, type AppStatus } from "@/lib/admin";
import { stageLabel, type CollectionStage } from "@/lib/billing";
import { plans } from "@/lib/signup";
import { DocumentList, UploadButton } from "@/components/files";
import { guaranteeCheck } from "@/lib/billing";
import { departmentLabel } from "@/lib/support";
import { Check, X as Cross } from "lucide-react";
import { deliverableLabel, metricTone, type Metric } from "@/lib/work";

const kinds: RecordKind[] = ["subscription", "project", "task", "invoice", "payment", "application", "ticket", "deliverable", "report"];
const back: Record<RecordKind, [string, string]> = {
  subscription: ["subscriptions", "Subscriptions"], project: ["projects", "Projects"], task: ["tasks", "Tasks"], invoice: ["invoices", "Invoices"],
  payment: ["payments", "Payments"], application: ["applications", "Applications"], ticket: ["support", "Support"],
  deliverable: ["deliverables", "Deliverables"], report: ["reports", "Reports"],
};

export const Route = createFileRoute("/dashboard/$kind/$id")({
  beforeLoad: ({ params }) => { if (!(kinds as string[]).includes(params.kind)) throw notFound(); },
  component: Details,
});

function Details() {
  const { kind: k, id } = Route.useParams();
  const kind = k as RecordKind;
  const { data, isLoading, error, userId } = useClient();
  const a = useClientActions();
  if (error) return <p className="text-sm text-destructive">{(error as Error).message}</p>;
  if (isLoading || !data) return <p className="text-sm text-muted-foreground">Loading…</p>;
  const list: Record<RecordKind, R[]> = { subscription: data.subs, project: data.projects, task: data.tasks, invoice: data.invoices, payment: data.payments, application: data.apps, ticket: data.tickets, deliverable: data.deliverables, report: data.reports };
  const docsFor = (table: string, rid: string) => data.documents.filter((d: R) => d.related_table === table && d.related_id === rid);
  const r = list[kind].find((x) => x.id === id);
  const [sec, label] = back[kind];
  const header = (title: string, status?: ReactNode, actions?: ReactNode) => <>
    <Link to="/dashboard/$section" params={{ section: sec }} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" />{label}</Link>
    <div className="flex flex-wrap items-center justify-between gap-3"><div className="flex flex-wrap items-center gap-3"><h1 className="text-2xl font-extrabold">{title}</h1>{status}</div><div className="flex flex-wrap gap-2">{actions}</div></div>
  </>;
  if (!r) return <>{header("Not found")}<p className="text-sm text-muted-foreground">This record doesn't exist or isn't on your account.</p></>;
  const subOf = (sid: string | null) => data.subs.find((s) => s.id === sid);
  const subLink = (sid: string | null) => { const s = subOf(sid); return s ? <Link to="/dashboard/$kind/$id" params={{ kind: "subscription", id: s.id }} className="underline">{s.plan_name} plan</Link> : "—"; };
  const miniTable = (title: string, rows: R[], rk: RecordKind, cols: [string, (x: R) => ReactNode][]) => (
    <DataTable<R> title={title} rows={rows} searchable={false} empty={`No ${title.toLowerCase()}.`} columns={[
      ...cols.map(([l, f], i) => ({ key: String(i), label: l, value: (x: R) => String(f(x) ?? ""), render: f })),
      { key: "x", label: "Actions", value: () => "", render: (x: R) => <Actions kind={rk} id={x.id} /> },
    ]} />
  );
  const tasksTable = (rows: R[]) => miniTable("Tasks", rows, "task", [["Task", (x) => x.title], ["Status", (x) => <StatusBadge status={x.status} />], ["Due", (x) => formatDay(x.due_at)]]);
  const invTable = (rows: R[]) => miniTable("Invoices", rows, "invoice", [["Invoice", (x) => x.number], ["Total", (x) => money(invoiceTotal(x))], ["Status", (x) => <StatusBadge status={x.status} />]]);
  const payTable = (rows: R[]) => miniTable("Payments", rows, "payment", [["Reference", (x) => x.reference], ["Amount", (x) => money(x.amount)], ["Date", (x) => formatDate(x.created_at)]]);
  const hoursList = (rows: R[]) => <Section title="Hours log"><ul className="divide-y text-sm">{rows.map((h) => <li key={h.id} className="flex justify-between gap-3 px-5 py-3"><span>{h.description}</span><span className="shrink-0 text-muted-foreground">{h.hours} h, {formatDay(h.worked_on)}</span></li>)}{rows.length === 0 && <li className="px-5 py-6 text-muted-foreground">No hours logged yet.</li>}</ul></Section>;

  if (kind === "subscription") {
    const projects = data.projects.filter((p) => p.subscription_id === r.id);
    const pIds = new Set(projects.map((p) => p.id));
    const pending = plans.find((p) => p.id === r.pending_plan_id);
    const guarantee = guaranteeCheck(r, data.invoices.filter((i) => i.subscription_id === r.id));
    return <>
      {header(`${r.plan_name} plan`, <StatusBadge status={r.status} />, <><SubButtons s={r} a={a} />{guarantee.eligible && <ActBtn dark onClick={() => a.claim(r)}>Request money-back refund</ActBtn>}<ActBtn onClick={() => a.newTicket(r.id)}>Get help</ActBtn></>)}
      {r.payment_warning && <p className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm">{r.payment_warning}</p>}
      <Section title="Plan">
        <FieldGrid items={[["Monthly fee", money(r.monthly_fee)], ["Hours this month", `${r.hours_used} of ${r.monthly_hours}`], ["Started", formatDay(r.started_at)],
          [r.cancel_at_period_end ? "Ends" : "Renews", formatDay(r.renews_at)], ["Scheduled change", pending ? `Moves to ${pending.name} at renewal` : "—"],
          ["Money-back guarantee", r.guarantee_status === "running" ? `Until ${formatDay(r.guarantee_ends_at)}` : r.guarantee_status === "void" ? `Ended: ${r.guarantee_void_reason ?? "conditions not met"}` : r.guarantee_status === "claimed" ? "Claim under review" : humanize(r.guarantee_status)]]} />
      </Section>
      {(["running", "claimed", "refunded"].includes(r.guarantee_status) || r.started_at) && <Section title="90-day money-back guarantee">
        <div className="p-5 text-sm">
          {r.guarantee_status === "claimed" ? <p>Your refund request was sent on {formatDate(r.guarantee_claimed_at)}. We'll reply in your support tickets.</p>
            : r.guarantee_status === "refunded" ? <p>Your service fees were refunded under the guarantee.</p>
            : <p className="text-muted-foreground">If you receive no sales, you can request a refund of your service fees after your plan has run for 90 days, as long as every invoice was paid on time. Advertising budgets aren't covered.</p>}
          {r.guarantee_status === "running" && <ul className="mt-3 space-y-2">{guarantee.checks.map((c) => <li key={c.label} className="flex items-start gap-2">
            <span className={`mt-0.5 grid size-5 shrink-0 place-items-center rounded-full ${c.ok ? "bg-foreground text-background" : "border"}`}>{c.ok ? <Check className="size-3" /> : <Cross className="size-3 text-muted-foreground" />}</span>
            <span><span className="font-medium">{c.label}</span><span className="block text-xs text-muted-foreground">{c.detail}</span></span></li>)}</ul>}
          {guarantee.eligible && <div className="mt-4"><ActBtn dark onClick={() => a.claim(r)}>Request money-back refund</ActBtn></div>}
        </div>
      </Section>}
      {miniTable("Projects", projects, "project", [["Project", (x) => x.name], ["Status", (x) => <StatusBadge status={x.status} />], ["Hours", (x) => x.hours]])}
      {tasksTable(data.tasks.filter((t) => t.subscription_id === r.id || pIds.has(t.project_id)))}
      {hoursList(data.hours.filter((h) => pIds.has(h.project_id)))}
      {invTable(data.invoices.filter((i) => i.subscription_id === r.id))}
      {payTable(data.payments.filter((p) => p.subscription_id === r.id))}
      {miniTable("Support tickets", data.tickets.filter((t) => t.subscription_id === r.id), "ticket", [["Subject", (x) => x.subject], ["Status", (x) => <StatusBadge status={x.status} />]])}
      {a.modalEl}
    </>;
  }
  if (kind === "project") return <>
    {header(r.name, <StatusBadge status={r.status} />)}
    <Section title="Project"><FieldGrid items={[["Plan", subLink(r.subscription_id)], ["Service", r.service], ["Hours logged", r.hours], ["Started", formatDay(r.started_at)], ["Due", formatDay(r.due_at)], ["Completed", formatDate(r.completed_at)], ["Description", r.description ?? "—"]]} /></Section>
    {miniTable("Deliverables", data.deliverables.filter((d: R) => d.project_id === r.id), "deliverable", [["Deliverable", (x) => x.title], ["Status", (x) => <StatusBadge status={x.status} label={deliverableLabel[x.status]} />]])}
    {tasksTable(data.tasks.filter((t) => t.project_id === r.id))}
    {hoursList(data.hours.filter((h) => h.project_id === r.id))}
  </>;
  if (kind === "task") return <>
    {header(r.title, <StatusBadge status={r.status} />, r.over_allowance && !r.overage_approved ? <ActBtn dark onClick={() => a.approve(r)}>Approve extra hours</ActBtn> : null)}
    <Section title="Task"><FieldGrid items={[["Plan", subLink(r.subscription_id)], ["Project", data.projects.find((p) => p.id === r.project_id)?.name ?? "—"], ["Priority", humanize(r.priority)], ["Due", formatDay(r.due_at)],
      ["Estimated hours", r.estimated_hours ?? "—"], ["Extra hours", r.over_allowance ? (r.overage_approved ? "Approved" : "Needs your approval") : "—"], ["Completed", formatDate(r.completed_at)], ["Details", r.details ?? "—"]]} /></Section>
    {hoursList(data.hours.filter((h) => h.task_id === r.id))}
    {a.modalEl}
  </>;
  if (kind === "invoice") return <>
    {header(`Invoice ${r.number}`, <StatusBadge status={r.status} />, <>
      {r.hosted_url && r.status !== "paid" && r.status !== "void" && <a href={r.hosted_url} target="_blank" rel="noopener noreferrer" className="h-8 rounded-full bg-foreground px-3 text-xs font-semibold leading-8 text-background">Pay now</a>}
      {r.pdf_url && <a href={r.pdf_url} target="_blank" rel="noopener noreferrer" className="h-8 rounded-full bg-secondary px-3 text-xs font-semibold leading-8">Download PDF</a>}
      <ActBtn onClick={() => a.newTicket(r.subscription_id ?? undefined)}>Question about this invoice</ActBtn></>)}
    <Section title="Invoice"><FieldGrid items={[["Description", r.description ?? "—"], ["Plan", subLink(r.subscription_id)], ["Amount", money(r.amount)], ["Interest", money(r.interest_accrued)], ["Fees", money(r.fees_accrued)], ["Total", money(invoiceTotal(r))],
      ["Issued", formatDay(r.issued_at)], ["Due", formatDay(r.due_at)], ["Paid", formatDate(r.paid_at)], ["Stage", r.collection_stage === "none" ? "—" : stageLabel[r.collection_stage as CollectionStage]]]} /></Section>
    {payTable(data.payments.filter((p) => p.invoice_id === r.id))}
    {a.modalEl}
  </>;
  if (kind === "payment") return <>
    {header(`Payment ${r.reference}`, <StatusBadge status={r.status} />)}
    <Section title="Payment"><FieldGrid items={[["Description", r.description], ["Amount", money(r.amount)], ["Method", humanize(r.method)], ["Date", formatDate(r.created_at)], ["Plan", subLink(r.subscription_id)],
      ["Invoice", r.invoice_id ? <Link key="i" to="/dashboard/$kind/$id" params={{ kind: "invoice", id: r.invoice_id }} className="underline">{data.invoices.find((i) => i.id === r.invoice_id)?.number ?? "View"}</Link> : "—"]]} /></Section>
  </>;
  if (kind === "application") {
    const sub = data.subs.find((s) => s.application_id === r.id);
    const events = data.events.filter((e: R) => e.application_id === r.id);
    return <>
      {header(`${r.plan_name} application`, <StatusBadge status={r.status} label={statusLabel[r.status as AppStatus]} />)}
      {r.status === "info_requested" && <div className="rounded-2xl border border-primary/30 bg-primary/5 p-4 text-sm">
        <p className="font-semibold">We need a little more information</p>
        <p className="mt-1 whitespace-pre-wrap">{[...events].reverse().find((e: R) => e.to_status === "info_requested")?.note ?? "See the timeline below."}</p>
        <div className="mt-3 flex flex-wrap gap-2"><ActBtn dark onClick={() => a.respond(r)}>Send your reply</ActBtn><UploadButton relatedTable="applications" relatedId={r.id} onDone={a.refresh} label="Upload a file" className="h-8 rounded-full bg-secondary px-3 text-xs font-semibold" /></div>
      </div>}
      <Section title="Application"><FieldGrid items={[["Plan", r.plan_name], ["Monthly fee", money(r.monthly_fee)], ["Monthly hours", r.monthly_hours], ["Submitted", formatDate(r.created_at)], ["Signed", formatDate(r.signed_at)], ["Decided", formatDate(r.decided_at)], ["Subscription", sub ? subLink(sub.id) : "—"]]} /></Section>
      <Section title="Timeline">
        <ol className="divide-y">{events.map((e: R) => <li key={e.id} className="px-5 py-3 text-sm">
          <p className="font-medium">{e.actor_id === userId ? "You replied" : e.to_status ? statusLabel[e.to_status as AppStatus] : e.action}</p>
          {e.note && <p className="mt-1 whitespace-pre-wrap rounded-lg bg-secondary/60 p-2">{e.note}</p>}
          <p className="mt-1 text-xs text-muted-foreground">{e.actor_id === userId ? "You" : "FP team"}, {formatDate(e.created_at)}</p>
        </li>)}{events.length === 0 && <li className="px-5 py-6 text-sm text-muted-foreground">No updates yet.</li>}</ol>
      </Section>
      {docsFor("applications", r.id).length > 0 && <Section title="Files you shared"><DocumentList docs={docsFor("applications", r.id)} /></Section>}
      {a.modalEl}
    </>;
  }
  if (kind === "deliverable") return <>
    {header(r.title, <StatusBadge status={r.status} label={deliverableLabel[r.status]} />, r.status === "in_review" ? <><ActBtn dark onClick={() => a.review(r, "approved")}>Approve</ActBtn><ActBtn onClick={() => a.review(r, "changes_requested")}>Request changes</ActBtn></> : null)}
    {r.status === "in_review" && <p className="rounded-xl border border-primary/30 bg-primary/5 p-3 text-sm">Please review the files below, then approve or tell us what to change.</p>}
    <Section title="Deliverable"><FieldGrid items={[["Project", data.projects.find((p) => p.id === r.project_id)?.name ?? "—"], ["Plan", subLink(r.subscription_id)], ["Sent for review", formatDate(r.submitted_at)],
      ["Review round", r.review_round || "—"], ["Due", formatDay(r.due_at)], ["Decided", formatDate(r.decided_at)], ["Description", r.description ?? "—"], ["Your feedback", r.client_feedback ?? "—"]]} /></Section>
    <Section title="Files" actions={r.status === "in_review" ? <UploadButton relatedTable="deliverables" relatedId={r.id} onDone={a.refresh} label="Add a file" /> : undefined}>
      <DocumentList docs={docsFor("deliverables", r.id)} empty="No files attached." />
    </Section>
    {a.modalEl}
  </>;
  if (kind === "report") {
    const metrics = (Array.isArray(r.metrics) ? r.metrics : []) as Metric[];
    return <>
      {header(r.title, <StatusBadge status="published" label={new Date(`${r.period_start}T00:00:00Z`).toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" })} />)}
      {metrics.length > 0 && <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{metrics.map((m) => <div key={m.label} className="rounded-2xl border bg-card p-4">
        <p className="text-sm text-muted-foreground">{m.label}</p><p className="mt-1 text-2xl font-bold">{m.value}</p>{m.change && <p className={`text-xs font-semibold ${metricTone(m.change)}`}>{m.change}</p>}</div>)}</div>}
      {r.summary && <Section title="Summary"><p className="whitespace-pre-wrap px-5 py-4 text-sm">{r.summary}</p></Section>}
      <Section title="Files"><DocumentList docs={docsFor("client_reports", r.id)} empty="No files attached." /></Section>
    </>;
  }
  const msgs = data.messages.filter((m: R) => m.ticket_id === r.id);
  return <>
    {header(r.subject, <StatusBadge status={r.status} />, r.status !== "closed" ? <ActBtn dark onClick={() => a.reply(r)}>Reply</ActBtn> : null)}
    <Section title="Conversation">
      <ul className="space-y-3 p-5">{msgs.map((m: R) => (
        <li key={m.id} className={`rounded-xl p-3 text-sm ${m.actor_id === userId ? "ml-8 bg-secondary" : "mr-8 border"}`}><p className="whitespace-pre-wrap">{m.body}</p><p className="mt-1 text-xs text-muted-foreground">{m.actor_id === userId ? "You" : "FP team"}, {formatDate(m.created_at)}</p></li>
      ))}</ul>
      {r.status === "closed" && <p className="border-t p-4 text-sm text-muted-foreground">This ticket is closed and can't be reopened or replied to. Open a new request if you need more help.</p>}
    </Section>
    <Section title="Files" actions={r.status !== "closed" ? <UploadButton relatedTable="support_tickets" relatedId={r.id} onDone={a.refresh} label="Attach a file" /> : undefined}>
      <DocumentList docs={docsFor("support_tickets", r.id)} empty="No files attached." />
    </Section>
    <Section title="Ticket"><FieldGrid items={[["Department", departmentLabel(r.department ?? r.category)], ["Reply by", humanize(r.contact_preference ?? "dashboard")], ["Priority", humanize(r.priority)], ["Plan", subLink(r.subscription_id)], ["Opened", formatDate(r.created_at)], ["Closed", formatDate(r.closed_at)]]} /></Section>
    {a.modalEl}
  </>;
}
