import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { AlertTriangle, LogOut } from "lucide-react";
import logo from "@/assets/logo.png.asset.json";
import { supabase } from "@/integrations/supabase/client";
import { DataTable, StatusBadge } from "@/components/admin/data-table";
import { FormModal, type FieldDef } from "@/components/admin/form-modal";
import { Section, FieldGrid, db } from "@/components/admin/record-bits";
import { usePopup } from "@/components/popup";
import { formatAccount, formatDate, formatDay, money, statusLabel, type AppStatus } from "@/lib/admin";
import { pauseVoidsGuarantee, stageLabel, type CollectionStage } from "@/lib/billing";
import { approveOverage, billingPortal, subscriptionAction } from "@/lib/billing.functions";

export const Route = createFileRoute("/dashboard")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Client dashboard | FP Marketing Accelerator" },
      { name: "description", content: "Your plans, projects, tasks, billing and support in one place." },
      { property: "og:title", content: "Client dashboard | FP Marketing Accelerator" },
      { property: "og:description", content: "Your plans, projects, tasks, billing and support in one place." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw redirect({ to: "/" });
    return { userId: data.user.id, email: data.user.email ?? "" };
  },
  component: Dashboard,
});

const tabs = ["Overview", "Projects and tasks", "Subscriptions", "Applications", "Billing", "Support", "Profile"] as const;
type R = any;
type Modal = { title: string; description?: string; fields: FieldDef[]; submitLabel: string; onSubmit: (v: any) => Promise<string | null> };

function Dashboard() {
  const { userId, email } = Route.useRouteContext();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const popup = usePopup();
  const [tab, setTab] = useState<(typeof tabs)[number]>("Overview");
  const [modal, setModal] = useState<Modal | null>(null);
  const [ticket, setTicket] = useState<string | null>(null);
  const fnSub = useServerFn(subscriptionAction), fnPortal = useServerFn(billingPortal), fnApprove = useServerFn(approveOverage);

  const { data, isLoading, error } = useQuery({
    queryKey: ["client", userId],
    queryFn: async () => {
      const own = async (t: string, order = "created_at") => ((await db.from(t).select("*").eq("user_id", userId).order(order, { ascending: false })).data ?? []) as R[];
      const [profile, subs, projects, tasks, apps, invoices, tickets, messages] = await Promise.all([
        db.from("profiles").select("*").eq("id", userId).maybeSingle().then((r: any) => r.data as R | null),
        own("subscriptions"), own("projects"), own("tasks"), own("applications"), own("invoices", "issued_at"), own("support_tickets", "updated_at"),
        db.from("ticket_messages").select("*").eq("user_id", userId).eq("internal", false).order("created_at").then((r: any) => (r.data ?? []) as R[]),
      ]);
      return { profile, subs, projects, tasks, apps, invoices, tickets, messages };
    },
  });
  const refresh = () => qc.invalidateQueries({ queryKey: ["client"] });
  const fail = (e: unknown) => popup({ type: "error", title: "Something went wrong", description: (e as Error).message, primaryLabel: "Close", secondaryLabel: null });
  const signOut = async () => { qc.clear(); await supabase.auth.signOut(); navigate({ to: "/", replace: true }); };

  if (error) return <p className="p-6 text-sm text-destructive">{(error as Error).message}</p>;
  if (isLoading || !data) return <p className="p-6 text-sm text-muted-foreground">Loading your dashboard…</p>;
  const active = data.subs.filter((s) => ["active", "past_due", "paused", "suspended", "pending"].includes(s.status));
  const unpaid = data.invoices.filter((i) => i.status === "open" || i.status === "overdue");
  const warnings: string[] = [
    ...data.subs.filter((s) => s.payment_warning).map((s) => `${s.plan_name} plan: ${s.payment_warning}`),
    ...data.subs.filter((s) => s.status === "active" && Number(s.hours_used) > Number(s.monthly_hours)).map((s) => `${s.plan_name} plan is ${Number(s.hours_used) - Number(s.monthly_hours)} hours over its monthly allowance. Extra hours are billed separately.`),
    ...unpaid.filter((i) => i.status === "overdue").map((i) => `Invoice ${i.number} is overdue. Interest of 5% per month is added until it's paid.`),
  ];

  const subAct = (s: R, action: "pause" | "resume" | "cancel_end") => setModal({
    title: { pause: "Pause your plan", resume: "Resume your plan", cancel_end: "Cancel your plan" }[action], submitLabel: "Confirm",
    description: action === "pause" && s.guarantee_status === "running" && pauseVoidsGuarantee(s.started_at)
      ? "Pausing within your first 90 days ends your money-back guarantee. Work and billing stop while paused."
      : action === "cancel_end" ? "Your plan stays active until the end of the current billing period." : "Work and billing restart today.",
    fields: [{ name: "reason", label: "Reason", type: "textarea", required: true }],
    onSubmit: async (v) => { try { await fnSub({ data: { subscriptionId: s.id, action, reason: v.reason } }); await refresh(); return null; } catch (e) { return (e as Error).message; } },
  });
  const openPortal = async () => { try { const r = await fnPortal({ data: { returnUrl: window.location.href } }); window.location.href = r.url; } catch (e) { fail(e); } };
  const newTicket = () => setModal({
    title: "New support request", submitLabel: "Send",
    fields: [{ name: "subject", label: "Subject", required: true }, { name: "category", label: "Topic", type: "select", options: ["general", "billing", "project", "technical"] }, { name: "body", label: "Message", type: "textarea", required: true }],
    onSubmit: async (v) => {
      if (v.subject.length > 200 || v.body.length > 5000) return "Please keep it shorter.";
      const t = await db.from("support_tickets").insert({ user_id: userId, subject: v.subject, category: v.category }).select("id").single();
      if (t.error) return t.error.message;
      const m = await db.from("ticket_messages").insert({ ticket_id: t.data.id, user_id: userId, body: v.body, internal: false, actor_id: userId, actor_label: email });
      if (m.error) return m.error.message;
      await refresh(); return null;
    },
  });
  const reply = (t: R) => setModal({
    title: "Reply", submitLabel: "Send", fields: [{ name: "body", label: "Message", type: "textarea", required: true }],
    onSubmit: async (v) => {
      const m = await db.from("ticket_messages").insert({ ticket_id: t.id, user_id: userId, body: v.body.slice(0, 5000), internal: false, actor_id: userId, actor_label: email });
      if (m.error) return m.error.message; await refresh(); return null;
    },
  });
  const p = data.profile;
  const openTicket = data.tickets.find((t) => t.id === ticket);

  return (
    <div className="min-h-dvh bg-secondary/50">
      <header className="sticky top-0 z-30 border-b bg-card">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-4 sm:px-6">
          <img src={logo.url} alt="FP" className="h-8 w-auto" />
          <span className="hidden h-5 w-px bg-border sm:block" />
          <span className="hidden text-sm font-semibold sm:block">Client dashboard</span>
          <span className="ml-auto truncate text-sm text-muted-foreground">{email}</span>
          <button type="button" onClick={signOut} aria-label="Sign out" className="rounded-lg p-2 hover:bg-secondary"><LogOut className="size-4" /></button>
        </div>
        <nav className="mx-auto flex max-w-6xl gap-1 overflow-x-auto px-4 sm:px-6">
          {tabs.map((t) => <button key={t} type="button" onClick={() => { setTab(t); setTicket(null); }} className={`shrink-0 border-b-2 px-3 py-3 text-sm ${tab === t ? "border-primary font-semibold" : "border-transparent text-muted-foreground"}`}>{t}</button>)}
        </nav>
      </header>
      <main className="mx-auto max-w-6xl space-y-6 p-4 sm:p-6">
        {warnings.length > 0 && <div className="space-y-2">{warnings.map((w) => <p key={w} className="flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm"><AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" />{w}</p>)}</div>}

        {tab === "Overview" && <>
          <h1 className="text-2xl font-extrabold sm:text-3xl">Welcome{p?.first_name ? `, ${p.first_name}` : ""}</h1>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[["Active plans", data.subs.filter((s) => s.status === "active").length], ["Hours used this month", active.reduce((a, s) => a + Number(s.hours_used), 0) + " of " + active.reduce((a, s) => a + Number(s.monthly_hours), 0)],
              ["Open tasks", data.tasks.filter((t) => !["completed", "cancelled"].includes(t.status)).length], ["Unpaid invoices", money(unpaid.reduce((a, i) => a + Number(i.amount) + Number(i.interest_accrued) + Number(i.fees_accrued), 0))]].map(([l, v]) => (
              <div key={String(l)} className="rounded-2xl border bg-card p-4"><p className="text-sm text-muted-foreground">{l}</p><p className="mt-1 text-2xl font-bold">{v}</p></div>
            ))}
          </div>
          <Section title="Your plans">
            <ul className="divide-y">{data.subs.map((s) => {
              const pct = Math.min(100, (Number(s.hours_used) / Math.max(1, Number(s.monthly_hours))) * 100);
              return <li key={s.id} className="px-5 py-4 text-sm"><div className="flex flex-wrap items-center justify-between gap-2"><span className="font-semibold">{s.plan_name} plan</span><StatusBadge status={s.status} /></div>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-secondary"><div className={`h-full ${pct >= 100 ? "bg-destructive" : "bg-primary"}`} style={{ width: `${pct}%` }} /></div>
                <p className="mt-1 text-xs text-muted-foreground">{s.hours_used} of {s.monthly_hours} hours used{s.renews_at ? `, renews ${formatDay(s.renews_at)}` : ""}</p></li>;
            })}{data.subs.length === 0 && <li className="px-5 py-6 text-sm text-muted-foreground">No plans yet.</li>}</ul>
          </Section>
        </>}

        {tab === "Projects and tasks" && <>
          <DataTable<R> title="Projects" rows={data.projects} searchable={false} empty="No projects yet." columns={[
            { key: "n", label: "Project", value: (r) => r.name }, { key: "s", label: "Status", value: (r) => r.status, render: (r) => <StatusBadge status={r.status} /> },
            { key: "h", label: "Hours logged", value: (r) => r.hours }, { key: "d", label: "Due", value: (r) => r.due_at ?? "", render: (r) => formatDay(r.due_at) }]} />
          <DataTable<R> title="Tasks" rows={data.tasks} empty="No tasks yet." columns={[
            { key: "t", label: "Task", value: (r) => r.title }, { key: "s", label: "Status", value: (r) => r.status, render: (r) => <StatusBadge status={r.status} /> },
            { key: "d", label: "Due", value: (r) => r.due_at ?? "", render: (r) => formatDay(r.due_at) },
            { key: "o", label: "Extra hours", value: (r) => (r.over_allowance ? (r.overage_approved ? "approved" : "needs approval") : ""), render: (r) => r.over_allowance && !r.overage_approved
              ? <button type="button" className="rounded-full bg-foreground px-3 py-1 text-xs font-semibold text-background" onClick={() => popup({ type: "info", title: "Approve extra hours?", description: "This task needs more hours than your plan has left this month. Extra hours are billed at your plan's hourly rate.", primaryLabel: "Approve", secondaryLabel: "Not now", onPrimary: async () => { try { await fnApprove({ data: { taskId: r.id } }); await refresh(); } catch (e) { fail(e); } } })}>Approve</button>
              : r.overage_approved ? "Approved" : "—" }]} />
        </>}

        {tab === "Subscriptions" && <div className="grid gap-4 md:grid-cols-2">
          {data.subs.map((s) => (
            <Section key={s.id} title={`${s.plan_name} plan`}>
              <FieldGrid items={[["Status", <StatusBadge key="s" status={s.status} />], ["Monthly fee", money(s.monthly_fee)], ["Hours", `${s.hours_used} of ${s.monthly_hours}`], ["Renews", formatDay(s.renews_at)],
                ["Money-back guarantee", s.guarantee_status === "running" ? `Until ${formatDay(s.guarantee_ends_at)}` : s.guarantee_status === "void" ? `Ended: ${s.guarantee_void_reason ?? "conditions not met"}` : String(s.guarantee_status).replaceAll("_", " ")]]} />
              <div className="flex flex-wrap gap-2 border-t p-4">
                {s.status === "active" && <button type="button" onClick={() => subAct(s, "pause")} className="h-10 rounded-full bg-secondary px-5 text-sm font-semibold">Pause</button>}
                {s.status === "paused" && <button type="button" onClick={() => subAct(s, "resume")} className="h-10 rounded-full bg-foreground px-5 text-sm font-semibold text-background">Resume</button>}
                {["active", "paused", "past_due"].includes(s.status) && <button type="button" onClick={() => subAct(s, "cancel_end")} className="h-10 rounded-full bg-secondary px-5 text-sm font-semibold text-destructive">Cancel plan</button>}
              </div>
            </Section>
          ))}
          {data.subs.length === 0 && <p className="text-sm text-muted-foreground">No plans yet.</p>}
        </div>}

        {tab === "Applications" && <DataTable<R> title="Applications" rows={data.apps} searchable={false} empty="No applications." columns={[
          { key: "p", label: "Plan", value: (r) => r.plan_name }, { key: "s", label: "Status", value: (r) => r.status, render: (r) => <StatusBadge status={r.status} label={statusLabel[r.status as AppStatus]} /> },
          { key: "c", label: "Submitted", value: (r) => r.created_at, render: (r) => formatDate(r.created_at) }, { key: "d", label: "Decided", value: (r) => r.decided_at ?? "", render: (r) => formatDate(r.decided_at) }]} />}

        {tab === "Billing" && <>
          <div className="flex flex-wrap gap-2"><button type="button" onClick={openPortal} className="h-10 rounded-full bg-foreground px-5 text-sm font-semibold text-background">Manage card and receipts</button></div>
          <DataTable<R> title="Invoices" rows={data.invoices} empty="No invoices yet." columns={[
            { key: "n", label: "Invoice", value: (r) => r.number }, { key: "a", label: "Amount", value: (r) => r.amount, render: (r) => money(r.amount) },
            { key: "x", label: "Interest and fees", value: (r) => Number(r.interest_accrued) + Number(r.fees_accrued), render: (r) => money(Number(r.interest_accrued) + Number(r.fees_accrued)) },
            { key: "s", label: "Status", value: (r) => r.status, render: (r) => <StatusBadge status={r.status} /> },
            { key: "c", label: "Stage", value: (r) => r.collection_stage, render: (r) => r.collection_stage === "none" ? "—" : stageLabel[r.collection_stage as CollectionStage] },
            { key: "d", label: "Due", value: (r) => r.due_at ?? "", render: (r) => formatDay(r.due_at) },
            { key: "pay", label: "", value: () => "", render: (r) => r.hosted_url ? <a href={r.hosted_url} target="_blank" rel="noopener noreferrer" className="font-semibold underline">{r.status === "paid" ? "View" : "Pay now"}</a> : "—" }]} />
        </>}

        {tab === "Support" && (openTicket ? (
          <Section title={openTicket.subject} actions={<button type="button" className="text-sm underline" onClick={() => setTicket(null)}>All tickets</button>}>
            <ul className="space-y-3 p-5">{data.messages.filter((m: R) => m.ticket_id === openTicket.id).map((m: R) => (
              <li key={m.id} className={`rounded-xl p-3 text-sm ${m.actor_id === userId ? "ml-8 bg-secondary" : "mr-8 border"}`}><p className="whitespace-pre-wrap">{m.body}</p><p className="mt-1 text-xs text-muted-foreground">{m.actor_id === userId ? "You" : "FP team"}, {formatDate(m.created_at)}</p></li>
            ))}</ul>
            <div className="border-t p-4">{openTicket.status === "closed"
              ? <p className="text-sm text-muted-foreground">This ticket is closed and can't be reopened or replied to. Open a new request if you need more help.</p>
              : <button type="button" onClick={() => reply(openTicket)} className="h-10 rounded-full bg-foreground px-5 text-sm font-semibold text-background">Reply</button>}</div>
          </Section>
        ) : (
          <DataTable<R> title="Support tickets" rows={data.tickets} empty="No support requests yet." onRowClick={(r) => setTicket(r.id)} toolbar={<button type="button" onClick={newTicket} className="h-9 rounded-full bg-foreground px-4 text-sm font-semibold text-background">New request</button>} columns={[
            { key: "s", label: "Subject", value: (r) => r.subject }, { key: "st", label: "Status", value: (r) => r.status, render: (r) => <StatusBadge status={r.status} /> },
            { key: "c", label: "Topic", value: (r) => r.category }, { key: "u", label: "Updated", value: (r) => r.updated_at, render: (r) => formatDate(r.updated_at) }]} />
        ))}

        {tab === "Profile" && p && <Section title="Your details">
          <FieldGrid items={[["Account number", formatAccount(p.account_number)], ["Name", `${p.first_name ?? ""} ${p.last_name ?? ""}`], ["Business", p.company ?? "—"], ["Email", p.email ?? "—"], ["Phone", p.phone ?? "—"], ["Country", p.country ?? "—"]]} />
          <p className="border-t p-4 text-sm text-muted-foreground">To change these details, open a support request.</p>
        </Section>}
      </main>
      {modal && <FormModal title={modal.title} description={modal.description} fields={modal.fields} submitLabel={modal.submitLabel} onClose={() => setModal(null)} onSubmit={modal.onSubmit} />}
    </div>
  );
}
