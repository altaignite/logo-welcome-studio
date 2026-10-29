import { createFileRoute, Link, getRouteApi, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { approveOverage, billOverage, collectionAction, createInvoice, guaranteeRefund, sendFirstInvoice, subscriptionAction } from "@/lib/billing.functions";
import { stageLabel, unbilledOverage, type CollectionStage } from "@/lib/billing";
import { useState } from "react";
import { Archive, ArchiveRestore, Ban, Clock, CreditCard, MessageSquare, Pencil, Plus, RefreshCw, RotateCcw, Trash2 } from "lucide-react";
import { DataTable } from "@/components/admin/data-table";
import { FormModal, type FieldDef } from "@/components/admin/form-modal";
import { usePopup } from "@/components/popup";
import { AuditList, Btn, ClientBar, FieldGrid, FieldValue, Section, db, fmtText } from "@/components/admin/record-bits";
import { canDelete, guaranteeEligible, guaranteeEnd, money } from "@/lib/admin";
import { formDefaults, isRecordKind, recordKinds, toPatch, type Row, type Vals } from "@/lib/records";

export const Route = createFileRoute("/admin/records/$kind/$id")({ component: RecordPage });
const adminRoute = getRouteApi("/admin");
type Modal = { title: string; description?: string | undefined; fields: FieldDef[]; submitLabel: string; onSubmit: (v: Vals) => Promise<string | null> };
const rand = () => Math.floor(Math.random() * 1e6).toString().padStart(6, "0");
const today = () => new Date().toISOString().slice(0, 10);

function RecordPage() {
  const { kind, id } = Route.useParams();
  const { adminEmail, adminId } = adminRoute.useRouteContext();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const popup = usePopup();
  const [modal, setModal] = useState<Modal | null>(null);
  const cfg = isRecordKind(kind) ? recordKinds[kind] : null;
  const fnFirst = useServerFn(sendFirstInvoice), fnSub = useServerFn(subscriptionAction), fnOver = useServerFn(billOverage), fnColl = useServerFn(collectionAction), fnApprove = useServerFn(approveOverage), fnInvoice = useServerFn(createInvoice), fnRefund = useServerFn(guaranteeRefund);

  const { data, isLoading, error } = useQuery({
    enabled: !!cfg,
    queryKey: ["admin", "record", kind, id],
    queryFn: async () => {
      const r = await db.from(kind).select("*").eq("id", id).maybeSingle();
      if (r.error) throw r.error;
      const row = r.data as Row | null;
      if (!row || !cfg) return null;
      const [profile, audit, parents, children] = await Promise.all([
        db.from("profiles").select("id, first_name, last_name, company, account_number, status, email").eq("id", row.user_id).maybeSingle(),
        db.from("audit_log").select("*").eq("record_id", id).order("created_at", { ascending: false }).limit(200),
        Promise.all((cfg.parents ?? []).map(async (p) => row[p.fk] ? { ...p, row: (await db.from(p.kind).select("*").eq("id", row[p.fk]).maybeSingle()).data as Row | null } : { ...p, row: null })),
        Promise.all((cfg.children ?? []).map(async (c) => ({ ...c, rows: ((await db.from(c.kind).select("*").eq(c.fk, id).order("created_at", { ascending: false })).data ?? []) as Row[] }))),
      ]);
      return { row, profile: profile.data, audit: audit.data ?? [], parents, children };
    },
  });
  const refresh = () => qc.invalidateQueries({ queryKey: ["admin"] });
  const done = async (e: { message: string } | null) => { if (e) return e.message; await refresh(); return null; };

  if (!cfg) return <p className="text-sm text-muted-foreground">This record type doesn't exist.</p>;
  if (error) return <p className="text-sm text-destructive">{(error as Error).message}</p>;
  if (isLoading || data === undefined) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (!data) return <p className="text-sm text-muted-foreground">This {cfg.singular.toLowerCase()} doesn't exist.</p>;
  const { row, profile } = data;
  const actor = { actor_id: adminId, actor_label: adminEmail };
  const back = () => navigate({ to: "/admin/accounts/$id", params: { id: row.user_id } });

  const edit = () => setModal({
    title: `Edit ${cfg.singular.toLowerCase()}`, submitLabel: "Save changes", fields: formDefaults(cfg.edit, row),
    onSubmit: async (v) => {
      const patch = toPatch(cfg.edit, v);
      if (kind === "tasks") patch.completed_at = v.status === "completed" ? (row.completed_at ?? new Date().toISOString()) : null;
      if (kind === "support_tickets") { patch.closed_at = v.status === "closed" ? (row.closed_at ?? new Date().toISOString()) : null; patch.updated_at = new Date().toISOString(); }
      if (kind === "projects" && v.status === "completed" && !row.completed_at) patch.completed_at = new Date().toISOString();
      if (kind === "compliance_requests") patch.completed_at = v.status === "open" ? null : (row.completed_at ?? new Date().toISOString());
      if (kind === "subscriptions" && v.status === "cancelled" && !row.cancelled_at) patch.cancelled_at = new Date().toISOString();
      return done((await db.from(kind).update(patch).eq("id", id)).error);
    },
  });
  const remove = () => popup({
    type: "error", title: `Delete this ${cfg.singular.toLowerCase()}?`, description: "This can't be undone. The deletion is kept in the audit log.",
    primaryLabel: "Delete", secondaryLabel: "Cancel",
    onPrimary: async () => {
      const r = await db.from(kind).delete().eq("id", id);
      if (r.error) popup({ type: "error", title: "Couldn't delete", description: r.error.message, secondaryLabel: null, primaryLabel: "Close" });
      else { await refresh(); back(); }
    },
  });
  const voidIt = () => setModal({
    title: `Void ${cfg.singular.toLowerCase()}`, submitLabel: "Void", description: "Voided records stay on file for tax and legal purposes.",
    fields: [{ name: "reason", label: "Reason", type: "textarea", required: true }],
    onSubmit: async (v) => done((await db.from(kind).update({ status: "void", void_reason: v.reason }).eq("id", id)).error),
  });
  const archive = async () => { const r = await db.from(kind).update({ archived_at: row.archived_at ? null : new Date().toISOString() }).eq("id", id); if (r.error) popup({ type: "error", title: "Couldn't archive", description: r.error.message, secondaryLabel: null, primaryLabel: "Close" }); await refresh(); };

  const subProjects = data.children.find((c) => c.kind === "projects")?.rows ?? [];
  const logHours = (projectId?: string) => setModal({
    title: "Log hours", submitLabel: "Log hours",
    description: kind === "subscriptions" ? `${row.hours_used} of ${row.monthly_hours} hours used this period.` : undefined,
    fields: [
      ...(projectId ? [] : [{ name: "project", label: "Project", type: "select" as const, options: subProjects.map((p) => String(p.name)), required: true }]),
      { name: "hours", label: "Hours", type: "number", required: true, placeholder: "e.g. 1.5" },
      { name: "worked_on", label: "Date", type: "date", defaultValue: today() },
      { name: "description", label: "What was done", type: "textarea", required: true },
    ],
    onSubmit: async (v) => {
      const h = Number(v.hours); if (!(h > 0) || h > 24) return "Hours must be between 0 and 24.";
      const pid = projectId ?? subProjects.find((p) => p.name === v.project)?.id; if (!pid) return "Choose a project.";
      return done((await db.from("time_entries").insert({ project_id: pid, user_id: row.user_id, hours: h, description: v.description, worked_on: v.worked_on || today(), ...actor })).error);
    },
  });
  const newChild = (childKind: "projects" | "invoices" | "tasks") => {
    const fields: FieldDef[] = childKind === "projects" ? recordKinds.projects.edit : childKind === "tasks" ? recordKinds.tasks.edit
      : [{ name: "description", label: "Description", required: true, defaultValue: `${row.plan_name} service fee` }, { name: "amount", label: "Amount (USD)", type: "number", required: true, defaultValue: String(row.monthly_fee) }];
    setModal({
      title: `New ${recordKinds[childKind].singular.toLowerCase()}`, submitLabel: "Create", fields: fields.map((f) => f.name === "assigned_to" ? { ...f, defaultValue: adminEmail } : f),
      onSubmit: async (v) => {
        const base = { user_id: row.user_id, ...(kind === "projects" ? { project_id: id, subscription_id: row.subscription_id ?? null } : { subscription_id: id }) };
        const patch = toPatch(fields, v);
        if (childKind === "invoices") {
          if (!(Number(v.amount) > 0)) return "Enter an amount above 0.";
          try { await fnInvoice({ data: { subscriptionId: id, description: v.description, amount: Number(v.amount) } }); await refresh(); return null; } catch (e) { return (e as Error).message; }
        }
        if (childKind === "tasks") Object.assign(patch, { actor_label: adminEmail });
        const ins = childKind === "projects" ? { user_id: row.user_id, subscription_id: id, ...patch } : childKind === "invoices" ? { user_id: row.user_id, subscription_id: id, ...patch } : { ...base, ...patch };
        return done((await db.from(childKind).insert(ins).select("id").single()).error);
      },
    });
  };
  const refund = () => setModal({
    title: "Refund under the guarantee", submitLabel: "Refund through Stripe", description: "Only service fees are refunded. Advertising budgets are excluded. The refund goes back to the client's original payment method.",
    fields: [{ name: "amount", label: "Amount (USD)", type: "number", required: true }, { name: "reason", label: "Reason", type: "textarea", required: true }],
    onSubmit: async (v) => {
      const a = Number(v.amount); if (!(a > 0)) return "Enter an amount above 0.";
      try { await fnRefund({ data: { subscriptionId: id, amount: a, reason: v.reason } }); await refresh(); return null; } catch (e) { return (e as Error).message; }
    },
  });
  const reply = () => setModal({
    title: "Add to conversation", submitLabel: "Save", fields: [{ name: "body", label: "Message", type: "textarea", required: true }, { name: "internal", label: "Visibility", type: "select", options: ["internal", "visible_to_client"] }],
    onSubmit: async (v) => {
      const m = await db.from("ticket_messages").insert({ ticket_id: id, user_id: row.user_id, body: v.body, internal: v.internal !== "visible_to_client", ...actor });
      if (m.error) return m.error.message;
      return done((await db.from("support_tickets").update({ updated_at: new Date().toISOString(), ...(row.status === "open" ? { status: "in_progress" } : {}) }).eq("id", id)).error);
    },
  });

  const attempt = async (title: string, description: string, fn: () => Promise<unknown>) => {
    try { await fn(); await refresh(); popup({ type: "success", title, description, primaryLabel: "Done", secondaryLabel: null }); }
    catch (e) { popup({ type: "error", title: "Something went wrong", description: (e as Error).message, primaryLabel: "Close", secondaryLabel: null }); }
  };
  const subAct = (action: "pause" | "resume" | "cancel_now" | "cancel_end") => setModal({
    title: { pause: "Pause subscription", resume: "Resume subscription", cancel_now: "Cancel immediately", cancel_end: "Cancel at period end" }[action], submitLabel: "Confirm",
    description: action === "pause" && row.guarantee_status === "running" ? "Pausing within the first 90 days voids the money-back guarantee. Billing in Stripe stops while paused." : "This is applied in Stripe and saved in the audit log.",
    fields: [{ name: "reason", label: "Reason", type: "textarea", required: true }],
    onSubmit: async (v) => { try { await fnSub({ data: { subscriptionId: id, action, reason: v.reason } }); await refresh(); return null; } catch (e) { return (e as Error).message; } },
  });
  const overage = () => setModal({
    title: "Bill extra hours", submitLabel: "Bill", description: `${unbilledOverage(Number(row.hours_used), Number(row.monthly_hours), Number(row.overage_billed_hours ?? 0))} hours beyond the ${row.monthly_hours} hour allowance.`,
    fields: [{ name: "when", label: "When", type: "select", options: ["next_invoice", "now"] }],
    onSubmit: async (v) => { try { await fnOver({ data: { subscriptionId: id, when: v.when as "now" | "next_invoice" } }); await refresh(); return null; } catch (e) { return (e as Error).message; } },
  });
  const collections = () => setModal({
    title: "Debt recovery", submitLabel: "Apply", description: `Stage: ${stageLabel[(row.collection_stage as CollectionStage) ?? "none"]}. Interest ${money(Number(row.interest_accrued ?? 0))}, fees ${money(Number(row.fees_accrued ?? 0))}.`,
    fields: [
      { name: "action", label: "Action", type: "select", options: ["flag", "court", "issue_arrears", "pause_interest", "resume_interest", "settle", "write_off"] },
      { name: "note", label: "Note (saved in the audit log)", type: "textarea", required: true },
    ],
    onSubmit: async (v) => {
      try {
        let courtFees: { name: string; amount: number }[] | undefined;
        if (v.action === "court") courtFees = ((await db.from("billing_settings").select("court_fees").eq("id", 1).maybeSingle()).data?.court_fees ?? []) as { name: string; amount: number }[];
        await fnColl({ data: { invoiceId: id, action: v.action as "flag", note: v.note, ...(courtFees ? { courtFees } : {}) } }); await refresh(); return null;
      } catch (e) { return (e as Error).message; }
    },
  });
  const isVoid = row.status === "void";
  return (
    <div className="space-y-6">
      <ClientBar profile={profile} />
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{cfg.singular}</p>
          <h1 className="truncate text-2xl font-extrabold sm:text-3xl">{cfg.title(row)}</h1>
          {!!row.archived_at && <p className="mt-1 text-sm text-muted-foreground">Archived on {fmtText(row.archived_at, "date")}</p>}
        </div>
        <div className="flex flex-wrap gap-2">
          {kind === "subscriptions" && row.status === "pending" && <Btn icon={CreditCard} onClick={() => attempt("First invoice sent", "Stripe emailed the invoice. The subscription activates when it's paid.", () => fnFirst({ data: { subscriptionId: id } }))}>Send first invoice</Btn>}
          {kind === "subscriptions" && (row.status === "active" || row.status === "past_due") && <Btn icon={Ban} onClick={() => subAct("pause")}>Pause</Btn>}
          {kind === "subscriptions" && row.status === "paused" && <Btn icon={RefreshCw} onClick={() => subAct("resume")}>Resume</Btn>}
          {kind === "subscriptions" && !["cancelled", "pending"].includes(String(row.status)) && <Btn icon={Ban} danger onClick={() => subAct("cancel_end")}>Cancel at period end</Btn>}
          {kind === "subscriptions" && row.status !== "cancelled" && <Btn icon={Ban} danger onClick={() => subAct("cancel_now")}>Cancel now</Btn>}
          {kind === "subscriptions" && unbilledOverage(Number(row.hours_used), Number(row.monthly_hours), Number(row.overage_billed_hours ?? 0)) > 0 && <Btn icon={Clock} onClick={overage}>Bill extra hours</Btn>}
          {kind === "subscriptions" && subProjects.length > 0 && <Btn icon={Clock} onClick={() => logHours()}>Log hours</Btn>}
          {kind === "subscriptions" && guaranteeEligible({ guarantee_ends_at: (row.guarantee_ends_at as string) ?? null, sales_received: !!row.sales_received }) && row.guarantee_status === "running" && <Btn icon={RotateCcw} onClick={refund}>Guarantee refund</Btn>}
          {kind === "projects" && <Btn icon={Clock} onClick={() => logHours(id)}>Log hours</Btn>}
          {kind === "tasks" && !!row.over_allowance && !row.overage_approved && <Btn icon={Clock} onClick={() => attempt("Extra hours approved", "Time can now be logged beyond the plan allowance.", () => fnApprove({ data: { taskId: id } }))}>Approve extra hours</Btn>}
          {kind === "invoices" && !!row.hosted_url && <Btn icon={CreditCard} onClick={() => window.open(String(row.hosted_url), "_blank", "noopener")}>Open Stripe invoice</Btn>}
          {kind === "invoices" && (row.status === "open" || row.status === "overdue") && <Btn icon={Ban} onClick={collections}>Collections</Btn>}
          {kind === "support_tickets" && <Btn icon={MessageSquare} onClick={reply}>Add message</Btn>}
          {!isVoid && <Btn icon={Pencil} onClick={edit}>Edit</Btn>}
          {cfg.archivable && <Btn icon={row.archived_at ? ArchiveRestore : Archive} onClick={archive}>{row.archived_at ? "Restore" : "Archive"}</Btn>}
          {cfg.voidable && !isVoid && <Btn icon={Ban} danger onClick={voidIt}>Void</Btn>}
          {canDelete(kind) && <Btn icon={Trash2} danger onClick={remove}>Delete</Btn>}
        </div>
      </div>

      <Section title="Details"><FieldGrid items={cfg.fields.map(([label, key, f]) => [label, <FieldValue key={key} v={row[key]} f={f} />])} /></Section>

      {data.parents.some((p) => p.row) && <Section title="Linked to">
        <ul className="divide-y">
          {data.parents.filter((p) => p.row).map((p) => (
            <li key={p.fk} className="flex items-center justify-between gap-3 px-5 py-3 text-sm">
              <span className="text-muted-foreground">{p.label}</span>
              {p.kind === "applications"
                ? <Link to="/admin/applications/$id" params={{ id: p.row!.id }} className="font-medium underline-offset-2 hover:underline">{String(p.row!.plan_name)} application</Link>
                : <Link to="/admin/records/$kind/$id" params={{ kind: p.kind, id: p.row!.id }} className="font-medium underline-offset-2 hover:underline">{recordKinds[p.kind].title(p.row!)}</Link>}
            </li>
          ))}
        </ul>
      </Section>}

      {data.children.map((c) => {
        const childKind = c.kind;
        const openable = isRecordKind(childKind);
        const canCreate = (kind === "subscriptions" && (childKind === "projects" || childKind === "invoices" || childKind === "tasks")) || (kind === "projects" && childKind === "tasks");
        return (
          <DataTable<Row> key={c.label} title={c.label} rows={c.rows} empty={`No ${c.label.toLowerCase()} yet.`} searchable={false}
            getId={(r) => r.id}
            onRowClick={openable ? (r) => navigate({ to: "/admin/records/$kind/$id", params: { kind: childKind, id: r.id } }) : undefined}
            toolbar={canCreate ? <Btn icon={Plus} onClick={() => newChild(childKind as "projects" | "invoices" | "tasks")}>New</Btn> : undefined}
            columns={c.columns.map(([label, key, f]) => ({ key, label, value: (r: Row) => fmtText(r[key], f), render: (r: Row) => <FieldValue v={r[key]} f={f} /> }))} />
        );
      })}

      <Section title="Audit history"><AuditList rows={data.audit} /></Section>
      {modal && <FormModal {...modal} onClose={() => setModal(null)} />}
    </div>
  );
}
