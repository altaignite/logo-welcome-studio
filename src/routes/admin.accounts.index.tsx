import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { DataTable, StatusBadge } from "@/components/admin/data-table";
import { formatAccount, formatDate, statusLabel } from "@/lib/admin";

export const Route = createFileRoute("/admin/accounts/")({ component: Accounts });

function Accounts() {
  const navigate = useNavigate();
  const { data = [], isLoading, error } = useQuery({
    queryKey: ["admin", "accounts"],
    queryFn: async () => {
      const [p, a] = await Promise.all([
        supabase.from("profiles").select("*").order("created_at", { ascending: false }),
        supabase.from("applications").select("user_id, status, plan_name, created_at").order("created_at", { ascending: false }),
      ]);
      if (p.error) throw p.error;
      const apps = a.data ?? [];
      return p.data.filter((x) => apps.some((ap) => ap.user_id === x.id)).map((x) => ({ ...x, app: apps.find((ap) => ap.user_id === x.id) }));
    },
  });
  type Row = (typeof data)[number];
  return (
    <div className="space-y-6">
      <div><h1 className="text-2xl font-extrabold sm:text-3xl">Accounts</h1><p className="mt-1 text-sm text-muted-foreground">All client accounts. Select one to see the full account.</p></div>
      {error ? <p className="text-sm text-destructive">{(error as Error).message}</p> : isLoading ? <p className="text-sm text-muted-foreground">Loading accounts…</p> :
        <DataTable<Row> title="Accounts" rows={data} onRowClick={(r) => navigate({ to: "/admin/accounts/$id", params: { id: r.id } })} empty="No accounts yet." columns={[
          { key: "acct", label: "Account no.", value: (r) => r.account_number, render: (r) => <span className="font-mono">{formatAccount(r.account_number)}</span> },
          { key: "name", label: "Name", value: (r) => `${r.first_name ?? ""} ${r.last_name ?? ""}`.trim() },
          { key: "company", label: "Business", value: (r) => r.company ?? "" },
          { key: "email", label: "Email", value: (r) => r.email ?? "" },
          { key: "plan", label: "Plan", value: (r) => r.app?.plan_name ?? "—" },
          { key: "status", label: "Application", value: (r) => r.app?.status ?? "", render: (r) => r.app ? <StatusBadge status={r.app.status} label={statusLabel[r.app.status]} /> : "—" },
          { key: "created", label: "Joined", value: (r) => r.created_at, render: (r) => formatDate(r.created_at) },
        ]} />}
    </div>
  );
}
