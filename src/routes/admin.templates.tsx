import { createFileRoute, getRouteApi } from "@tanstack/react-router";
import { friendlyError } from "@/lib/errors";
import { ErrorState, TableSkeleton } from "@/components/loading";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Plus } from "lucide-react";
import { DataTable } from "@/components/admin/data-table";
import { FormModal, type FieldDef } from "@/components/admin/form-modal";
import { Btn, db } from "@/components/admin/record-bits";
import { usePopup } from "@/components/popup";
import { formatDate } from "@/lib/admin";
import type { Vals } from "@/lib/records";
import { placeholders, renderTemplate, unknownPlaceholders } from "@/lib/templates";

export const Route = createFileRoute("/admin/templates")({ component: Templates });
const adminRoute = getRouteApi("/admin");
type T = { id: string; name: string; subject: string; body: string; purpose: string; updated_by_label: string; updated_at: string };
const sample = { first_name: "Alex", last_name: "Morgan", company: "Morgan Bakery", account_number: "1234567890", plan: "Growth", staff_name: "Sam" };

function Templates() {
  const { adminEmail } = adminRoute.useRouteContext();
  const qc = useQueryClient();
  const popup = usePopup();
  const [modal, setModal] = useState<{ title: string; fields: FieldDef[]; onSubmit: (v: Vals) => Promise<string | null> } | null>(null);
  const { data = [], isLoading, error } = useQuery({ queryKey: ["admin", "templates"], queryFn: async () => { const r = await db.from("message_templates").select("*").order("name"); if (r.error) throw r.error; return (r.data ?? []) as T[]; } });
  const fields = (t?: T): FieldDef[] => [
    { name: "name", label: "Template name", required: true, max: 120, defaultValue: t?.name ?? "" },
    { name: "purpose", label: "Type", type: "select", options: ["service", "marketing"], defaultValue: t?.purpose ?? "service" },
    { name: "subject", label: "Subject", required: true, max: 200, defaultValue: t?.subject ?? "" },
    { name: "body", label: "Message", type: "textarea", required: true, max: 2000, defaultValue: t?.body ?? "Hi {{first_name}},\n\n" },
  ];
  const save = (t?: T) => setModal({
    title: t ? "Edit template" : "New template", fields: fields(t),
    onSubmit: async (v) => {
      const bad = unknownPlaceholders(`${v.subject} ${v.body}`);
      if (bad.length) return `Unknown placeholder: ${bad.map((b) => `{{${b}}}`).join(", ")}`;
      const row = { name: v.name, purpose: v.purpose, subject: v.subject, body: v.body, updated_by_label: adminEmail, updated_at: new Date().toISOString() };
      const r = t ? await db.from("message_templates").update(row).eq("id", t.id) : await db.from("message_templates").insert(row);
      if (r.error) return friendlyError(r.error);
      await qc.invalidateQueries({ queryKey: ["admin", "templates"] }); return null;
    },
  });
  const preview = (t: T) => popup({ type: "info", title: renderTemplate(t.subject, sample), description: renderTemplate(t.body, sample), primaryLabel: "Close", secondaryLabel: null });
  const remove = (rows: T[]) => popup({ type: "error", title: `Delete ${rows.length} template${rows.length > 1 ? "s" : ""}?`, description: "Messages already sent are not affected.", primaryLabel: "Delete", secondaryLabel: "Cancel",
    onPrimary: async () => { const r = await db.from("message_templates").delete().in("id", rows.map((x) => x.id)); if (r.error) popup({ type: "error", title: "Couldn't delete", description: friendlyError(r.error), primaryLabel: "Close", secondaryLabel: null }); await qc.invalidateQueries({ queryKey: ["admin", "templates"] }); } });
  return (
    <div className="space-y-6">
      <div><h1 className="text-2xl font-extrabold sm:text-3xl">Message templates</h1>
        <p className="mt-1 text-sm text-muted-foreground">Reusable emails for clients. Use {placeholders.map((p) => `{{${p}}}`).join(", ")}. Send them from an account or by selecting accounts in the list.</p></div>
      {error ? <ErrorState error={error} retry={() => location.reload()} /> : isLoading ? <TableSkeleton /> :
        <DataTable<T> title="Templates" rows={data} getId={(r) => r.id} onRowClick={save} empty="No templates yet." toolbar={<Btn icon={Plus} onClick={() => save()}>New template</Btn>}
          bulkActions={[{ label: "Delete", danger: true, run: remove }]}
          columns={[
            { key: "name", label: "Name", value: (r) => r.name }, { key: "subject", label: "Subject", value: (r) => r.subject }, { key: "purpose", label: "Type", value: (r) => r.purpose },
            { key: "by", label: "Updated by", value: (r) => r.updated_by_label }, { key: "at", label: "Updated", value: (r) => r.updated_at, render: (r) => formatDate(r.updated_at) },
            { key: "x", label: "Preview", value: () => "", render: (r) => <button type="button" onClick={(e) => { e.stopPropagation(); preview(r); }} className="h-8 rounded-full border px-3 text-xs font-semibold hover:bg-secondary">Preview</button> },
          ]} />}
      {modal && <FormModal title={modal.title} fields={modal.fields} submitLabel="Save" onClose={() => setModal(null)} onSubmit={modal.onSubmit} />}
    </div>
  );
}
