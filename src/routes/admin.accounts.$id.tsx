import { createFileRoute, Link, getRouteApi, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { ArrowLeft, Ban, Download, FileText, MessageSquare, Pencil, Phone, Plus, RotateCcw, ShieldCheck, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { DataTable, StatusBadge } from "@/components/admin/data-table";
import { FormModal, type FieldDef } from "@/components/admin/form-modal";
import { usePopup } from "@/components/popup";
import { setAccountStatus } from "@/lib/crm.functions";
import { formatAccount, formatDate, money, statusLabel, auditSummary, complianceKinds, lifecycleStages } from "@/lib/admin";

export const Route = createFileRoute("/admin/accounts/$id")({ component: AccountDetail });
const adminRoute = getRouteApi("/admin");

const tabs = ["Overview", "Activity", "Applications", "Subscriptions", "Projects", "Invoices", "Transactions", "Support tickets", "Compliance", "Audit log"] as const;
type Modal = { title: string; description?: string; fields: FieldDef[]; submitLabel: string; onSubmit: (v: V) => Promise<string | null> };
type V = { first_name?: string; last_name?: string; company?: string; email?: string; phone?: string; website?: string; address_line?: string; city?: string; state?: string; postal_code?: string; lifecycle_stage?: string; account_manager?: string; action?: string; amount?: string; body?: string; category?: string; description?: string; details?: string; direction?: string; do_not_sell?: string; due_at?: string; duration_minutes?: string; follow_up_at?: string; kind?: string; legal_hold?: string; log_hours?: string; log_note?: string; marketing_opt_in?: string; method?: string; name?: string; outcome?: string; priority?: string; reason?: string; reset?: string; service?: string; sms_opt_in?: string; started_at?: string; status?: string; subject?: string; };
const err = (e: { message: string } | null) => (e ? e.message : null);
const rand = () => Math.floor(Math.random() * 1e6).toString().padStart(6, "0");
const today = () => new Date().toISOString().slice(0, 10);

function AccountDetail() {
  const { id } = Route.useParams();
  const { adminEmail, adminId } = adminRoute.useRouteContext();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const popup = usePopup();
  const changeStatus = useServerFn(setAccountStatus);
  const [tab, setTab] = useState<(typeof tabs)[number]>(tabs[0]);
  const [modal, setModal] = useState<Modal | null>(null);
  const [ticketId, setTicketId] = useState<string | null>(null);
  const { data, isLoading, error } = useQuery({
    queryKey: ["admin", "account", id],
    queryFn: async () => {
      const q = <T,>(p: PromiseLike<{ data: T[] | null; error: unknown }>) => p.then((r) => { if (r.error) throw r.error; return r.data ?? []; });
      const [profile, applications, subscriptions, projects, invoices, transactions, tickets, activities, compliance, audit, messages] = await Promise.all([
        supabase.from("profiles").select("*").eq("id", id).maybeSingle().then((r) => { if (r.error) throw r.error; return r.data; }),
        q(supabase.from("applications").select("*").eq("user_id", id).order("created_at", { ascending: false })),
        q(supabase.from("subscriptions").select("*").eq("user_id", id).order("created_at", { ascending: false })),
        q(supabase.from("projects").select("*").eq("user_id", id).order("created_at", { ascending: false })),
        q(supabase.from("invoices").select("*").eq("user_id", id).order("issued_at", { ascending: false })),
        q(supabase.from("transactions").select("*").eq("user_id", id).order("created_at", { ascending: false })),
        q(supabase.from("support_tickets").select("*").eq("user_id", id).order("created_at", { ascending: false })),
        q(supabase.from("crm_activities").select("*").eq("user_id", id).order("occurred_at", { ascending: false })),
        q(supabase.from("compliance_requests").select("*").eq("user_id", id).order("created_at", { ascending: false })),
        q(supabase.from("audit_log").select("*").eq("account_id", id).order("created_at", { ascending: false }).limit(500)),
        q(supabase.from("ticket_messages").select("*").eq("user_id", id).order("created_at")),
      ]);
      return { profile, applications, subscriptions, projects, invoices, transactions, tickets, activities, compliance, audit, messages };
    },
  });
  const refresh = () => qc.invalidateQueries({ queryKey: ["admin"] });
  const done = async (e: { message: string } | null) => { if (!e) await refresh(); return err(e); };

  if (error) return <p className="text-sm text-destructive">{(error as Error).message}</p>;
  if (isLoading || !data) return <p className="text-sm text-muted-foreground">Loading account…</p>;
  if (!data.profile) return <p className="text-sm text-muted-foreground">This account doesn't exist.</p>;
  const p = data.profile;
  const sub = data.subscriptions.find((s) => s.status === "active") ?? data.subscriptions[0];
  const outstanding = data.invoices.filter((i) => i.status === "open" || i.status === "overdue").reduce((a, i) => a + Number(i.amount), 0);
  const paid = data.transactions.filter((t) => t.status === "completed").reduce((a, t) => a + Number(t.amount), 0);
  const openTickets = data.tickets.filter((t) => t.status !== "closed").length;
  const actor = { actor_id: adminId, actor_label: adminEmail };

  const statusAction = (status: "active" | "suspended" | "closed", label: string) => setModal({
    title: `${label} account`, submitLabel: label,
    description: status === "active" ? "The client can sign in again." : "The client is signed out and can't sign in. Active plans are paused or cancelled.",
    fields: [{ name: "reason", label: "Reason (saved in the audit log)", type: "textarea", required: true }],
    onSubmit: async (v) => {
      if (v.reason!.length < 3) return "Add a short reason.";
      try { await changeStatus({ data: { userId: id, status, reason: v.reason! } }); await refresh(); return null; }
      catch (e) { return (e as Error).message; }
    },
  });
  const editProfile = () => setModal({
    title: "Edit client details", submitLabel: "Save changes",
    fields: [
      { name: "first_name", label: "First name", required: true, defaultValue: p.first_name ?? "" },
      { name: "last_name", label: "Last name", required: true, defaultValue: p.last_name ?? "" },
      { name: "company", label: "Business", defaultValue: p.company ?? "" },
      { name: "email", label: "Contact email", type: "email", defaultValue: p.email ?? "" },
      { name: "phone", label: "Mobile number", defaultValue: p.phone ?? "" },
      { name: "website", label: "Website", type: "url", defaultValue: p.website ?? "" },
      { name: "address_line", label: "Street address", defaultValue: p.address_line ?? "" },
      { name: "city", label: "City", defaultValue: p.city ?? "" },
      { name: "state", label: "State", defaultValue: p.state ?? "" },
      { name: "postal_code", label: "ZIP code", defaultValue: p.postal_code ?? "" },
      { name: "lifecycle_stage", label: "Lifecycle stage", type: "select", options: [...lifecycleStages], defaultValue: p.lifecycle_stage },
      { name: "account_manager", label: "Account manager", defaultValue: p.account_manager ?? adminEmail },
    ],
    onSubmit: async (v) => done((await supabase.from("profiles").update({ first_name: v.first_name ?? null, last_name: v.last_name ?? null, company: v.company || null, email: v.email || null, phone: v.phone || null, website: v.website || null, address_line: v.address_line || null, city: v.city || null, state: v.state || null, postal_code: v.postal_code || null, lifecycle_stage: v.lifecycle_stage ?? p.lifecycle_stage, account_manager: v.account_manager || null, updated_at: new Date().toISOString() }).eq("id", id)).error),
  });
  const editConsent = () => setModal({
    title: "Consent & privacy preferences", submitLabel: "Save preferences",
    description: "Record what the client agreed to. Changes are kept in the audit log.",
    fields: [
      { name: "marketing_opt_in", label: "Marketing emails (CAN-SPAM)", type: "select", options: ["no", "yes"], defaultValue: p.marketing_opt_in ? "yes" : "no" },
      { name: "sms_opt_in", label: "Text messages (TCPA)", type: "select", options: ["no", "yes"], defaultValue: p.sms_opt_in ? "yes" : "no" },
      { name: "do_not_sell", label: "Do not sell or share data (CCPA)", type: "select", options: ["no", "yes"], defaultValue: p.do_not_sell ? "yes" : "no" },
      { name: "legal_hold", label: "Legal hold (block deletion)", type: "select", options: ["no", "yes"], defaultValue: p.legal_hold ? "yes" : "no" },
    ],
    onSubmit: async (v) => done((await supabase.from("profiles").update({ marketing_opt_in: v.marketing_opt_in === "yes", sms_opt_in: v.sms_opt_in === "yes", do_not_sell: v.do_not_sell === "yes", legal_hold: v.legal_hold === "yes" }).eq("id", id)).error),
  });
  const logActivity = () => setModal({
    title: "Log activity", submitLabel: "Save activity",
    fields: [
      { name: "kind", label: "Type", type: "select", options: ["call", "email", "meeting", "note"] },
      { name: "direction", label: "Direction", type: "select", options: ["outbound", "inbound", "internal"] },
      { name: "subject", label: "Subject", required: true },
      { name: "body", label: "Summary", type: "textarea" },
      { name: "outcome", label: "Outcome", type: "select", options: ["completed", "no_answer", "left_voicemail", "follow_up_needed", "resolved"] },
      { name: "duration_minutes", label: "Duration (minutes)", type: "number" },
      { name: "follow_up_at", label: "Follow-up date", type: "date" },
    ],
    onSubmit: async (v) => done((await supabase.from("crm_activities").insert({
      user_id: id, ...actor, kind: v.kind!, direction: v.direction || null, subject: v.subject!, body: v.body || null, outcome: v.outcome || null,
      duration_minutes: v.duration_minutes ? Math.max(0, Math.round(Number(v.duration_minutes))) : null, follow_up_at: v.follow_up_at || null,
    })).error),
  });
  const newProject = () => setModal({
    title: "New project", submitLabel: "Create project",
    fields: [
      { name: "name", label: "Project name", required: true },
      { name: "service", label: "Service", type: "select", options: ["Marketing", "Design", "Development"] },
      { name: "description", label: "Scope", type: "textarea" },
      { name: "started_at", label: "Start date", type: "date", defaultValue: today() },
      { name: "due_at", label: "Due date", type: "date" },
    ],
    onSubmit: async (v) => done((await supabase.from("projects").insert({ user_id: id, name: v.name!, service: v.service!, description: v.description || null, started_at: v.started_at || null, due_at: v.due_at || null })).error),
  });
  const editProject = (pr: (typeof data.projects)[number]) => setModal({
    title: pr.name, submitLabel: "Save project",
    description: `${pr.hours} hours logged so far.`,
    fields: [
      { name: "status", label: "Status", type: "select", options: ["planned", "active", "on_hold", "completed", "cancelled"], defaultValue: pr.status },
      { name: "due_at", label: "Due date", type: "date", defaultValue: pr.due_at ?? "" },
      { name: "log_hours", label: "Log hours worked", type: "number", placeholder: "e.g. 1.5" },
      { name: "log_note", label: "What was done", type: "textarea" },
    ],
    onSubmit: async (v) => {
      const h = Number(v.log_hours || 0);
      if (v.log_hours && (!(h > 0) || h > 24)) return "Hours must be between 0 and 24.";
      if (h > 0 && !v.log_note) return "Describe the work for the hours you log.";
      if (h > 0 && sub && sub.status === "active" && Number(sub.hours_used) + h > sub.monthly_hours) {
        if (!confirm(`This goes over the ${sub.monthly_hours} monthly hours in the plan. Log anyway?`)) return "Cancelled.";
      }
      const up = await supabase.from("projects").update({ status: v.status!, due_at: v.due_at || null, ...(v.status === "completed" && !pr.completed_at ? { completed_at: new Date().toISOString() } : {}) }).eq("id", pr.id);
      if (up.error) return up.error.message;
      if (h > 0) { const t = await supabase.from("time_entries").insert({ project_id: pr.id, user_id: id, hours: h, description: v.log_note!, ...actor }); if (t.error) return t.error.message; }
      await refresh(); return null;
    },
  });
  const newInvoice = () => setModal({
    title: "New invoice", submitLabel: "Issue invoice",
    fields: [
      { name: "description", label: "Description", required: true, defaultValue: sub ? `${sub.plan_name} service fee` : "" },
      { name: "amount", label: "Amount (USD)", type: "number", required: true, defaultValue: sub ? String(sub.monthly_fee) : "" },
      { name: "due_at", label: "Due date", type: "date", defaultValue: new Date(Date.now() + 14 * 864e5).toISOString().slice(0, 10) },
    ],
    onSubmit: async (v) => {
      const amount = Number(v.amount); if (!(amount > 0)) return "Enter an amount above 0.";
      return done((await supabase.from("invoices").insert({ user_id: id, number: `INV-${today().replaceAll("-", "")}-${rand()}`, amount, description: v.description!, due_at: v.due_at || null })).error);
    },
  });
  const payInvoice = (inv: (typeof data.invoices)[number]) => inv.status === "paid" || inv.status === "void" ? undefined : setModal({
    title: `Invoice ${inv.number}`, submitLabel: "Save", description: `${money(inv.amount)} · ${inv.description ?? ""}`,
    fields: [
      { name: "action", label: "Action", type: "select", options: ["record_payment", "mark_overdue", "void"] },
      { name: "method", label: "Payment method", type: "select", options: ["bank_transfer", "card", "ach", "check", "other"] },
    ],
    onSubmit: async (v) => {
      if (v.action === "record_payment") {
        const t = await supabase.from("transactions").insert({ user_id: id, reference: `TX-${rand()}${rand()}`, description: `Payment for ${inv.number}`, amount: inv.amount, method: v.method!, status: "completed" });
        if (t.error) return t.error.message;
        return done((await supabase.from("invoices").update({ status: "paid", paid_at: new Date().toISOString() }).eq("id", inv.id)).error);
      }
      return done((await supabase.from("invoices").update({ status: v.action === "void" ? "void" : "overdue" }).eq("id", inv.id)).error);
    },
  });
  const refund = () => setModal({
    title: "Record refund", submitLabel: "Record refund",
    description: "Use for the 90-day money-back guarantee. Only service fees are refundable.",
    fields: [{ name: "amount", label: "Amount (USD)", type: "number", required: true }, { name: "method", label: "Method", type: "select", options: ["bank_transfer", "card", "ach", "check"] }, { name: "reason", label: "Reason", type: "textarea", required: true }],
    onSubmit: async (v) => {
      const a = Number(v.amount); if (!(a > 0)) return "Enter an amount above 0."; if (a > paid) return "A refund can't be more than what the client has paid.";
      return done((await supabase.from("transactions").insert({ user_id: id, reference: `RF-${rand()}${rand()}`, description: `Refund: ${v.reason}`, amount: -a, method: v.method!, status: "completed" })).error);
    },
  });
  const newTicket = () => setModal({
    title: "New support ticket", submitLabel: "Open ticket",
    fields: [
      { name: "subject", label: "Subject", required: true },
      { name: "category", label: "Category", type: "select", options: ["general", "billing", "project", "technical", "complaint"] },
      { name: "priority", label: "Priority", type: "select", options: ["normal", "low", "high", "urgent"] },
      { name: "body", label: "Details", type: "textarea", required: true },
    ],
    onSubmit: async (v) => {
      const t = await supabase.from("support_tickets").insert({ user_id: id, subject: v.subject!, category: v.category!, priority: v.priority!, assigned_to: adminEmail }).select("id").single();
      if (t.error) return t.error.message;
      return done((await supabase.from("ticket_messages").insert({ ticket_id: t.data.id, user_id: id, body: v.body!, internal: true, ...actor })).error);
    },
  });
  const newCompliance = () => setModal({
    title: "Privacy request", submitLabel: "Log request",
    description: "US privacy laws (such as CCPA) require a response within 45 days.",
    fields: [{ name: "kind", label: "Request type", type: "select", options: [...complianceKinds] }, { name: "details", label: "Details", type: "textarea" }],
    onSubmit: async (v) => done((await supabase.from("compliance_requests").insert({ user_id: id, kind: v.kind!, details: v.details || null, actor_label: adminEmail })).error),
  });
  const closeCompliance = (r: (typeof data.compliance)[number]) => r.status !== "open" ? undefined : setModal({
    title: r.kind.replaceAll("_", " "), submitLabel: "Save", description: `Due ${r.due_at}.`,
    fields: [{ name: "status", label: "Outcome", type: "select", options: ["completed", "denied"] }],
    onSubmit: async (v) => {
      if (r.kind === "deletion" && v.status === "completed" && p.legal_hold) return "This account is on legal hold, so its data can't be deleted.";
      return done((await supabase.from("compliance_requests").update({ status: v.status!, completed_at: new Date().toISOString() }).eq("id", r.id)).error);
    },
  });
  const exportData = () => {
    const { audit: _a, ...rest } = data;
    const url = URL.createObjectURL(new Blob([JSON.stringify({ exported_at: new Date().toISOString(), exported_by: adminEmail, ...rest }, null, 2)], { type: "application/json" }));
    const a = document.createElement("a"); a.href = url; a.download = `account-${p.account_number}.json`; a.click(); URL.revokeObjectURL(url);
    void supabase.from("crm_activities").insert({ user_id: id, ...actor, kind: "note", direction: "internal", subject: "Client data exported" });
    void refresh();
  };

  const info: [string, string][] = [
    ["Account number", formatAccount(p.account_number)], ["Name", `${p.first_name ?? ""} ${p.last_name ?? ""}`], ["Business", p.company ?? "—"],
    ["Contact email", p.email ?? "—"], ["Mobile number", p.phone ?? "—"], ["Website", p.website ?? "—"],
    ["Address", [p.address_line, p.city, p.state, p.postal_code].filter(Boolean).join(", ") || "—"], ["Country", p.country ?? "—"],
    ["Lifecycle stage", p.lifecycle_stage.replaceAll("_", " ")], ["Account manager", p.account_manager ?? "—"],
    ["Agreement signed", formatDate(p.terms_accepted_at ?? data.applications[0]?.signed_at ?? null)], ["Joined", formatDate(p.created_at)],
  ];
  const ticket = data.tickets.find((t) => t.id === ticketId);
  const Btn = ({ onClick, icon: Icon, children, danger }: { onClick: () => void; icon: typeof Plus; children: string; danger?: boolean }) => (
    <button type="button" onClick={onClick} className={`inline-flex h-9 items-center gap-1.5 rounded-lg border bg-card px-3 text-sm font-medium hover:bg-secondary ${danger ? "border-destructive/40 text-destructive" : ""}`}><Icon className="size-4" />{children}</button>
  );

  return (
    <div className="space-y-6">
      <Link to="/admin/accounts" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" />Accounts</Link>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2"><h1 className="truncate text-2xl font-extrabold sm:text-3xl">{p.first_name} {p.last_name}</h1><StatusBadge status={p.status === "active" ? "active" : "suspended"} label={p.status} /></div>
          <p className="mt-1 font-mono text-sm text-muted-foreground">{formatAccount(p.account_number)} · {p.company}</p>
          {p.status !== "active" && p.status_reason && <p className="mt-2 rounded-lg bg-secondary px-3 py-2 text-sm">Reason: {p.status_reason}</p>}
        </div>
        <div className="flex flex-wrap gap-2">
          <Btn icon={Phone} onClick={logActivity}>Log call</Btn>
          <Btn icon={MessageSquare} onClick={newTicket}>New ticket</Btn>
          <Btn icon={Pencil} onClick={editProfile}>Edit</Btn>
          {p.status === "active" ? <Btn icon={Ban} danger onClick={() => statusAction("suspended", "Suspend")}>Suspend</Btn> : <Btn icon={RotateCcw} onClick={() => statusAction("active", "Reactivate")}>Reactivate</Btn>}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[["Plan", sub ? `${sub.plan_name} · ${sub.status}` : "—"], ["Hours this month", sub ? `${sub.hours_used} of ${sub.monthly_hours} h` : "—"], ["Outstanding", money(outstanding)], ["Open tickets", String(openTickets)]].map(([k, v]) => (
          <div key={k} className="rounded-2xl border bg-card p-4"><p className="text-xs text-muted-foreground">{k}</p><p className="mt-1 truncate font-semibold">{v}</p></div>
        ))}
      </div>

      <div className="overflow-x-auto border-b">
        <div className="flex min-w-max gap-1">
          {tabs.map((t) => <button key={t} type="button" onClick={() => setTab(t)} className={`border-b-2 px-3 py-2.5 text-sm ${tab === t ? "border-primary font-semibold" : "border-transparent text-muted-foreground hover:text-foreground"}`}>{t}</button>)}
        </div>
      </div>

      {tab === "Overview" && <div className="space-y-4">
        <div className="grid gap-px overflow-hidden rounded-2xl border bg-border sm:grid-cols-2 lg:grid-cols-3">
          {info.map(([k, v]) => <div key={k} className="bg-card p-4"><p className="text-xs text-muted-foreground">{k}</p><p className="mt-1 break-words text-sm font-medium">{v}</p></div>)}
        </div>
        <div className="flex flex-wrap gap-2">
          {p.status !== "closed" && <Btn icon={X} danger onClick={() => statusAction("closed", "Close")}>Close account</Btn>}
        </div>
      </div>}

      {tab === "Activity" && <DataTable title="Activity" rows={data.activities} empty="No calls or notes logged yet." toolbar={<Btn icon={Plus} onClick={logActivity}>Log activity</Btn>} columns={[
        { key: "date", label: "When", value: (r) => r.occurred_at, render: (r) => formatDate(r.occurred_at) },
        { key: "kind", label: "Type", value: (r) => `${r.kind} ${r.direction ?? ""}` },
        { key: "subject", label: "Subject", value: (r) => r.subject, render: (r) => <div className="max-w-xs"><p className="font-medium">{r.subject}</p>{r.body && <p className="line-clamp-2 text-xs text-muted-foreground">{r.body}</p>}</div> },
        { key: "outcome", label: "Outcome", value: (r) => (r.outcome ?? "—").replaceAll("_", " ") },
        { key: "dur", label: "Minutes", value: (r) => r.duration_minutes ?? "—" },
        { key: "fu", label: "Follow-up", value: (r) => r.follow_up_at ?? "—" },
        { key: "by", label: "By", value: (r) => r.actor_label },
      ]} />}

      {tab === "Applications" && <DataTable title="Applications" rows={data.applications} searchable={false} onRowClick={(r) => navigate({ to: "/admin/applications/$id", params: { id: r.id } })} columns={[
        { key: "plan", label: "Plan", value: (r) => r.plan_name },
        { key: "fee", label: "Fee", value: (r) => r.monthly_fee, render: (r) => `${money(r.monthly_fee)} / month` },
        { key: "hours", label: "Hours", value: (r) => r.monthly_hours, render: (r) => `${r.monthly_hours} h / month` },
        { key: "status", label: "Status", value: (r) => r.status, render: (r) => <StatusBadge status={r.status} label={statusLabel[r.status]} /> },
        { key: "date", label: "Submitted", value: (r) => r.created_at, render: (r) => formatDate(r.created_at) },
      ]} />}

      {tab === "Subscriptions" && <DataTable title="Subscriptions" rows={data.subscriptions} searchable={false} empty="No subscriptions." onRowClick={(s) => setModal({
        title: `${s.plan_name} subscription`, submitLabel: "Save",
        fields: [{ name: "status", label: "Status", type: "select", options: ["active", "paused", "cancelled", "pending"], defaultValue: s.status }, { name: "reset", label: "Reset monthly hours", type: "select", options: ["no", "yes"] }],
        onSubmit: async (v) => done((await supabase.from("subscriptions").update({ status: v.status!, ...(v.reset === "yes" ? { hours_used: 0 } : {}) }).eq("id", s.id)).error),
      })} columns={[
        { key: "plan", label: "Plan", value: (r) => r.plan_name },
        { key: "fee", label: "Fee", value: (r) => r.monthly_fee, render: (r) => `${money(r.monthly_fee)} / month` },
        { key: "hours", label: "Hours used", value: (r) => r.hours_used, render: (r) => `${r.hours_used} of ${r.monthly_hours} h` },
        { key: "status", label: "Status", value: (r) => r.status, render: (r) => <StatusBadge status={r.status} /> },
        { key: "start", label: "Started", value: (r) => r.started_at ?? "", render: (r) => formatDate(r.started_at) },
        { key: "renew", label: "Renews", value: (r) => r.renews_at ?? "", render: (r) => formatDate(r.renews_at) },
      ]} />}

      {tab === "Projects" && <DataTable title="Projects" rows={data.projects} empty="No projects yet." onRowClick={editProject} toolbar={<Btn icon={Plus} onClick={newProject}>New project</Btn>} columns={[
        { key: "name", label: "Project", value: (r) => r.name }, { key: "service", label: "Service", value: (r) => r.service },
        { key: "hours", label: "Hours", value: (r) => r.hours }, { key: "status", label: "Status", value: (r) => r.status, render: (r) => <StatusBadge status={r.status} label={r.status.replaceAll("_", " ")} /> },
        { key: "due", label: "Due", value: (r) => r.due_at ?? "—" },
      ]} />}

      {tab === "Invoices" && <DataTable title="Invoices" rows={data.invoices} empty="No invoices yet." onRowClick={payInvoice} toolbar={<Btn icon={Plus} onClick={newInvoice}>New invoice</Btn>} columns={[
        { key: "no", label: "Invoice", value: (r) => r.number }, { key: "desc", label: "Description", value: (r) => r.description ?? "—" },
        { key: "amount", label: "Amount", value: (r) => r.amount, render: (r) => money(r.amount) },
        { key: "status", label: "Status", value: (r) => r.status, render: (r) => <StatusBadge status={r.status} /> },
        { key: "issued", label: "Issued", value: (r) => r.issued_at }, { key: "due", label: "Due", value: (r) => r.due_at ?? "—" },
      ]} />}

      {tab === "Transactions" && <DataTable title="Transactions" rows={data.transactions} empty="No transactions yet." toolbar={<Btn icon={RotateCcw} onClick={refund}>Record refund</Btn>} columns={[
        { key: "ref", label: "Reference", value: (r) => r.reference }, { key: "desc", label: "Description", value: (r) => r.description },
        { key: "amount", label: "Amount", value: (r) => r.amount, render: (r) => money(r.amount) }, { key: "method", label: "Method", value: (r) => (r.method ?? "—").replaceAll("_", " ") },
        { key: "status", label: "Status", value: (r) => r.status, render: (r) => <StatusBadge status={r.status} /> },
        { key: "date", label: "Date", value: (r) => r.created_at, render: (r) => formatDate(r.created_at) },
      ]} />}

      {tab === "Support tickets" && <DataTable title="Support tickets" rows={data.tickets} empty="No support tickets." onRowClick={(r) => setTicketId(r.id)} toolbar={<Btn icon={Plus} onClick={newTicket}>New ticket</Btn>} columns={[
        { key: "subject", label: "Subject", value: (r) => r.subject }, { key: "cat", label: "Category", value: (r) => r.category }, { key: "priority", label: "Priority", value: (r) => r.priority },
        { key: "status", label: "Status", value: (r) => r.status, render: (r) => <StatusBadge status={r.status} /> },
        { key: "assigned", label: "Assigned", value: (r) => r.assigned_to ?? "—" },
        { key: "date", label: "Opened", value: (r) => r.created_at, render: (r) => formatDate(r.created_at) },
      ]} />}

      {tab === "Compliance" && <div className="space-y-4">
        <section className="rounded-2xl border bg-card p-5">
          <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="flex items-center gap-2 font-semibold"><ShieldCheck className="size-4" />Consent & privacy</h2><div className="flex gap-2"><Btn icon={Pencil} onClick={editConsent}>Update</Btn><Btn icon={Download} onClick={exportData}>Export client data</Btn></div></div>
          <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
            {[["Marketing emails", p.marketing_opt_in], ["Text messages", p.sms_opt_in], ["Do not sell / share", p.do_not_sell], ["Legal hold", p.legal_hold]].map(([k, v]) => <div key={String(k)} className="rounded-lg bg-secondary/60 p-3"><dt className="text-xs text-muted-foreground">{k}</dt><dd className="mt-0.5 font-medium">{v ? "Yes" : "No"}</dd></div>)}
          </dl>
          <p className="mt-3 text-xs text-muted-foreground">Signed agreement: {formatDate(p.terms_accepted_at ?? data.applications[0]?.signed_at ?? null)}. Financial records can't be deleted and are kept for tax purposes.</p>
        </section>
        <DataTable title="Privacy requests" rows={data.compliance} searchable={false} empty="No privacy requests." onRowClick={closeCompliance} toolbar={<Btn icon={Plus} onClick={newCompliance}>Log request</Btn>} columns={[
          { key: "kind", label: "Request", value: (r) => r.kind.replaceAll("_", " ") }, { key: "details", label: "Details", value: (r) => r.details ?? "—" },
          { key: "status", label: "Status", value: (r) => r.status, render: (r) => <StatusBadge status={r.status === "completed" ? "completed" : r.status === "denied" ? "rejected" : r.due_at < today() ? "overdue" : "open"} label={r.status === "open" && r.due_at < today() ? "overdue" : r.status} /> },
          { key: "due", label: "Due", value: (r) => r.due_at }, { key: "by", label: "Logged by", value: (r) => r.actor_label },
        ]} />
      </div>}

      {tab === "Audit log" && <DataTable title="Audit log" rows={data.audit} empty="No changes recorded yet." columns={[
        { key: "date", label: "When", value: (r) => r.created_at, render: (r) => formatDate(r.created_at) },
        { key: "who", label: "By", value: (r) => r.actor_label },
        { key: "what", label: "Record", value: (r) => `${r.table_name.replaceAll("_", " ")} ${r.action}` },
        { key: "changes", label: "Change", value: (r) => auditSummary(r.action, r.changes), render: (r) => <span className="line-clamp-2 max-w-md text-xs">{auditSummary(r.action, r.changes)}</span> },
      ]} />}

      {ticket && <TicketPanel ticket={ticket} messages={data.messages.filter((m) => m.ticket_id === ticket.id)} onClose={() => setTicketId(null)} onSaved={refresh} actor={actor} popup={popup} />}
      {modal && <FormModal {...modal} onClose={() => setModal(null)} />}
    </div>
  );
}

type Ticket = { id: string; user_id: string; subject: string; status: string; priority: string; category: string };
type Msg = { id: string; body: string; internal: boolean; actor_label: string; created_at: string };
function TicketPanel({ ticket, messages, onClose, onSaved, actor, popup }: { ticket: Ticket; messages: Msg[]; onClose: () => void; onSaved: () => Promise<void>; actor: { actor_id: string; actor_label: string }; popup: ReturnType<typeof usePopup> }) {
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const save = async (status?: string) => {
    setBusy(true);
    if (body.trim()) {
      const r = await supabase.from("ticket_messages").insert({ ticket_id: ticket.id, user_id: ticket.user_id, body: body.trim(), internal: true, ...actor });
      if (r.error) { setBusy(false); popup({ type: "error", title: "Couldn't save the reply", description: r.error.message }); return; }
    }
    if (status) await supabase.from("support_tickets").update({ status, updated_at: new Date().toISOString(), closed_at: status === "closed" ? new Date().toISOString() : null }).eq("id", ticket.id);
    setBody(""); setBusy(false); await onSaved();
  };
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-foreground/40 p-4" role="dialog" aria-modal="true" aria-label={ticket.subject}>
      <div className="app-modal text-left">
        <div className="flex items-start justify-between gap-2"><div className="min-w-0"><h2 className="truncate text-lg font-bold">{ticket.subject}</h2><p className="text-xs text-muted-foreground">{ticket.category} · {ticket.priority} priority · {ticket.status}</p></div><button type="button" aria-label="Close" onClick={onClose} className="rounded-lg p-1.5 hover:bg-secondary"><X className="size-4" /></button></div>
        <ol className="mt-4 max-h-64 space-y-2 overflow-y-auto">
          {messages.map((m) => <li key={m.id} className="rounded-lg bg-secondary/60 p-2.5"><p className="whitespace-pre-wrap text-sm">{m.body}</p><p className="mt-1 text-[11px] text-muted-foreground">{m.actor_label} · {formatDate(m.created_at)}</p></li>)}
          {messages.length === 0 && <li className="text-sm text-muted-foreground">No messages yet.</li>}
        </ol>
        <textarea value={body} onChange={(e) => setBody(e.target.value)} maxLength={4000} rows={3} placeholder="Add an update or internal note" className="mt-3 w-full rounded-lg border bg-background p-2.5 text-sm outline-none focus:ring-2 focus:ring-ring" />
        <div className="mt-3 grid gap-2">
          <button type="button" disabled={busy || !body.trim()} onClick={() => save(ticket.status === "open" ? "in_progress" : undefined)} className="signup-primary"><FileText className="mr-1.5 inline size-4" />Add update</button>
          <button type="button" disabled={busy} onClick={() => save(ticket.status === "closed" ? "open" : "closed")} className="app-modal-secondary">{ticket.status === "closed" ? "Reopen ticket" : "Close ticket"}</button>
        </div>
      </div>
    </div>
  );
}
