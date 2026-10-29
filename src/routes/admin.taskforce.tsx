import { createFileRoute, getRouteApi, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { DataTable, StatusBadge } from "@/components/admin/data-table";
import { FormModal, type FieldDef } from "@/components/admin/form-modal";
import { db } from "@/components/admin/record-bits";
import { formatDay } from "@/lib/admin";

export const Route = createFileRoute("/admin/taskforce")({ component: Taskforce });
const adminRoute = getRouteApi("/admin");
const columns = [["open", "To do"], ["in_progress", "In progress"], ["review", "Review"], ["completed", "Done"]] as const;
const priorities = ["low", "normal", "high", "urgent"];
type Task = { id: string; title: string; status: string; priority: string; due_at: string | null; assigned_to: string | null; user_id: string; project_id: string | null; subscription_id: string | null; over_allowance: boolean; overage_approved: boolean; client: string; project: string; hoursLeft: number | null };

function Taskforce() {
  const { adminEmail, adminId } = adminRoute.useRouteContext();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [view, setView] = useState<"list" | "board">("board");
  const [filter, setFilter] = useState({ client: "", assignee: "", priority: "", overdue: false });
  const [modal, setModal] = useState<{ title: string; fields: FieldDef[]; submit: (v: any) => Promise<string | null> } | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ["admin", "taskforce"],
    queryFn: async () => {
      const [t, p, pr, s] = await Promise.all([
        db.from("tasks").select("*").order("created_at", { ascending: false }),
        db.from("profiles").select("id, company, first_name, last_name"),
        db.from("projects").select("id, name, user_id, subscription_id, status"),
        db.from("subscriptions").select("id, user_id, monthly_hours, hours_used, status"),
      ]);
      if (t.error) throw t.error;
      const name = (id: string) => { const x = (p.data ?? []).find((r: any) => r.id === id); return x ? x.company || `${x.first_name ?? ""} ${x.last_name ?? ""}`.trim() : "—"; };
      const tasks: Task[] = (t.data ?? []).map((r: any) => {
        const sub = (s.data ?? []).find((x: any) => x.id === r.subscription_id) ?? (s.data ?? []).find((x: any) => x.user_id === r.user_id && x.status === "active");
        return { ...r, client: name(r.user_id), project: (pr.data ?? []).find((x: any) => x.id === r.project_id)?.name ?? "—", hoursLeft: sub ? Number(sub.monthly_hours) - Number(sub.hours_used) : null };
      });
      return { tasks, projects: (pr.data ?? []) as any[], clients: (p.data ?? []) as any[] };
    },
  });
  const refresh = () => qc.invalidateQueries({ queryKey: ["admin"] });
  const today = new Date().toISOString().slice(0, 10);
  const shown = (data?.tasks ?? []).filter((t) =>
    (!filter.client || t.client === filter.client) && (!filter.assignee || t.assigned_to === filter.assignee) && (!filter.priority || t.priority === filter.priority) &&
    (!filter.overdue || (!!t.due_at && t.due_at < today && t.status !== "completed")));
  const setStatus = async (ids: string[], status: string) => {
    await db.from("tasks").update({ status, completed_at: status === "completed" ? new Date().toISOString() : null }).in("id", ids); await refresh();
  };
  const newTask = () => setModal({
    title: "New task",
    fields: [
      { name: "project", label: "Project", type: "select", options: (data?.projects ?? []).filter((p) => p.status !== "cancelled").map((p) => `${p.name}`), required: true },
      { name: "title", label: "Task", required: true }, { name: "details", label: "Details", type: "textarea" },
      { name: "priority", label: "Priority", type: "select", options: priorities, defaultValue: "normal" }, { name: "due_at", label: "Due date", type: "date" },
      { name: "estimated_hours", label: "Estimated hours", type: "number" }, { name: "assigned_to", label: "Assigned to", defaultValue: adminEmail },
    ],
    submit: async (v) => {
      const p = data?.projects.find((x) => x.name === v.project); if (!p) return "Choose a project.";
      const r = await db.from("tasks").insert({ user_id: p.user_id, project_id: p.id, subscription_id: p.subscription_id, title: v.title, details: v.details || null, priority: v.priority, due_at: v.due_at || null, estimated_hours: v.estimated_hours ? Number(v.estimated_hours) : null, assigned_to: v.assigned_to || null, actor_label: adminEmail });
      if (r.error) return r.error.message; await refresh(); return null;
    },
  });
  const logTime = (t: Task) => {
    if (!t.project_id) return;
    const warn = t.hoursLeft !== null && t.hoursLeft <= 0 && !t.overage_approved;
    setModal({
      title: `Log time on ${t.title}`,
      fields: [{ name: "hours", label: "Hours", type: "number", required: true }, { name: "description", label: "What was done", type: "textarea", required: true }],
      submit: async (v) => {
        const h = Number(v.hours); if (!(h > 0) || h > 24) return "Hours must be between 0 and 24.";
        if (warn) return "This client has no hours left. Ask the client to approve extra hours on this task first, or approve it yourself from the task page.";
        const r = await db.from("time_entries").insert({ project_id: t.project_id, task_id: t.id, user_id: t.user_id, hours: h, description: v.description, worked_on: today, actor_id: adminId, actor_label: adminEmail });
        if (r.error) return r.error.message; await refresh(); return null;
      },
    });
  };
  const assignees = [...new Set((data?.tasks ?? []).map((t) => t.assigned_to).filter(Boolean))] as string[];
  const clients = [...new Set((data?.tasks ?? []).map((t) => t.client))];
  const sel = "h-9 rounded-lg border bg-background px-2 text-sm";
  const counts = { open: shown.filter((t) => t.status !== "completed").length, overdue: shown.filter((t) => t.due_at && t.due_at < today && t.status !== "completed").length, over: shown.filter((t) => t.over_allowance).length };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><h1 className="text-2xl font-extrabold sm:text-3xl">Taskforce</h1><p className="mt-1 text-sm text-muted-foreground">Every task to action across all client projects.</p></div>
        <button type="button" onClick={newTask} className="inline-flex h-10 items-center rounded-full bg-foreground px-5 text-sm font-semibold text-background">New task</button>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        {[["Open tasks", counts.open], ["Overdue", counts.overdue], ["Over hour allowance", counts.over]].map(([l, n]) => (
          <div key={l} className="rounded-2xl border bg-card p-4"><p className="text-sm text-muted-foreground">{l}</p><p className="mt-1 text-2xl font-bold">{n}</p></div>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-lg border bg-card p-0.5">
          {(["board", "list"] as const).map((v) => <button key={v} type="button" onClick={() => setView(v)} className={`rounded-md px-3 py-1.5 text-sm capitalize ${view === v ? "bg-secondary font-semibold" : "text-muted-foreground"}`}>{v}</button>)}
        </div>
        <select aria-label="Client" className={sel} value={filter.client} onChange={(e) => setFilter({ ...filter, client: e.target.value })}><option value="">All clients</option>{clients.map((c) => <option key={c}>{c}</option>)}</select>
        <select aria-label="Assignee" className={sel} value={filter.assignee} onChange={(e) => setFilter({ ...filter, assignee: e.target.value })}><option value="">Anyone</option>{assignees.map((c) => <option key={c}>{c}</option>)}</select>
        <select aria-label="Priority" className={sel} value={filter.priority} onChange={(e) => setFilter({ ...filter, priority: e.target.value })}><option value="">Any priority</option>{priorities.map((c) => <option key={c}>{c}</option>)}</select>
        <label className="inline-flex items-center gap-2 text-sm"><input type="checkbox" className="size-4 accent-primary" checked={filter.overdue} onChange={(e) => setFilter({ ...filter, overdue: e.target.checked })} />Overdue only</label>
      </div>
      {error ? <p className="text-sm text-destructive">{(error as Error).message}</p> : isLoading ? <p className="text-sm text-muted-foreground">Loading tasks…</p> : view === "board" ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {columns.map(([key, label]) => {
            const list = shown.filter((t) => (key === "open" ? !["in_progress", "review", "completed"].includes(t.status) : t.status === key));
            return (
              <section key={key} className="rounded-2xl border bg-card p-3">
                <h2 className="mb-3 flex items-center justify-between px-1 text-sm font-semibold">{label}<span className="text-muted-foreground">{list.length}</span></h2>
                <div className="space-y-2">
                  {list.map((t) => (
                    <article key={t.id} className="rounded-xl border bg-background p-3 text-sm">
                      <button type="button" onClick={() => navigate({ to: "/admin/records/$kind/$id", params: { kind: "tasks", id: t.id } })} className="text-left font-semibold hover:underline">{t.title}</button>
                      <p className="mt-0.5 text-xs text-muted-foreground">{t.client}, {t.project}</p>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        <StatusBadge status={t.priority === "urgent" || t.priority === "high" ? "past_due" : "planned"} label={t.priority} />
                        {t.due_at && <StatusBadge status={t.due_at < today && t.status !== "completed" ? "overdue" : "open"} label={`Due ${formatDay(t.due_at)}`} />}
                        {t.over_allowance && <StatusBadge status="failed" label="Over allowance" />}
                      </div>
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        <select aria-label="Move task" className="h-8 rounded-md border bg-card px-1.5 text-xs" value={key} onChange={(e) => setStatus([t.id], e.target.value)}>{columns.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
                        {t.project_id && <button type="button" onClick={() => logTime(t)} className="h-8 rounded-md border px-2 text-xs font-medium hover:bg-secondary">Log time</button>}
                      </div>
                    </article>
                  ))}
                  {list.length === 0 && <p className="px-1 py-4 text-center text-xs text-muted-foreground">Nothing here.</p>}
                </div>
              </section>
            );
          })}
        </div>
      ) : (
        <DataTable<Task> title="Tasks" rows={shown} getId={(r) => r.id} onRowClick={(r) => navigate({ to: "/admin/records/$kind/$id", params: { kind: "tasks", id: r.id } })}
          bulkActions={[...columns.map(([k, l]) => ({ label: `Move to ${l}`, run: (rows: Task[]) => setStatus(rows.map((r) => r.id), k) })),
            { label: "Assign to me", run: async (rows) => { await db.from("tasks").update({ assigned_to: adminEmail }).in("id", rows.map((r) => r.id)); await refresh(); } }]}
          columns={[
            { key: "title", label: "Task", value: (r) => r.title },
            { key: "client", label: "Client", value: (r) => r.client },
            { key: "project", label: "Project", value: (r) => r.project },
            { key: "status", label: "Status", value: (r) => r.status, render: (r) => <StatusBadge status={r.status} /> },
            { key: "priority", label: "Priority", value: (r) => r.priority },
            { key: "due", label: "Due", value: (r) => r.due_at ?? "", render: (r) => formatDay(r.due_at) },
            { key: "who", label: "Assigned", value: (r) => r.assigned_to ?? "" },
            { key: "hours", label: "Hours left", value: (r) => r.hoursLeft ?? 0, render: (r) => r.hoursLeft === null ? "—" : <span className={r.hoursLeft <= 0 ? "font-semibold text-destructive" : ""}>{r.hoursLeft}</span> },
          ]} />
      )}
      {modal && <FormModal title={modal.title} fields={modal.fields} submitLabel="Save" onClose={() => setModal(null)} onSubmit={modal.submit} />}
    </div>
  );
}
