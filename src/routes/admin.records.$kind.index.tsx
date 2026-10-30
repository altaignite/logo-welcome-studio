import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { DataTable, StatusBadge, type BulkAction, type Column } from "@/components/admin/data-table";
import { FormModal, type FieldDef } from "@/components/admin/form-modal";
import { db, fmtText } from "@/components/admin/record-bits";
import { usePopup } from "@/components/popup";
import { voidInvoices } from "@/lib/billing.functions";
import { isRecordKind, recordKinds, type Row } from "@/lib/records";

export const Route = createFileRoute("/admin/records/$kind/")({ component: RecordList });

/** Every record of one type across all clients, with saved views. Rows open the generic details page. */
function RecordList() {
  const { kind } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const popup = usePopup();
  const fnVoid = useServerFn(voidInvoices);
  const cfg = isRecordKind(kind) ? recordKinds[kind] : null;
  const [view, setView] = useState<string | null>(null);
  const [modal, setModal] = useState<{ title: string; fields: FieldDef[]; submitLabel: string; onSubmit: (v: Row) => Promise<string | null> } | null>(null);
  const { data, isLoading, error } = useQuery({
    enabled: !!cfg?.list,
    queryKey: ["admin", "list", kind],
    queryFn: async () => {
      const [r, p] = await Promise.all([
        db.from(kind).select("*").order(cfg!.list!.order, { ascending: false }).limit(2000),
        db.from("profiles").select("id, first_name, last_name, company"),
      ]);
      if (r.error) throw r.error;
      const names = new Map(((p.data ?? []) as Row[]).map((x) => [x.id, x.company || `${x.first_name ?? ""} ${x.last_name ?? ""}`.trim() || "—"]));
      return ((r.data ?? []) as Row[]).map((x) => ({ ...x, client: names.get(x.user_id) ?? "—" }));
    },
  });
  if (!cfg?.list) return <p className="text-sm text-muted-foreground">There's no list for this record type.</p>;
  const views = cfg.list.views;
  const active = views.find((v) => v.id === (view ?? views[0]!.id)) ?? views[0]!;
  const today = new Date().toISOString().slice(0, 10);
  const rows = (data ?? []).filter((r) => active.match(r, today));
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
  return (
    <div className="space-y-6">
      <div><h1 className="text-2xl font-extrabold sm:text-3xl">{cfg.plural}</h1><p className="mt-1 text-sm text-muted-foreground">Across every client. Select one to see its details.</p></div>
      <div className="flex flex-wrap gap-2">
        {views.map((v) => <button key={v.id} type="button" onClick={() => setView(v.id)} className={`rounded-full border px-4 py-1.5 text-sm ${active.id === v.id ? "border-foreground bg-foreground text-background" : "bg-card"}`}>
          {v.label} <span className="opacity-60">{(data ?? []).filter((r) => v.match(r, today)).length}</span></button>)}
      </div>
      {error ? <p className="text-sm text-destructive">{(error as Error).message}</p> : isLoading ? <p className="text-sm text-muted-foreground">Loading…</p> :
        <DataTable<Row> title={cfg.plural} rows={rows} getId={(r) => r.id} columns={columns} bulkActions={bulk} empty="Nothing in this view."
          onRowClick={(r) => navigate({ to: "/admin/records/$kind/$id", params: { kind, id: r.id } })} />}
      {modal && <FormModal {...modal} onClose={() => setModal(null)} />}
    </div>
  );
}
