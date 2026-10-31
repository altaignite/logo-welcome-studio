import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { friendlyError } from "@/lib/errors";
import { ErrorState, TableSkeleton } from "@/components/loading";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { FormModal, type FieldDef } from "@/components/admin/form-modal";
import { inviteClient, setAccountStatus } from "@/lib/crm.functions";
import { UserPlus } from "lucide-react";
import { Btn } from "@/components/admin/record-bits";
import { supabase } from "@/integrations/supabase/client";
import { DataTable, StatusBadge } from "@/components/admin/data-table";
import { useEmailClients } from "@/components/admin/email-clients";
import { usePopup } from "@/components/popup";
import { accountStatusLabel, accountStatuses, formatAccount, formatDate, statusLabel, type AccountStatus } from "@/lib/admin";

export const Route = createFileRoute("/admin/accounts/")({ component: Accounts });

function Accounts() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const change = useServerFn(setAccountStatus), invite = useServerFn(inviteClient);
  const [inviting, setInviting] = useState(false);
  const popup = usePopup();
  const [modal, setModal] = useState<{ ids: string[] } | null>(null);
  const mail = useEmailClients(() => qc.invalidateQueries({ queryKey: ["admin"] }));
  const fields: FieldDef[] = [{ name: "status", label: "New status", type: "select", options: [...accountStatuses] }, { name: "reason", label: "Reason (saved in the audit log)", type: "textarea", required: true }];
  const { data = [], isLoading, error } = useQuery({
    queryKey: ["admin", "accounts"],
    queryFn: async () => {
      const [p, a] = await Promise.all([
        supabase.from("profiles").select("*").order("created_at", { ascending: false }),
        supabase.from("applications").select("user_id, status, plan_name, created_at").order("created_at", { ascending: false }),
      ]);
      if (p.error) throw p.error;
      const apps = a.data ?? [];
      // Every client account, including invited clients without an application yet; staff accounts are left out.
      const staffIds = new Set(((await supabase.from("user_roles").select("user_id").eq("role", "admin")).data ?? []).map((r) => r.user_id));
      return p.data.filter((x) => !staffIds.has(x.id)).map((x) => ({ ...x, app: apps.find((ap) => ap.user_id === x.id) }));
    },
  });
  type Row = (typeof data)[number];
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3"><div><h1 className="text-2xl font-extrabold sm:text-3xl">Accounts</h1><p className="mt-1 text-sm text-muted-foreground">All client accounts. Select one to see the full account.</p></div>
        <Btn icon={UserPlus} onClick={() => setInviting(true)}>New client</Btn></div>
      {error ? <ErrorState error={error} retry={() => location.reload()} /> : isLoading ? <TableSkeleton /> :
        <DataTable<Row> title="Accounts" rows={data} getId={(r) => r.id} bulkActions={[{ label: "Email", run: (rows) => mail.open(rows.map((r) => r.id)) }, { label: "Change status", run: (rows) => setModal({ ids: rows.map((r) => r.id) }) }]} onRowClick={(r) => navigate({ to: "/admin/accounts/$id", params: { id: r.id } })} empty="No accounts yet." columns={[
          { key: "acct", label: "Account no.", value: (r) => r.account_number, render: (r) => <span className="font-mono">{formatAccount(r.account_number)}</span> },
          { key: "name", label: "Name", value: (r) => `${r.first_name ?? ""} ${r.last_name ?? ""}`.trim() },
          { key: "company", label: "Business", value: (r) => r.company ?? "" },
          { key: "email", label: "Email", value: (r) => r.email ?? "" },
          { key: "plan", label: "Plan", value: (r) => r.app?.plan_name ?? "—" },
          { key: "status", label: "Application", value: (r) => r.app?.status ?? "", render: (r) => r.app ? <StatusBadge status={r.app.status} label={statusLabel[r.app.status]} /> : "—" },
          { key: "acctstatus", label: "Account", value: (r) => r.status, render: (r) => <StatusBadge status={r.status} label={accountStatusLabel[r.status as AccountStatus] ?? r.status} /> },
          { key: "stage", label: "Stage", value: (r) => r.lifecycle_stage.replaceAll("_", " ") },
          { key: "created", label: "Joined", value: (r) => r.created_at, render: (r) => formatDate(r.created_at) },
        ]} />}
      {modal && <FormModal title={`Change status for ${modal.ids.length} account${modal.ids.length === 1 ? "" : "s"}`} description="Staff accounts and your own account are skipped." fields={fields} submitLabel="Save status" onClose={() => setModal(null)}
        onSubmit={async (v) => { if (v.reason!.length < 3) return "Add a short reason."; try { const r = await change({ data: { userIds: modal.ids, status: v.status as AccountStatus, reason: v.reason! } }); await qc.invalidateQueries({ queryKey: ["admin"] });
          popup({ type: "success", title: `${r.accounts} account${r.accounts === 1 ? "" : "s"} updated`, description: `${r.sessionsEnded} sessions ended, ${r.plansPaused} plans paused, ${r.plansCancelled} cancelled, ${r.plansResumed} resumed.${r.skipped ? ` ${r.skipped} staff or own accounts skipped.` : ""}`, primaryLabel: "Done", secondaryLabel: null });
          return null; } catch (e) { return friendlyError(e); } }} />}
      {inviting && <FormModal title="New client" submitLabel="Send invitation" description="The client gets an email to set their password. Add a plan from their account once it's created."
        fields={[{ name: "first_name", label: "First name", required: true }, { name: "last_name", label: "Last name", required: true }, { name: "email", label: "Email", type: "email", required: true },
          { name: "company", label: "Business name" }, { name: "phone", label: "Phone" }]}
        onClose={() => setInviting(false)}
        onSubmit={async (v) => { try { const r = await invite({ data: { email: v.email, first_name: v.first_name, last_name: v.last_name, ...(v.company ? { company: v.company } : {}), ...(v.phone ? { phone: v.phone } : {}) } });
          await qc.invalidateQueries({ queryKey: ["admin"] }); navigate({ to: "/admin/accounts/$id", params: { id: r.userId } }); return null; } catch (e) { return friendlyError(e); } }} />}
      {mail.el}
    </div>
  );
}
