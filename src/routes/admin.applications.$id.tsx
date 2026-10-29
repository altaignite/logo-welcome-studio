import { createFileRoute, Link, getRouteApi } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { ArrowLeft, Check, Circle, MessageSquare, UserCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { StatusBadge } from "@/components/admin/data-table";
import { usePopup } from "@/components/popup";
import { formatAccount, formatDate, money, statusLabel, workflowActions, workflowStages, type WorkflowAction, type AppStatus } from "@/lib/admin";

export const Route = createFileRoute("/admin/applications/$id")({ component: ApplicationDetail });
const adminRoute = getRouteApi("/admin");

function ApplicationDetail() {
  const { id } = Route.useParams();
  const { adminEmail, adminId } = adminRoute.useRouteContext();
  const qc = useQueryClient();
  const popup = usePopup();
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const { data, isLoading, error } = useQuery({
    queryKey: ["admin", "application", id],
    queryFn: async () => {
      const a = await supabase.from("applications").select("*").eq("id", id).maybeSingle();
      if (a.error) throw a.error;
      if (!a.data) return null;
      const [p, e] = await Promise.all([
        supabase.from("profiles").select("*").eq("id", a.data.user_id).maybeSingle(),
        supabase.from("application_events").select("*").eq("application_id", id).order("created_at", { ascending: false }),
      ]);
      return { app: a.data, profile: p.data, events: e.data ?? [] };
    },
  });
  const refresh = () => qc.invalidateQueries({ queryKey: ["admin"] });
  const log = (action: string, extra: { from_status?: AppStatus; to_status?: AppStatus; note?: string | undefined } = {}) =>
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
        const final = a.to === "approved" || a.to === "rejected";
        const up = await supabase.from("applications").update({ status: a.to, updated_at: new Date().toISOString(), ...(final ? { decided_at: new Date().toISOString() } : {}), assigned_to: app.assigned_to ?? adminEmail }).eq("id", id);
        if (!up.error) {
          await log(a.label, { from_status: app.status, to_status: a.to, note: note.trim() || undefined });
          if (a.to === "approved") {
            const now = new Date(); const renew = new Date(now); renew.setMonth(renew.getMonth() + 1);
            await supabase.from("subscriptions").update({ status: "active", started_at: now.toISOString(), renews_at: renew.toISOString() }).eq("user_id", app.user_id).eq("status", "pending");
          }
          if (a.to === "rejected") await supabase.from("subscriptions").update({ status: "cancelled" }).eq("user_id", app.user_id).eq("status", "pending");
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

  const stageIndex = app.status === "approved" ? 2 : app.status === "submitted" ? 0 : 1;
  const stageLabel = (i: number) => (i === 2 && app.status === "rejected" ? "Rejected" : i === 2 ? "Decision" : statusLabel[workflowStages[i]!]);
  const details: [string, string][] = profile ? [
    ["Account number", formatAccount(app.account_number)], ["Name", `${profile.first_name ?? ""} ${profile.last_name ?? ""}`], ["Business", profile.company ?? "—"],
    ["Email", profile.email ?? "—"], ["Mobile number", profile.phone ?? "—"], ["Country", profile.country ?? "—"],
    ["Plan", app.plan_name], ["Service fee", `${money(app.monthly_fee)} / month`], ["Assigned hours", `${app.monthly_hours} hours / month`],
    ["Digitally signed", formatDate(app.signed_at)], ["Submitted", formatDate(app.created_at)], ["Decision", formatDate(app.decided_at)],
  ] : [];
  const actions = workflowActions[app.status];
  return (
    <div className="space-y-6">
      <Link to="/admin/applications" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" />Applications</Link>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-extrabold sm:text-3xl">{profile?.first_name} {profile?.last_name}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{profile?.company} · <Link to="/admin/accounts/$id" params={{ id: app.user_id }} className="font-mono underline-offset-2 hover:underline">{formatAccount(app.account_number)}</Link></p>
        </div>
        <StatusBadge status={app.status} label={statusLabel[app.status]} />
      </div>

      <div className="rounded-2xl border bg-card p-5">
        <ol className="grid grid-cols-3 gap-2">
          {[0, 1, 2].map((i) => {
            const done = i < stageIndex || (i === 2 && (app.status === "approved" || app.status === "rejected"));
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
        <div className="space-y-6">
          <section className="overflow-hidden rounded-2xl border bg-card">
            <h2 className="border-b px-5 py-3 font-semibold">Application details</h2>
            <dl className="grid gap-px bg-border sm:grid-cols-2">
              {details.map(([k, v]) => <div key={k} className="bg-card px-5 py-3"><dt className="text-xs text-muted-foreground">{k}</dt><dd className="mt-0.5 text-sm font-medium">{v}</dd></div>)}
            </dl>
          </section>
          <section className="rounded-2xl border bg-card">
            <h2 className="border-b px-5 py-3 font-semibold">Audit log</h2>
            <ol className="divide-y">
              {events.map((e) => (
                <li key={e.id} className="flex gap-3 px-5 py-4">
                  <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-full bg-secondary">{e.note ? <MessageSquare className="size-4" /> : <Check className="size-4" />}</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{e.action}{e.from_status && e.to_status && <span className="text-muted-foreground"> · {statusLabel[e.from_status]} → {statusLabel[e.to_status]}</span>}</p>
                    {e.note && <p className="mt-1 whitespace-pre-wrap rounded-lg bg-secondary/60 p-2 text-sm">{e.note}</p>}
                    <p className="mt-1 text-xs text-muted-foreground">{e.actor_label} · {formatDate(e.created_at)}</p>
                  </div>
                </li>
              ))}
              {events.length === 0 && <li className="px-5 py-6 text-sm text-muted-foreground">No activity yet.</li>}
            </ol>
          </section>
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
    </div>
  );
}
