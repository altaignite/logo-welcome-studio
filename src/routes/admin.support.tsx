import { createFileRoute, getRouteApi, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { DataTable, StatusBadge } from "@/components/admin/data-table";
import { db } from "@/components/admin/record-bits";
import { formatDate } from "@/lib/admin";

export const Route = createFileRoute("/admin/support")({ component: Support });
const adminRoute = getRouteApi("/admin");
const tabs = ["open", "in_progress", "waiting", "closed", "all"] as const;
type Ticket = { id: string; subject: string; status: string; priority: string; category: string; assigned_to: string | null; user_id: string; updated_at: string; created_at: string; closed_at: string | null; client: string; last: string };

function Support() {
  const { adminEmail } = adminRoute.useRouteContext();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [tab, setTab] = useState<(typeof tabs)[number]>("open");
  const { data = [], isLoading, error } = useQuery({
    queryKey: ["admin", "support"],
    queryFn: async () => {
      const [t, p, m] = await Promise.all([
        db.from("support_tickets").select("*").order("updated_at", { ascending: false }),
        db.from("profiles").select("id, company, first_name, last_name"),
        db.from("ticket_messages").select("ticket_id, actor_label, created_at").order("created_at", { ascending: false }).limit(1000),
      ]);
      if (t.error) throw t.error;
      return (t.data ?? []).map((r: any): Ticket => {
        const x = (p.data ?? []).find((q: any) => q.id === r.user_id);
        return { ...r, client: x ? x.company || `${x.first_name ?? ""} ${x.last_name ?? ""}`.trim() : "—", last: (m.data ?? []).find((q: any) => q.ticket_id === r.id)?.actor_label ?? "—" };
      });
    },
  });
  const shown = tab === "all" ? data : data.filter((t: Ticket) => t.status === tab);
  const update = async (rows: Ticket[], patch: Record<string, unknown>) => { await db.from("support_tickets").update({ ...patch, updated_at: new Date().toISOString() }).in("id", rows.map((r) => r.id)); await qc.invalidateQueries({ queryKey: ["admin"] }); };
  return (
    <div className="space-y-6">
      <div><h1 className="text-2xl font-extrabold sm:text-3xl">Support</h1><p className="mt-1 text-sm text-muted-foreground">Every client inquiry. Closed tickets are locked for clients and can't be reopened or replied to by them.</p></div>
      <div className="flex flex-wrap gap-2">
        {tabs.map((t) => <button key={t} type="button" onClick={() => setTab(t)} className={`rounded-full border px-4 py-1.5 text-sm capitalize ${tab === t ? "border-foreground bg-foreground text-background" : "bg-card"}`}>{t.replace("_", " ")} <span className="opacity-60">{t === "all" ? data.length : data.filter((d: Ticket) => d.status === t).length}</span></button>)}
      </div>
      {error ? <p className="text-sm text-destructive">{(error as Error).message}</p> : isLoading ? <p className="text-sm text-muted-foreground">Loading tickets…</p> :
        <DataTable<Ticket> title="Support tickets" rows={shown} getId={(r) => r.id} empty="No tickets here."
          onRowClick={(r) => navigate({ to: "/admin/records/$kind/$id", params: { kind: "support_tickets", id: r.id } })}
          bulkActions={[
            { label: "Assign to me", run: (rows) => update(rows, { assigned_to: adminEmail }) },
            { label: "Mark in progress", run: (rows) => update(rows, { status: "in_progress", closed_at: null }) },
            { label: "Close", run: (rows) => update(rows, { status: "closed", closed_at: new Date().toISOString() }) },
          ]}
          columns={[
            { key: "subject", label: "Subject", value: (r) => r.subject },
            { key: "client", label: "Client", value: (r) => r.client },
            { key: "status", label: "Status", value: (r) => r.status, render: (r) => <StatusBadge status={r.status} /> },
            { key: "priority", label: "Priority", value: (r) => r.priority },
            { key: "category", label: "Category", value: (r) => r.category },
            { key: "who", label: "Assigned", value: (r) => r.assigned_to ?? "" },
            { key: "last", label: "Last reply by", value: (r) => r.last },
            { key: "updated", label: "Updated", value: (r) => r.updated_at, render: (r) => formatDate(r.updated_at) },
          ]} />}
    </div>
  );
}
