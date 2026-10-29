import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { DataTable, StatusBadge } from "@/components/admin/data-table";
import { formatAccount, formatDate, money, statusLabel, type AppStatus } from "@/lib/admin";

export const Route = createFileRoute("/admin/applications/")({ component: Applications });

function Applications() {
  const navigate = useNavigate();
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
  const counts = (s: AppStatus) => data.filter((r) => r.status === s).length;
  const rows = filter === "all" ? data : data.filter((r) => r.status === filter);
  return (
    <div className="space-y-6">
      <div><h1 className="text-2xl font-extrabold sm:text-3xl">Applications</h1><p className="mt-1 text-sm text-muted-foreground">Every submitted application. Select one to review and decide.</p></div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        {(Object.keys(statusLabel) as AppStatus[]).map((s) => (
          <button key={s} type="button" onClick={() => setFilter(filter === s ? "all" : s)} className={`rounded-2xl border bg-card p-4 text-left ${filter === s ? "ring-2 ring-primary" : ""}`}>
            <p className="text-xs text-muted-foreground">{statusLabel[s]}</p><p className="mt-1 text-2xl font-extrabold">{counts(s)}</p>
          </button>
        ))}
      </div>
      {error ? <p className="text-sm text-destructive">{(error as Error).message}</p> : isLoading ? <p className="text-sm text-muted-foreground">Loading applications…</p> :
        <DataTable<Row> title="Applications" rows={rows} onRowClick={(r) => navigate({ to: "/admin/applications/$id", params: { id: r.id } })} empty="No applications match." columns={[
          { key: "acct", label: "Account no.", value: (r) => r.account_number, render: (r) => <span className="font-mono">{formatAccount(r.account_number)}</span> },
          { key: "name", label: "Applicant", value: (r) => `${r.profile?.first_name ?? ""} ${r.profile?.last_name ?? ""}`.trim() },
          { key: "company", label: "Business", value: (r) => r.profile?.company ?? "" },
          { key: "plan", label: "Plan", value: (r) => r.plan_name, render: (r) => `${r.plan_name} · ${money(r.monthly_fee)}` },
          { key: "status", label: "Status", value: (r) => r.status, render: (r) => <StatusBadge status={r.status} label={statusLabel[r.status]} /> },
          { key: "assigned", label: "Assigned to", value: (r) => r.assigned_to ?? "—" },
          { key: "date", label: "Submitted", value: (r) => r.created_at, render: (r) => formatDate(r.created_at) },
        ]} />}
    </div>
  );
}
