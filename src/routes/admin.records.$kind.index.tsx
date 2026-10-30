import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ErrorState, TableSkeleton } from "@/components/loading";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { DataTable, StatusBadge, type BulkAction, type Column } from "@/components/admin/data-table";
import { FormModal, type FieldDef } from "@/components/admin/form-modal";
import { db, fmtText } from "@/components/admin/record-bits";
import { usePopup } from "@/components/popup";
import { createInvoice, createOrder, voidInvoices } from "@/lib/billing.functions";
import { Plus } from "lucide-react";
import { Btn } from "@/components/admin/record-bits";
import { canDelete } from "@/lib/admin";
import { plans } from "@/lib/signup";
import { toPatch } from "@/lib/records";
import { useStaff, withStaffPicker } from "@/components/admin/staff";
import { getRouteApi } from "@tanstack/react-router";
import { isRecordKind, recordKinds, type Row } from "@/lib/records";

export const Route = createFileRoute("/admin/records/$kind/")({ component: RecordList });
const adminRoute = getRouteApi("/admin");
/** Records that mirror Stripe and are only created by Stripe events. */
const stripeOnly = ["transactions"];

/** Every record of one type across all clients, with saved views. Rows open the generic details page. */
function RecordList() {
  const { kind } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const popup = usePopup();
  const fnVoid = useServerFn(voidInvoices), fnInvoice = useServerFn(createInvoice), fnOrder = useServerFn(createOrder);
  const { adminEmail, adminId } = adminRoute.useRouteContext();
  const staff = useStaff();
  const cfg = isRecordKind(kind) ? recordKinds[kind] : null;
  const [view, setView] = useState<string | null>(null);
  const [modal, setModal] = useState<{ title: string; fields: FieldDef[]; submitLabel: string; onSubmit: (v: Row) => Promise<string | null> } | null>(null);
  const { data, isLoading, error } = useQuery({
    enabled: !!cfg?.list,
    queryKey: ["admin", "list", kind],
    queryFn: async () => {
      const [r, p] = await Promise.all([
        db.from(kind).select("*").order(cfg!.list!.order, { ascending: false }).limit(2000),
        db.from("profiles").select("id, first_name, last_name, company, account_number"),
      ]);
      if (r.error) throw r.error;
      const names = new Map(((p.data ?? []) as Row[]).map((x) => [x.id, x.company || `${x.first_name ?? ""} ${x.last_name ?? ""}`.trim() || "—"]));
      const roles = ((await db.from("user_roles").select("user_id").eq("role", "admin")).data ?? []) as Row[];
      const staffIds = new Set(roles.map((x) => x.user_id));
      const clients = ((p.data ?? []) as Row[]).filter((x) => !staffIds.has(x.id)).map((x) => ({ id: x.id as string, label: `${names.get(x.id)} (${x.account_number})` }));
      return { rows: ((r.data ?? []) as Row[]).map((x) => ({ ...x, client: names.get(x.user_id) ?? "—" })), clients };
    },
  });
  if (!cfg?.list) return <p className="text-sm text-muted-foreground">There's no list for this record type.</p>;
  const views = cfg.list.views;
  const active = views.find((v) => v.id === (view ?? views[0]!.id)) ?? views[0]!;
  const today = new Date().toISOString().slice(0, 10);
  const all = data?.rows ?? [];
  const rows = all.filter((r) => active.match(r, today));
  const refresh = () => qc.invalidateQueries({ queryKey: ["admin"] });
  const fail = (m: string) => popup({ type: "error", title: "Couldn't update", description: m, primaryLabel: "Close", secondaryLabel: null });
  const columns: Column<Row>[] = [
    { key: "client", label: "Client", value: (r) => r.client },
    ...cfg.list.columns.map(([label, key, f]): Column<Row> => ({ key, label, value: (r) => fmtText(r[key], f), ...(f === "status" ? { render: (r: Row) => r[key] ? <StatusBadge status={String(r[key])} /> : "—" } : {}) })),
  ];
  const bulk: BulkAction<Row>[] = [];
  if (kind === "invoices") bulk.push({ label: "Void", danger: true, run: (sel) => setModal({ title: `Void ${sel.length} invoice${sel.length > 1 ? "s" : ""}`, submitLabel: "Void", fields: [{ name: "reason", label: "Reason", type: "textarea", required: true }],
    onSubmit: async (v) => { try { const r = await fnVoid({ data: { invoiceIds: sel.map((x) => x.id), reason: v.reason } }); await refresh(); return r.skipped ? `${r.voided} voided. ${r.skipped} paid or already void were skipped.` : null; } catch (e) { return (e as Error).message; } } }) });
  if (kind === "crm_activities") bulk.push({ label: "Mark follow-up done", run: async (sel) => { const r = await db.from("crm_activities").update({ follow_up_done_at: new Date().toISOString() }).in("id", sel.map((x) => x.id)); if (r.error) fail(r.error.message); await refresh(); } });
  if (cfg.archivable) bulk.push({ label: "Archive", run: async (sel) => { const r = await db.from(kind).update({ archived_at: new Date().toISOString() }).in("id", sel.map((x) => x.id)); if (r.error) fail(r.error.message); await refresh(); } });
  const clients = data?.clients ?? [];
  const extra = (k: string): Row => k === "crm_activities" ? { actor_id: adminId, actor_label: adminEmail } : ["tasks", "deliverables", "client_reports", "compliance_requests"].includes(k) ? { actor_label: adminEmail } : {};
  /** Step 2: the record's own form for the chosen client. */
  const createFor = async (clientId: string) => {
    if (kind === "invoices" || kind === "subscriptions") {
      const subs = ((await db.from("subscriptions").select("id, plan_name, status").eq("user_id", clientId).neq("status", "cancelled")).data ?? []) as Row[];
      if (kind === "invoices") {
        if (!subs.length) return popup({ type: "error", title: "No plan to invoice", description: "Create a subscription for this client first.", primaryLabel: "Close", secondaryLabel: null });
        return setModal({ title: "New invoice", submitLabel: "Issue invoice through Stripe", fields: [
          { name: "sub", label: "Subscription", type: "select", options: subs.map((x) => `${x.plan_name} (${x.status}) ${String(x.id).slice(0, 8)}`) },
          { name: "description", label: "Description", required: true }, { name: "amount", label: "Amount (USD)", type: "number", required: true }],
          onSubmit: async (v) => { const sub = subs.find((x) => v.sub.endsWith(String(x.id).slice(0, 8))); const amount = Number(v.amount); if (!sub || !(amount > 0)) return "Choose a plan and an amount above 0.";
            try { const r = await fnInvoice({ data: { subscriptionId: sub.id, description: v.description, amount } }); await refresh(); navigate({ to: "/admin/records/$kind/$id", params: { kind, id: r.invoiceId } }); return null; } catch (e) { return (e as Error).message; } } });
      }
      return setModal({ title: "New subscription", submitLabel: "Create and send first invoice", fields: [
        { name: "plan", label: "Plan", type: "select", options: plans.map((x) => x.name) }, { name: "notes", label: "Internal notes", type: "textarea" }],
        onSubmit: async (v) => { const plan = plans.find((x) => x.name === v.plan)!;
          try { const r = await fnOrder({ data: { userId: clientId, planId: plan.id, ...(v.notes ? { notes: v.notes } : {}) } }); await refresh(); navigate({ to: "/admin/records/$kind/$id", params: { kind, id: r.subscriptionId } }); return null; } catch (e) { return (e as Error).message; } } });
    }
    const fields = withStaffPicker(cfg.edit.map((f) => f.name === "assigned_to" ? { ...f, defaultValue: adminEmail } : f.name === "period_start" ? { ...f, defaultValue: `${today.slice(0, 7)}-01` } : f), staff.emails);
    setModal({ title: `New ${cfg.singular.toLowerCase()}`, submitLabel: "Create", fields,
      onSubmit: async (v) => {
        const r = await db.from(kind).insert({ user_id: clientId, ...toPatch(fields, v, cfg.codec), ...extra(kind) }).select("id").single();
        if (r.error) return r.error.message;
        await refresh(); navigate({ to: "/admin/records/$kind/$id", params: { kind, id: r.data.id } }); return null;
      } });
  };
  /** Step 1: pick the client. */
  const startNew = () => setModal({ title: `New ${cfg.singular.toLowerCase()}`, submitLabel: "Continue", fields: [{ name: "client", label: "Client", type: "select", options: clients.map((c) => c.label) }],
    onSubmit: async (v) => { const c = clients.find((x) => x.label === v.client); if (!c) return "Choose a client."; setTimeout(() => void createFor(c.id)); return null; } });
  if (canDelete(kind)) bulk.push({ label: "Delete", danger: true, run: (sel) => popup({ type: "error", title: `Delete ${sel.length} record${sel.length > 1 ? "s" : ""}?`, description: "This can't be undone. Deletions are kept in the audit log.", primaryLabel: "Delete", secondaryLabel: "Cancel",
    onPrimary: async () => { const r = await db.from(kind).delete().in("id", sel.map((x) => x.id)); if (r.error) fail(r.error.message); await refresh(); } }) });
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3"><div><h1 className="text-2xl font-extrabold sm:text-3xl">{cfg.plural}</h1><p className="mt-1 text-sm text-muted-foreground">{stripeOnly.includes(kind) ? "Recorded from Stripe. Select one to see its details or void it." : "Across every client. Select one to view, edit or archive it."}</p></div>
        {!stripeOnly.includes(kind) && <Btn icon={Plus} onClick={startNew}>New {cfg.singular.toLowerCase()}</Btn>}</div>
      <div className="flex flex-wrap gap-2">
        {views.map((v) => <button key={v.id} type="button" onClick={() => setView(v.id)} className={`rounded-full border px-4 py-1.5 text-sm ${active.id === v.id ? "border-foreground bg-foreground text-background" : "bg-card"}`}>
          {v.label} <span className="opacity-60">{all.filter((r) => v.match(r, today)).length}</span></button>)}
      </div>
      {error ? <ErrorState error={error} retry={() => location.reload()} /> : isLoading ? <TableSkeleton /> :
        <DataTable<Row> title={cfg.plural} rows={rows} getId={(r) => r.id} columns={columns} bulkActions={bulk} empty="Nothing in this view."
          onRowClick={(r) => navigate({ to: "/admin/records/$kind/$id", params: { kind, id: r.id } })} />}
      {modal && <FormModal {...modal} onClose={() => setModal(null)} />}
    </div>
  );
}
