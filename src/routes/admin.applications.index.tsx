import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { SwitchField } from "@/components/switch-field";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getRouteApi } from "@tanstack/react-router";
import { usePopup } from "@/components/popup";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { DataTable, StatusBadge } from "@/components/admin/data-table";
import { formatAccount, formatDate, money, statusLabel, type AppStatus } from "@/lib/admin";

export const Route = createFileRoute("/admin/applications/")({ component: Applications });

const adminRoute = getRouteApi("/admin");

function Applications() {
  const navigate = useNavigate();
  const { adminEmail, adminId } = adminRoute.useRouteContext();
  const qc = useQueryClient();
  const popup = usePopup();
  const [showArchived, setShowArchived] = useState(false);
  const [filter, setFilter] = useState<AppStatus | "all">("all");
  const { data = [], isLoading, error } = useQuery({
    queryKey: ["admin", "applications"],
    queryFn: async () => {
      const [a, p] = await Promise.all([
        supabase.from("applications").select("*").order("created_at", { ascending: false }),
        supabase.from("profiles").select("id, first_name, last_name, company"),
      ]);
      if (a.error) throw a.error;
      return a.data.map((x) => ({ ...x, profile: p.data?.find((y) => y.id === x.user_id) }));
    },
  });
  type Row = (typeof data)[number];
  const visible = data.filter((r) => showArchived || !r.archived_at);
  const rows = filter === "all" ? visible : visible.filter((r) => r.status === filter);
  const bulk = (label: string, patch: Record<string, unknown>, only?: AppStatus, toStatus?: AppStatus) => ({
    label, run: (sel: Row[]) => {
      const list = only ? sel.filter((r) => r.status === only) : sel;
      popup({ type: "info", title: `${label} for ${list.length} application${list.length === 1 ? "" : "s"}?`, description: only && list.length < sel.length ? `Only ${statusLabel[only].toLowerCase()} applications are changed.` : undefined, primaryLabel: label, secondaryLabel: "Cancel",
        onPrimary: async () => {
          if (!list.length) return;
          const up = await supabase.from("applications").update({ ...patch, updated_at: new Date().toISOString() }).in("id", list.map((r) => r.id));
          if (up.error) { popup({ type: "error", title: "Couldn't update", description: up.error.message, primaryLabel: "Close", secondaryLabel: null }); return; }
          await supabase.from("application_events").insert(list.map((r) => ({ application_id: r.id, actor_id: adminId, actor_label: adminEmail, action: `${label} (bulk)`, ...(toStatus ? { from_status: r.status, to_status: toStatus } : {}) })));
          qc.invalidateQueries({ queryKey: ["admin"] });
        } });
    },
  });
  return (
    <div className="space-y-6">
      <div><h1 className="text-2xl font-extrabold sm:text-3xl">Applications</h1><p className="mt-1 text-sm text-muted-foreground">Every submitted application. Select one to review and decide.</p></div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        {(Object.keys(statusLabel) as AppStatus[]).map((s) => (
          <button key={s} type="button" onClick={() => setFilter(filter === s ? "all" : s)} className={`rounded-2xl border bg-card p-4 text-left ${filter === s ? "ring-2 ring-primary" : ""}`}>
            <p className="text-xs text-muted-foreground">{statusLabel[s]}</p><p className="mt-1 text-2xl font-extrabold">{visible.filter((r) => r.status === s).length}</p>
          </button>
        ))}
      </div>
      {error ? <p className="text-sm text-destructive">{(error as Error).message}</p> : isLoading ? <p className="text-sm text-muted-foreground">Loading applications…</p> :
        <DataTable<Row> title="Applications" rows={rows} getId={(r) => r.id}
          toolbar={<SwitchField checked={showArchived} onCheckedChange={setShowArchived} label="Show archived" />}
          bulkActions={[bulk("Assign to me", { assigned_to: adminEmail }), bulk("Start review", { status: "in_review", assigned_to: adminEmail }, "submitted", "in_review"), bulk("Archive", { archived_at: new Date().toISOString() })]} onRowClick={(r) => navigate({ to: "/admin/applications/$id", params: { id: r.id } })} empty="No applications match." columns={[
          { key: "acct", label: "Account no.", value: (r) => r.account_number, render: (r) => <span className="font-mono">{formatAccount(r.account_number)}</span> },
          { key: "name", label: "Applicant", value: (r) => `${r.profile?.first_name ?? ""} ${r.profile?.last_name ?? ""}`.trim() },
          { key: "company", label: "Business", value: (r) => r.profile?.company ?? "" },
          { key: "plan", label: "Plan", value: (r) => r.plan_name, render: (r) => <span>{r.plan_name}<span className="ml-2 text-muted-foreground">{money(r.monthly_fee)}</span></span> },
          { key: "status", label: "Status", value: (r) => r.status, render: (r) => <StatusBadge status={r.status} label={statusLabel[r.status]} /> },
          { key: "assigned", label: "Assigned to", value: (r) => r.assigned_to ?? "—" },
          { key: "date", label: "Submitted", value: (r) => r.created_at, render: (r) => formatDate(r.created_at) },
        ]} />}
    </div>
  );
}
