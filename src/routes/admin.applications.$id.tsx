import { createFileRoute, Link, getRouteApi, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Archive, ArchiveRestore, ArrowLeft, Check, Circle, MessageSquare, Pencil, UserCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { DataTable, StatusBadge } from "@/components/admin/data-table";
import { FormModal, type FieldDef } from "@/components/admin/form-modal";
import { Btn, ClientBar, FieldGrid, Section, fmtText } from "@/components/admin/record-bits";
import { usePopup } from "@/components/popup";
import { plans } from "@/lib/signup";
import type { Vals } from "@/lib/records";
import { formatAccount, formatDate, guaranteeEnd, money, statusLabel, workflowActions, workflowStages, type WorkflowAction, type AppStatus } from "@/lib/admin";

export const Route = createFileRoute("/admin/applications/$id")({ component: ApplicationDetail });
const adminRoute = getRouteApi("/admin");
type Modal = { title: string; fields: FieldDef[]; submitLabel: string; onSubmit: (v: Vals) => Promise<string | null> };

function ApplicationDetail() {
  const { id } = Route.useParams();
  const { adminEmail, adminId } = adminRoute.useRouteContext();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const popup = usePopup();
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [modal, setModal] = useState<Modal | null>(null);
  const { data, isLoading, error } = useQuery({
    queryKey: ["admin", "application", id],
    queryFn: async () => {
      const a = await supabase.from("applications").select("*").eq("id", id).maybeSingle();
      if (a.error) throw a.error;
      if (!a.data) return null;
      const uid = a.data.user_id;
      const [p, e, s] = await Promise.all([
        supabase.from("profiles").select("*").eq("id", uid).maybeSingle(),
        supabase.from("application_events").select("*").eq("application_id", id).order("created_at", { ascending: false }),
        supabase.from("subscriptions").select("*").eq("application_id", id),
      ]);
      const subIds = (s.data ?? []).map((x) => x.id);
      const none = ["00000000-0000-0000-0000-000000000000"];
      const [pr, inv, tx, others] = await Promise.all([
        supabase.from("projects").select("*").in("subscription_id", subIds.length ? subIds : none),
        supabase.from("invoices").select("*").eq("user_id", uid).order("issued_at", { ascending: false }),
        supabase.from("transactions").select("*").eq("user_id", uid).order("created_at", { ascending: false }),
        supabase.from("applications").select("id, plan_name, status, created_at").eq("user_id", uid).neq("id", id),
      ]);
      return { app: a.data, profile: p.data, events: e.data ?? [], subs: s.data ?? [], projects: pr.data ?? [], invoices: inv.data ?? [], transactions: tx.data ?? [], others: others.data ?? [] };
    },
  });
  const refresh = () => qc.invalidateQueries({ queryKey: ["admin"] });
  const log = (action: string, extra: { from_status?: AppStatus; to_status?: AppStatus; note?: string | null } = {}) =>
    supabase.from("application_events").insert({ application_id: id, actor_id: adminId, actor_label: adminEmail, action, ...extra });

  if (error) return <p className="text-sm text-destructive">{(error as Error).message}</p>;
  if (isLoading) return <p className="text-sm text-muted-foreground">Loading application…</p>;
  if (!data) return <p className="text-sm text-muted-foreground">This application doesn't exist.</p>;
  const { app, profile, events } = data;

  const run = async (a: WorkflowAction) => {
    if (a.needsNote && !note.trim()) {
      popup({ type: "error", title: "Add a note first", description: `Explain why you chose "${a.label}". It's saved in the audit log.`, primaryLabel: "Got it", secondaryLabel: null });
      return;
    }
    popup({
      type: a.tone === "danger" ? "error" : "info", title: `${a.label}?`,
      description: `The application moves from ${statusLabel[app.status]} to ${statusLabel[a.to]}.`,
      primaryLabel: a.label, secondaryLabel: "Cancel",
      onPrimary: async () => {
        setBusy(true);
        const now = new Date();
        const final = a.to === "approved" || a.to === "rejected";
        const up = await supabase.from("applications").update({ status: a.to, updated_at: now.toISOString(), ...(final ? { decided_at: now.toISOString() } : {}), assigned_to: app.assigned_to ?? adminEmail }).eq("id", id);
        if (!up.error) {
          await log(a.label, { from_status: app.status, to_status: a.to, note: note.trim() || null });
          const subIds = data.subs.map((s) => s.id);
          if (a.to === "approved" && subIds.length) {
            const renew = new Date(now); renew.setMonth(renew.getMonth() + 1);
            await supabase.from("subscriptions").update({ status: "active", started_at: now.toISOString(), renews_at: renew.toISOString(), guarantee_ends_at: guaranteeEnd(now).toISOString(), guarantee_status: "running" }).in("id", subIds).eq("status", "pending");
            await supabase.from("projects").update({ status: "active", started_at: now.toISOString().slice(0, 10) }).in("subscription_id", subIds).eq("status", "planned");
            if (profile && (profile.status === "onboarding" || profile.status === "prospect")) await supabase.from("profiles").update({ status: "active", status_changed_at: now.toISOString() }).eq("id", app.user_id);
          }
          if (a.to === "rejected" && subIds.length) {
            await supabase.from("subscriptions").update({ status: "cancelled", cancelled_at: now.toISOString() }).in("id", subIds).eq("status", "pending");
            await supabase.from("projects").update({ status: "cancelled" }).in("subscription_id", subIds).eq("status", "planned");
          }
        }
        setBusy(false); setNote("");
        if (up.error) popup({ type: "error", title: "Couldn't update the application", description: up.error.message });
        refresh();
      },
    });
  };
  const assignToMe = async () => {
    setBusy(true);
    const up = await supabase.from("applications").update({ assigned_to: adminEmail }).eq("id", id);
    if (!up.error) await log(`Assigned to ${adminEmail}`);
    setBusy(false); refresh();
  };
  const addNote = async () => {
    if (!note.trim()) return;
    setBusy(true); await log("Internal note added", { note: note.trim() }); setBusy(false); setNote(""); refresh();
  };
  const decided = app.status === "approved" || app.status === "rejected";
  const edit = () => setModal({
    title: "Edit application", submitLabel: "Save changes",
    fields: [
      ...(decided ? [] : [{ name: "plan", label: "Plan", type: "select" as const, options: plans.map((x) => x.name), defaultValue: app.plan_name }]),
      { name: "assigned_to", label: "Assigned to", defaultValue: app.assigned_to ?? "" },
      { name: "internal_notes", label: "Internal notes", type: "textarea", defaultValue: app.internal_notes ?? "" },
    ],
    onSubmit: async (v) => {
      const plan = plans.find((x) => x.name === v.plan);
      const patch = { assigned_to: v.assigned_to || null, internal_notes: v.internal_notes || null, updated_at: new Date().toISOString(),
        ...(plan && plan.name !== app.plan_name ? { plan_id: plan.id, plan_name: plan.name, monthly_fee: plan.monthlyFee, monthly_hours: plan.monthlyHours } : {}) };
      const up = await supabase.from("applications").update(patch).eq("id", id);
      if (up.error) return up.error.message;
      if (plan && plan.name !== app.plan_name) {
        await supabase.from("subscriptions").update({ plan_name: plan.name, monthly_fee: plan.monthlyFee, monthly_hours: plan.monthlyHours }).eq("application_id", id).eq("status", "pending");
        await log("Plan changed", { note: `${app.plan_name} to ${plan.name}` });
      } else await log("Application details edited");
      await refresh(); return null;
    },
  });
  const archive = async () => {
    await supabase.from("applications").update({ archived_at: app.archived_at ? null : new Date().toISOString() }).eq("id", id);
    await log(app.archived_at ? "Application restored" : "Application archived"); refresh();
  };

  const stageIndex = app.status === "approved" || app.status === "rejected" ? 2 : app.status === "submitted" ? 0 : 1;
  const stageLabel = (i: number) => (i === 2 && app.status === "rejected" ? "Rejected" : i === 2 ? "Decision" : statusLabel[workflowStages[i]!]);
  const details: [string, string][] = [
    ["Account number", formatAccount(app.account_number)], ["Plan", app.plan_name], ["Service fee", `${money(app.monthly_fee)} per month`],
    ["Assigned hours", `${app.monthly_hours} hours per month`], ["Digitally signed", formatDate(app.signed_at)], ["Submitted", formatDate(app.created_at)],
    ["Decision", formatDate(app.decided_at)], ["Assigned to", app.assigned_to ?? "Nobody"], ["Archived", formatDate(app.archived_at)],
  ];
  const actions = workflowActions[app.status];
  const openRec = (kind: "subscriptions" | "projects" | "invoices" | "transactions") => (r: { id: string }) => navigate({ to: "/admin/records/$kind/$id", params: { kind, id: r.id } });
  return (
    <div className="space-y-6">
      <Link to="/admin/applications" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" />Applications</Link>
      <ClientBar profile={profile} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Application</p>
          <h1 className="truncate text-2xl font-extrabold sm:text-3xl">{app.plan_name} plan</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={app.status} label={statusLabel[app.status]} />
          <Btn icon={Pencil} onClick={edit}>Edit</Btn>
          <Btn icon={app.archived_at ? ArchiveRestore : Archive} onClick={archive}>{app.archived_at ? "Restore" : "Archive"}</Btn>
        </div>
      </div>

      <div className="rounded-2xl border bg-card p-5">
        <ol className="grid grid-cols-3 gap-2">
          {[0, 1, 2].map((i) => {
            const done = i < stageIndex || (i === 2 && decided);
            const current = i === stageIndex && !done;
            return <li key={i} className="min-w-0">
              <div className={`h-1.5 rounded-full ${done ? (app.status === "rejected" && i === 2 ? "bg-destructive" : "bg-foreground") : current ? "bg-primary" : "bg-secondary"}`} />
              <p className={`mt-2 flex items-center gap-1.5 truncate text-xs sm:text-sm ${current || done ? "font-semibold" : "text-muted-foreground"}`}>
                {done ? <Check className="size-3.5 shrink-0" /> : <Circle className="size-3.5 shrink-0" />}{stageLabel(i)}
              </p>
            </li>;
          })}
        </ol>
        {(app.status === "escalated" || app.status === "info_requested") && <p className="mt-4 rounded-lg bg-secondary p-3 text-sm">Currently <b>{statusLabel[app.status].toLowerCase()}</b>. See the audit log for the reason.</p>}
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="min-w-0 space-y-6">
          <Section title="Application details"><FieldGrid items={details} /></Section>
          {app.internal_notes && <Section title="Internal notes"><p className="whitespace-pre-wrap px-5 py-4 text-sm">{app.internal_notes}</p></Section>}
          <DataTable title="Subscription" rows={data.subs} searchable={false} onRowClick={openRec("subscriptions")} empty="No subscription linked." columns={[
            { key: "plan", label: "Subscription", value: (r) => r.plan_name }, { key: "status", label: "Status", value: (r) => r.status, render: (r) => <StatusBadge status={r.status} /> },
            { key: "hours", label: "Hours used", value: (r) => r.hours_used, render: (r) => `${r.hours_used} of ${r.monthly_hours} h` }, { key: "renew", label: "Renews", value: (r) => fmtText(r.renews_at, "day") },
          ]} />
          <DataTable title="Projects" rows={data.projects} searchable={false} onRowClick={openRec("projects")} empty="No projects linked." columns={[
            { key: "name", label: "Project", value: (r) => r.name }, { key: "status", label: "Status", value: (r) => r.status, render: (r) => <StatusBadge status={r.status} /> },
            { key: "hours", label: "Hours", value: (r) => r.hours }, { key: "due", label: "Due", value: (r) => fmtText(r.due_at, "day") },
          ]} />
          <DataTable title="Invoices" rows={data.invoices} searchable={false} onRowClick={openRec("invoices")} empty="No invoices for this client." columns={[
            { key: "no", label: "Invoice", value: (r) => r.number }, { key: "amount", label: "Amount", value: (r) => r.amount, render: (r) => money(r.amount) },
            { key: "status", label: "Status", value: (r) => r.status, render: (r) => <StatusBadge status={r.status} /> }, { key: "due", label: "Due", value: (r) => fmtText(r.due_at, "day") },
          ]} />
          <DataTable title="Transactions" rows={data.transactions} searchable={false} onRowClick={openRec("transactions")} empty="No transactions for this client." columns={[
            { key: "ref", label: "Reference", value: (r) => r.reference }, { key: "amount", label: "Amount", value: (r) => r.amount, render: (r) => money(r.amount) },
            { key: "status", label: "Status", value: (r) => r.status, render: (r) => <StatusBadge status={r.status} /> }, { key: "date", label: "Date", value: (r) => formatDate(r.created_at) },
          ]} />
          {data.others.length > 0 && <DataTable title="Other applications" rows={data.others} searchable={false} onRowClick={(r) => navigate({ to: "/admin/applications/$id", params: { id: r.id } })} columns={[
            { key: "plan", label: "Plan", value: (r) => r.plan_name }, { key: "status", label: "Status", value: (r) => r.status, render: (r) => <StatusBadge status={r.status} label={statusLabel[r.status]} /> },
            { key: "date", label: "Submitted", value: (r) => formatDate(r.created_at) },
          ]} />}
          <Section title="Audit log">
            <ol className="divide-y">
              {events.map((e) => (
                <li key={e.id} className="flex gap-3 px-5 py-4">
                  <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-full bg-secondary">{e.note ? <MessageSquare className="size-4" /> : <Check className="size-4" />}</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{e.action}</p>
                    {e.from_status && e.to_status && <p className="text-sm text-muted-foreground">{statusLabel[e.from_status]} → {statusLabel[e.to_status]}</p>}
                    {e.note && <p className="mt-1 whitespace-pre-wrap rounded-lg bg-secondary/60 p-2 text-sm">{e.note}</p>}
                    <p className="mt-1 text-xs text-muted-foreground">{e.actor_label}, {formatDate(e.created_at)}</p>
                  </div>
                </li>
              ))}
              {events.length === 0 && <li className="px-5 py-6 text-sm text-muted-foreground">No activity yet.</li>}
            </ol>
          </Section>
        </div>
        <aside className="space-y-4 xl:sticky xl:top-24 xl:self-start">
          <section className="rounded-2xl border bg-card p-5">
            <h2 className="font-semibold">Next step</h2>
            <p className="mt-1 text-sm text-muted-foreground">Assigned to: {app.assigned_to ?? "nobody"}</p>
            {app.assigned_to !== adminEmail && actions.length > 0 && <button type="button" disabled={busy} onClick={assignToMe} className="mt-3 inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-sm font-medium hover:bg-secondary"><UserCheck className="size-4" />Assign to me</button>}
            <label className="mt-4 block text-[13px] font-medium" htmlFor="note">Note</label>
            <textarea id="note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={2000} rows={3} placeholder="Reason or internal note (saved in the audit log)" className="mt-1.5 w-full rounded-lg border bg-background p-3 text-sm outline-none focus:ring-2 focus:ring-ring" />
            {actions.length === 0 ? <p className="mt-3 text-sm text-muted-foreground">This application is {statusLabel[app.status].toLowerCase()}. The decision is final.</p> :
              <div className="mt-3 grid gap-2">
                {actions.map((a) => (
                  <button key={a.to} type="button" disabled={busy} onClick={() => run(a)} className={a.tone === "primary" ? "signup-primary" : a.tone === "danger" ? "h-11 rounded-full border border-destructive/40 text-sm font-semibold text-destructive hover:bg-destructive/5" : "app-modal-secondary"}>{a.label}</button>
                ))}
              </div>}
            <button type="button" disabled={busy || !note.trim()} onClick={addNote} className="mt-2 w-full text-center text-sm text-muted-foreground hover:text-foreground disabled:opacity-50">Save note only</button>
          </section>
        </aside>
      </div>
      {modal && <FormModal {...modal} onClose={() => setModal(null)} />}
    </div>
  );
}
