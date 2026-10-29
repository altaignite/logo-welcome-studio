import { createFileRoute, Link, getRouteApi, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { ArrowLeft, Download, FilePlus2, ListChecks, MessageSquare, Pencil, Phone, Plus, ShieldCheck, UserCog, UserPlus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { DataTable, StatusBadge, type BulkAction, type Column } from "@/components/admin/data-table";
import { FormModal, type FieldDef } from "@/components/admin/form-modal";
import { usePopup } from "@/components/popup";
import { AuditList, Btn, FieldGrid, Section, db, fmtText } from "@/components/admin/record-bits";
import { setAccountStatus } from "@/lib/crm.functions";
import { accountStatusLabel, accountStatuses, complianceKinds, formatAccount, formatDate, formatDay, humanize, lifecycleStages, money, statusLabel, type AccountStatus } from "@/lib/admin";
import { plans } from "@/lib/signup";
import { recordKinds, toPatch, type RecordKind, type Row, type Vals } from "@/lib/records";

export const Route = createFileRoute("/admin/accounts/$id")({ component: AccountDetail });
const adminRoute = getRouteApi("/admin");

const tabs = ["Overview", "Contacts", "Applications", "Subscriptions", "Projects", "Invoices", "Transactions", "Support tickets", "Activities", "Tasks", "Privacy", "Audit log"] as const;
type Modal = { title: string; description?: string; fields: FieldDef[]; submitLabel: string; onSubmit: (v: Vals) => Promise<string | null> };
const rand = () => Math.floor(Math.random() * 1e6).toString().padStart(6, "0");
const today = () => new Date().toISOString().slice(0, 10);
type R = Row;

function AccountDetail() {
  const { id } = Route.useParams();
  const { adminEmail, adminId } = adminRoute.useRouteContext();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const popup = usePopup();
  const changeStatus = useServerFn(setAccountStatus);
  const [tab, setTab] = useState<(typeof tabs)[number]>(tabs[0]);
  const [modal, setModal] = useState<Modal | null>(null);
  const { data, isLoading, error } = useQuery({
    queryKey: ["admin", "account", id],
    queryFn: async () => {
      const list = async (t: string, order = "created_at") => { const r = await db.from(t).select("*").eq("user_id", id).order(order, { ascending: false }); if (r.error) throw r.error; return (r.data ?? []) as R[]; };
      const [profile, applications, subscriptions, projects, invoices, transactions, tickets, activities, tasks, contacts, compliance, audit] = await Promise.all([
        supabase.from("profiles").select("*").eq("id", id).maybeSingle().then((r) => { if (r.error) throw r.error; return r.data; }),
        list("applications"), list("subscriptions"), list("projects"), list("invoices", "issued_at"), list("transactions"), list("support_tickets"),
        list("crm_activities", "occurred_at"), list("tasks"), list("contacts"), list("compliance_requests"),
        supabase.from("audit_log").select("*").eq("account_id", id).order("created_at", { ascending: false }).limit(500).then((r) => r.data ?? []),
      ]);
      return { profile, applications, subscriptions, projects, invoices, transactions, tickets, activities, tasks, contacts, compliance, audit };
    },
  });
  const refresh = () => qc.invalidateQueries({ queryKey: ["admin"] });
  const done = async (e: { message: string } | null) => { if (e) return e.message; await refresh(); return null; };

  if (error) return <p className="text-sm text-destructive">{(error as Error).message}</p>;
  if (isLoading || !data) return <p className="text-sm text-muted-foreground">Loading account…</p>;
  if (!data.profile) return <p className="text-sm text-muted-foreground">This account doesn't exist.</p>;
  const p = data.profile;
  const actor = { actor_id: adminId, actor_label: adminEmail };
  const live = data.subscriptions.filter((s) => s.status === "active" && !s.archived_at);
  const mrr = live.reduce((a, s) => a + Number(s.monthly_fee), 0);
  const hoursUsed = live.reduce((a, s) => a + Number(s.hours_used), 0);
  const hoursTotal = live.reduce((a, s) => a + Number(s.monthly_hours), 0);
  const outstanding = data.invoices.filter((i) => i.status === "open" || i.status === "overdue").reduce((a, i) => a + Number(i.amount), 0);
  const openTickets = data.tickets.filter((t) => t.status !== "closed").length;
  const openTasks = data.tasks.filter((t) => t.status === "open" || t.status === "in_progress").length;
  const open = (kind: RecordKind) => (r: R) => navigate({ to: "/admin/records/$kind/$id", params: { kind, id: r.id } });

  // ---------- bulk helpers ----------
  const bulkUpdate = (table: string, patch: Record<string, unknown>, label: string): BulkAction<R> => ({
    label, run: (rows) => popup({ type: "info", title: `${label} for ${rows.length} record${rows.length > 1 ? "s" : ""}?`, primaryLabel: label, secondaryLabel: "Cancel",
      onPrimary: async () => { const r = await db.from(table).update(patch).in("id", rows.map((x) => x.id)); if (r.error) popup({ type: "error", title: "Couldn't update", description: r.error.message, primaryLabel: "Close", secondaryLabel: null }); await refresh(); } }),
  });
  const bulkDelete = (table: string): BulkAction<R> => ({
    label: "Delete", danger: true, run: (rows) => popup({ type: "error", title: `Delete ${rows.length} record${rows.length > 1 ? "s" : ""}?`, description: "This can't be undone. Deletions are kept in the audit log.", primaryLabel: "Delete", secondaryLabel: "Cancel",
      onPrimary: async () => { const r = await db.from(table).delete().in("id", rows.map((x) => x.id)); if (r.error) popup({ type: "error", title: "Couldn't delete", description: r.error.message, primaryLabel: "Close", secondaryLabel: null }); await refresh(); } }),
  });
  const bulkVoid = (table: string): BulkAction<R> => ({
    label: "Void", danger: true, run: (rows) => setModal({ title: `Void ${rows.length} record${rows.length > 1 ? "s" : ""}`, submitLabel: "Void", description: "Voided records stay on file for tax and legal purposes.",
      fields: [{ name: "reason", label: "Reason", type: "textarea", required: true }],
      onSubmit: async (v) => done((await db.from(table).update({ status: "void", void_reason: v.reason }).in("id", rows.filter((x) => x.status !== "paid").map((x) => x.id))).error) }),
  });
  const archive = (table: string) => bulkUpdate(table, { archived_at: new Date().toISOString() }, "Archive");

  // ---------- actions ----------
  const statusModal = () => setModal({
    title: "Change account status", submitLabel: "Save status",
    description: "Suspended and closed accounts can't sign in. On hold and suspended pause plans; cancelled and closed cancel them.",
    fields: [{ name: "status", label: "Status", type: "select", options: [...accountStatuses], defaultValue: p.status }, { name: "reason", label: "Reason (saved in the audit log)", type: "textarea", required: true }],
    onSubmit: async (v) => {
      if (v.reason.length < 3) return "Add a short reason.";
      try { await changeStatus({ data: { userIds: [id], status: v.status as AccountStatus, reason: v.reason } }); await refresh(); return null; }
      catch (e) { return (e as Error).message; }
    },
  });
  const profileFields: FieldDef[] = [
    { name: "first_name", label: "First name", required: true }, { name: "last_name", label: "Last name", required: true },
    { name: "company", label: "Business name" }, { name: "legal_name", label: "Legal entity name" }, { name: "tax_id", label: "Tax ID (EIN or VAT)" },
    { name: "industry", label: "Industry" }, { name: "company_size", label: "Company size", type: "select", options: ["", "1-10", "11-50", "51-200", "201-1000", "1000+"] },
    { name: "email", label: "Contact email", type: "email" }, { name: "phone", label: "Mobile number" }, { name: "website", label: "Website", type: "url" },
    { name: "address_line", label: "Street address" }, { name: "city", label: "City" }, { name: "state", label: "State or region" }, { name: "postal_code", label: "Postal code" },
    { name: "country", label: "Country" }, { name: "timezone", label: "Time zone" },
    { name: "lifecycle_stage", label: "Lifecycle stage", type: "select", options: [...lifecycleStages] }, { name: "account_manager", label: "Account manager" },
    { name: "lead_source", label: "Lead source" }, { name: "internal_notes", label: "Internal notes", type: "textarea" },
  ];
  const editProfile = () => setModal({
    title: "Edit client profile", submitLabel: "Save changes",
    fields: profileFields.map((f) => ({ ...f, defaultValue: String((p as Record<string, unknown>)[f.name] ?? (f.name === "account_manager" ? adminEmail : "")) })),
    onSubmit: async (v) => done((await db.from("profiles").update({ ...toPatch(profileFields, v), lifecycle_stage: v.lifecycle_stage || p.lifecycle_stage, updated_at: new Date().toISOString() }).eq("id", id)).error),
  });
  const editConsent = () => setModal({
    title: "Consent and privacy", submitLabel: "Save preferences", description: "Record what the client agreed to. Changes are kept in the audit log.",
    fields: [
      { name: "marketing_opt_in", label: "Marketing emails", type: "select", options: ["no", "yes"], defaultValue: p.marketing_opt_in ? "yes" : "no" },
      { name: "sms_opt_in", label: "Text messages", type: "select", options: ["no", "yes"], defaultValue: p.sms_opt_in ? "yes" : "no" },
      { name: "do_not_sell", label: "Do not sell or share data", type: "select", options: ["no", "yes"], defaultValue: p.do_not_sell ? "yes" : "no" },
      { name: "legal_hold", label: "Legal hold (block deletion)", type: "select", options: ["no", "yes"], defaultValue: p.legal_hold ? "yes" : "no" },
    ],
    onSubmit: async (v) => done((await supabase.from("profiles").update({ marketing_opt_in: v.marketing_opt_in === "yes", sms_opt_in: v.sms_opt_in === "yes", do_not_sell: v.do_not_sell === "yes", legal_hold: v.legal_hold === "yes" }).eq("id", id)).error),
  });
  const create = (kind: RecordKind, extra: Record<string, unknown> = {}) => {
    const fields = recordKinds[kind].edit.map((f) => f.name === "assigned_to" ? { ...f, defaultValue: adminEmail } : f);
    setModal({
      title: `New ${recordKinds[kind].singular.toLowerCase()}`, submitLabel: "Create", fields,
      onSubmit: async (v) => {
        const r = await db.from(kind).insert({ user_id: id, ...toPatch(fields, v), ...extra }).select("id").single();
        if (r.error) return r.error.message;
        await refresh(); navigate({ to: "/admin/records/$kind/$id", params: { kind, id: r.data.id } }); return null;
      },
    });
  };
  const logActivity = () => create("crm_activities", actor);
  const newTicket = () => create("support_tickets");
  const newTask = () => create("tasks", { actor_label: adminEmail });
  const newContact = () => create("contacts");
  const newPrivacy = () => setModal({
    title: "Privacy request", submitLabel: "Log request", description: "Many privacy laws require a response within 45 days.",
    fields: [{ name: "kind", label: "Request type", type: "select", options: [...complianceKinds] }, { name: "details", label: "Details", type: "textarea" }],
    onSubmit: async (v) => done((await supabase.from("compliance_requests").insert({ user_id: id, kind: v.kind, details: v.details || null, actor_label: adminEmail })).error),
  });
  const newOrder = () => setModal({
    title: "New subscription order", submitLabel: "Create order", description: "Creates an application, a pending subscription and a project for this client.",
    fields: [{ name: "plan", label: "Plan", type: "select", options: plans.map((x) => x.name) }, { name: "project", label: "Project name", required: true, defaultValue: p.company ?? `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim() }],
    onSubmit: async (v) => {
      const plan = plans.find((x) => x.name === v.plan)!;
      const a = await supabase.from("applications").insert({ user_id: id, account_number: p.account_number, plan_id: plan.id, plan_name: plan.name, monthly_fee: plan.monthlyFee, monthly_hours: plan.monthlyHours, status: "in_review", assigned_to: adminEmail }).select("id").single();
      if (a.error) return a.error.message;
      await supabase.from("application_events").insert({ application_id: a.data.id, ...actor, action: "Order created by staff", to_status: "in_review" });
      const s = await supabase.from("subscriptions").insert({ user_id: id, plan_name: plan.name, monthly_fee: plan.monthlyFee, monthly_hours: plan.monthlyHours, status: "pending", application_id: a.data.id }).select("id").single();
      if (s.error) return s.error.message;
      return done((await supabase.from("projects").insert({ user_id: id, name: v.project, service: "Marketing", status: "planned", subscription_id: s.data.id, description: `${plan.name} plan` })).error);
    },
  });
  const exportData = () => {
    const { audit: _a, ...rest } = data;
    const url = URL.createObjectURL(new Blob([JSON.stringify({ exported_at: new Date().toISOString(), exported_by: adminEmail, ...rest }, null, 2)], { type: "application/json" }));
    const a = document.createElement("a"); a.href = url; a.download = `account-${p.account_number}.json`; a.click(); URL.revokeObjectURL(url);
    void supabase.from("crm_activities").insert({ user_id: id, ...actor, kind: "note", direction: "internal", subject: "Client data exported" }).then(refresh);
  };

  // ---------- columns ----------
  const col = (key: string, label: string, f: Parameters<typeof fmtText>[1] = "text"): Column<R> => ({
    key, label, value: (r) => fmtText(r[key], f), ...(f === "status" ? { render: (r: R) => r[key] ? <StatusBadge status={String(r[key])} /> : "—" } : {}),
  });
  const cards: [string, string, string?][] = [
    ["Active subscriptions", String(live.length), `${data.subscriptions.length} in total`],
    ["Monthly fees", money(mrr), "active plans"],
    ["Hours this period", `${hoursUsed} of ${hoursTotal} h`, hoursTotal && hoursUsed > hoursTotal ? "over allowance" : undefined],
    ["Outstanding", money(outstanding)],
    ["Open tickets", String(openTickets)],
    ["Open tasks", String(openTasks)],
  ];
  const stat = (s: string) => accountStatusLabel[s as AccountStatus] ?? humanize(s);
  const address = [p.address_line, p.city, p.state, p.postal_code].filter(Boolean).join(", ");
  const groups: [string, [string, string][]][] = [
    ["Company", [["Business name", p.company ?? "—"], ["Legal entity", p.legal_name ?? "—"], ["Tax ID", p.tax_id ?? "—"], ["Industry", p.industry ?? "—"], ["Company size", p.company_size ?? "—"], ["Website", p.website ?? "—"]]],
    ["Contact", [["Name", `${p.first_name ?? ""} ${p.last_name ?? ""}`], ["Email", p.email ?? "—"], ["Mobile number", p.phone ?? "—"], ["Address", address || "—"], ["Country", p.country ?? "—"], ["Time zone", p.timezone ?? "—"]]],
    ["Account", [["Account number", formatAccount(p.account_number)], ["Status", stat(p.status)], ["Status reason", p.status_reason ?? "—"], ["Status changed", formatDate(p.status_changed_at)], ["Lifecycle stage", humanize(p.lifecycle_stage)], ["Account manager", p.account_manager ?? "—"], ["Lead source", p.lead_source ?? "—"], ["Agreement signed", formatDate(p.terms_accepted_at)], ["Joined", formatDate(p.created_at)]]],
  ];

  return (
    <div className="space-y-6">
      <Link to="/admin/accounts" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" />Accounts</Link>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2"><h1 className="truncate text-2xl font-extrabold sm:text-3xl">{p.first_name} {p.last_name}</h1><StatusBadge status={p.status} label={stat(p.status)} /></div>
          <div className="mt-1 flex flex-wrap gap-x-4 text-sm text-muted-foreground"><span className="font-mono">{formatAccount(p.account_number)}</span>{p.company && <span>{p.company}</span>}</div>
          {p.status_reason && p.status !== "active" && <p className="mt-2 rounded-lg bg-secondary px-3 py-2 text-sm">Reason: {p.status_reason}</p>}
        </div>
        <div className="flex flex-wrap gap-2">
          <Btn icon={Phone} onClick={logActivity}>Log call</Btn>
          <Btn icon={MessageSquare} onClick={newTicket}>New ticket</Btn>
          <Btn icon={FilePlus2} onClick={newOrder}>New order</Btn>
          <Btn icon={Pencil} onClick={editProfile}>Edit</Btn>
          <Btn icon={UserCog} onClick={statusModal}>Change status</Btn>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {cards.map(([k, v, sub]) => <div key={k} className="rounded-2xl border bg-card p-4"><p className="text-xs text-muted-foreground">{k}</p><p className="mt-1 truncate text-lg font-bold">{v}</p>{sub && <p className="truncate text-xs text-muted-foreground">{sub}</p>}</div>)}
      </div>

      <div className="overflow-x-auto border-b">
        <div className="flex min-w-max gap-1">
          {tabs.map((t) => <button key={t} type="button" onClick={() => setTab(t)} className={`border-b-2 px-3 py-2.5 text-sm ${tab === t ? "border-primary font-semibold" : "border-transparent text-muted-foreground hover:text-foreground"}`}>{t}</button>)}
        </div>
      </div>

      {tab === "Overview" && <div className="space-y-4">
        {groups.map(([title, items]) => <Section key={title} title={title} actions={title === "Company" ? <Btn icon={Pencil} onClick={editProfile}>Edit</Btn> : undefined}><FieldGrid items={items} /></Section>)}
        <Section title="Consent and privacy" actions={<><Btn icon={ShieldCheck} onClick={editConsent}>Update</Btn><Btn icon={Download} onClick={exportData}>Export client data</Btn></>}>
          <FieldGrid items={[["Marketing emails", p.marketing_opt_in ? "Yes" : "No"], ["Text messages", p.sms_opt_in ? "Yes" : "No"], ["Do not sell or share", p.do_not_sell ? "Yes" : "No"], ["Legal hold", p.legal_hold ? "Yes" : "No"]]} />
        </Section>
        {p.internal_notes && <Section title="Internal notes"><p className="whitespace-pre-wrap px-5 py-4 text-sm">{p.internal_notes}</p></Section>}
      </div>}

      {tab === "Contacts" && <DataTable<R> title="Contacts" rows={data.contacts} getId={(r) => r.id} onRowClick={open("contacts")} empty="No extra contacts yet." toolbar={<Btn icon={UserPlus} onClick={newContact}>Add contact</Btn>}
        bulkActions={[bulkDelete("contacts")]} columns={[col("name", "Name"), col("role", "Role"), col("email", "Email"), col("phone", "Phone")]} />}

      {tab === "Applications" && <DataTable<R> title="Applications" rows={data.applications} getId={(r) => r.id} onRowClick={(r) => navigate({ to: "/admin/applications/$id", params: { id: r.id } })}
        toolbar={<Btn icon={FilePlus2} onClick={newOrder}>New order</Btn>} bulkActions={[bulkUpdate("applications", { assigned_to: adminEmail }, "Assign to me"), archive("applications")]} columns={[
          col("plan_name", "Plan"), col("monthly_fee", "Fee", "money"), col("monthly_hours", "Hours", "hours"),
          { key: "status", label: "Status", value: (r) => String(r.status), render: (r) => <StatusBadge status={String(r.status)} label={statusLabel[r.status as keyof typeof statusLabel]} /> },
          col("assigned_to", "Assigned to"), col("created_at", "Submitted", "date"),
        ]} />}

      {tab === "Subscriptions" && <DataTable<R> title="Subscriptions" rows={data.subscriptions} getId={(r) => r.id} onRowClick={open("subscriptions")} empty="No subscriptions." toolbar={<Btn icon={FilePlus2} onClick={newOrder}>New order</Btn>}
        bulkActions={[bulkUpdate("subscriptions", { status: "paused" }, "Pause"), bulkUpdate("subscriptions", { status: "active" }, "Resume"), archive("subscriptions")]} columns={[
          col("plan_name", "Plan"), col("monthly_fee", "Fee", "money"),
          { key: "hours", label: "Hours used", value: (r) => Number(r.hours_used), render: (r) => `${r.hours_used} of ${r.monthly_hours} h` },
          col("status", "Status", "status"), col("guarantee_status", "Guarantee", "status"), col("renews_at", "Renews", "day"),
        ]} />}

      {tab === "Projects" && <DataTable<R> title="Projects" rows={data.projects} getId={(r) => r.id} onRowClick={open("projects")} empty="No projects yet."
        bulkActions={[bulkUpdate("projects", { status: "active" }, "Mark active"), bulkUpdate("projects", { status: "completed", completed_at: new Date().toISOString() }, "Mark completed"), bulkUpdate("projects", { assigned_to: adminEmail }, "Assign to me"), archive("projects")]}
        columns={[col("name", "Project"), col("service", "Service"), col("hours", "Hours", "hours"), col("status", "Status", "status"), col("assigned_to", "Assigned to"), col("due_at", "Due", "day")]} />}

      {tab === "Invoices" && <DataTable<R> title="Invoices" rows={data.invoices} getId={(r) => r.id} onRowClick={open("invoices")} empty="No invoices yet."
        toolbar={<Btn icon={Plus} onClick={() => setModal({ title: "New invoice", submitLabel: "Issue invoice", fields: [{ name: "subscription", label: "Subscription", type: "select", options: ["none", ...data.subscriptions.map((s) => `${s.plan_name} ${String(s.id).slice(0, 6)}`)] }, { name: "description", label: "Description", required: true }, { name: "amount", label: "Amount (USD)", type: "number", required: true }, { name: "due_at", label: "Due date", type: "date", defaultValue: new Date(Date.now() + 14 * 864e5).toISOString().slice(0, 10) }],
          onSubmit: async (v) => { const amount = Number(v.amount); if (!(amount > 0)) return "Enter an amount above 0."; const sub = data.subscriptions.find((s) => v.subscription.endsWith(String(s.id).slice(0, 6)));
            return done((await supabase.from("invoices").insert({ user_id: id, subscription_id: sub?.id ?? null, number: `INV-${today().replaceAll("-", "")}-${rand()}`, amount, description: v.description, due_at: v.due_at || null })).error); } })}>New invoice</Btn>}
        bulkActions={[bulkUpdate("invoices", { status: "overdue" }, "Mark overdue"), bulkVoid("invoices")]}
        columns={[col("number", "Invoice"), col("description", "Description"), col("amount", "Amount", "money"), col("status", "Status", "status"), col("issued_at", "Issued", "day"), col("due_at", "Due", "day")]} />}

      {tab === "Transactions" && <DataTable<R> title="Transactions" rows={data.transactions} getId={(r) => r.id} onRowClick={open("transactions")} empty="No transactions yet." bulkActions={[bulkVoid("transactions")]}
        columns={[col("reference", "Reference"), col("description", "Description"), col("amount", "Amount", "money"), col("method", "Method"), col("status", "Status", "status"), col("created_at", "Date", "date")]} />}

      {tab === "Support tickets" && <DataTable<R> title="Support tickets" rows={data.tickets} getId={(r) => r.id} onRowClick={open("support_tickets")} empty="No support tickets." toolbar={<Btn icon={Plus} onClick={newTicket}>New ticket</Btn>}
        bulkActions={[bulkUpdate("support_tickets", { assigned_to: adminEmail }, "Assign to me"), bulkUpdate("support_tickets", { status: "closed", closed_at: new Date().toISOString() }, "Close"), bulkDelete("support_tickets")]}
        columns={[col("subject", "Subject"), col("category", "Category"), col("priority", "Priority"), col("status", "Status", "status"), col("assigned_to", "Assigned to"), col("created_at", "Opened", "date")]} />}

      {tab === "Activities" && <DataTable<R> title="Activities" rows={data.activities} getId={(r) => r.id} onRowClick={open("crm_activities")} empty="No calls or notes logged yet." toolbar={<Btn icon={Phone} onClick={logActivity}>Log activity</Btn>}
        bulkActions={[bulkDelete("crm_activities")]}
        columns={[col("occurred_at", "When", "date"), col("kind", "Type"), col("subject", "Subject"), col("outcome", "Outcome"), col("follow_up_at", "Follow-up", "day"), col("actor_label", "By")]} />}

      {tab === "Tasks" && <DataTable<R> title="Tasks" rows={data.tasks} getId={(r) => r.id} onRowClick={open("tasks")} empty="No tasks yet." toolbar={<Btn icon={ListChecks} onClick={newTask}>New task</Btn>}
        bulkActions={[bulkUpdate("tasks", { status: "completed", completed_at: new Date().toISOString() }, "Complete"), bulkUpdate("tasks", { assigned_to: adminEmail }, "Assign to me"), bulkDelete("tasks")]}
        columns={[col("title", "Task"), col("priority", "Priority"), { key: "status", label: "Status", value: (r) => String(r.status), render: (r) => <StatusBadge status={r.status !== "completed" && r.due_at && String(r.due_at) < today() ? "overdue" : String(r.status)} label={r.status !== "completed" && r.due_at && String(r.due_at) < today() ? "overdue" : undefined} /> }, col("due_at", "Due", "day"), col("assigned_to", "Assigned to")]} />}

      {tab === "Privacy" && <DataTable<R> title="Privacy requests" rows={data.compliance} getId={(r) => r.id} onRowClick={open("compliance_requests")} empty="No privacy requests." toolbar={<Btn icon={Plus} onClick={newPrivacy}>Log request</Btn>}
        bulkActions={[bulkUpdate("compliance_requests", { status: "completed", completed_at: new Date().toISOString() }, "Mark completed")]}
        columns={[col("kind", "Request"), col("details", "Details"), { key: "status", label: "Status", value: (r) => String(r.status), render: (r) => <StatusBadge status={r.status === "open" && String(r.due_at) < today() ? "overdue" : String(r.status)} /> }, { key: "due", label: "Due", value: (r) => formatDay(String(r.due_at)) }, col("actor_label", "Logged by")]} />}

      {tab === "Audit log" && <Section title="Audit log"><AuditList rows={data.audit} showTable /></Section>}

      {modal && <FormModal {...modal} onClose={() => setModal(null)} />}
    </div>
  );
}
