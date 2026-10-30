import { createFileRoute, Link, getRouteApi, useNavigate } from "@tanstack/react-router";
import { ErrorState, PageSkeleton } from "@/components/loading";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { approveOverage, billOverage, collectionAction, createInvoice, guaranteeRefund, sendFirstInvoice, subscriptionAction, voidInvoices } from "@/lib/billing.functions";
import { stageLabel, unbilledOverage, type CollectionStage } from "@/lib/billing";
import { useState } from "react";
import { reviewAccountChange } from "@/lib/changes.functions";
import { Archive, ArchiveRestore, Ban, Check, Clock, CreditCard, Download, Eye, EyeOff, MessageSquare, Pencil, Plus, RefreshCw, RotateCcw, Send, Trash2, Undo2, UserX } from "lucide-react";
import { DataTable } from "@/components/admin/data-table";
import { FormModal, type FieldDef } from "@/components/admin/form-modal";
import { usePopup } from "@/components/popup";
import { AuditList, Btn, ClientBar, FieldGrid, FieldValue, Section, db, fmtText } from "@/components/admin/record-bits";
import { canDelete, money } from "@/lib/admin";
import { guaranteeCheck } from "@/lib/billing";
import { DocumentList, UploadButton } from "@/components/files";
import { useStaff, withStaffPicker } from "@/components/admin/staff";
import { fulfilAccessRequest, fulfilDeletionRequest } from "@/lib/staff.functions";
import { formDefaults, isRecordKind, recordKinds, toPatch, type Row, type Vals } from "@/lib/records";

export const Route = createFileRoute("/admin/records/$kind/$id")({ component: RecordPage });
const adminRoute = getRouteApi("/admin");
type Modal = { title: string; description?: string | undefined; fields: FieldDef[]; submitLabel: string; onSubmit: (v: Vals) => Promise<string | null> };
const today = () => new Date().toISOString().slice(0, 10);

function RecordPage() {
  const { kind, id } = Route.useParams();
  const { adminEmail, adminId } = adminRoute.useRouteContext();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const popup = usePopup();
  const [modal, setModal] = useState<Modal | null>(null);
  const cfg = isRecordKind(kind) ? recordKinds[kind] : null;
  const staff = useStaff();
  const fnReview = useServerFn(reviewAccountChange);
  const fnAccess = useServerFn(fulfilAccessRequest), fnClose = useServerFn(fulfilDeletionRequest);
  const fnFirst = useServerFn(sendFirstInvoice), fnSub = useServerFn(subscriptionAction), fnOver = useServerFn(billOverage), fnColl = useServerFn(collectionAction), fnApprove = useServerFn(approveOverage), fnInvoice = useServerFn(createInvoice), fnRefund = useServerFn(guaranteeRefund), fnVoid = useServerFn(voidInvoices);

  const { data, isLoading, error } = useQuery({
    enabled: !!cfg,
    queryKey: ["admin", "record", kind, id],
    queryFn: async () => {
      const r = await db.from(kind).select("*").eq("id", id).maybeSingle();
      if (r.error) throw r.error;
      const row = r.data as Row | null;
      if (!row || !cfg) return null;
      const [profile, audit, parents, children, documents] = await Promise.all([
        db.from("profiles").select("id, first_name, last_name, company, account_number, status, email").eq("id", row.user_id).maybeSingle(),
        db.from("audit_log").select("*").eq("record_id", id).order("created_at", { ascending: false }).limit(200),
        Promise.all((cfg.parents ?? []).map(async (p) => row[p.fk] ? { ...p, row: (await db.from(p.kind).select("*").eq("id", row[p.fk]).maybeSingle()).data as Row | null } : { ...p, row: null })),
        Promise.all((cfg.children ?? []).map(async (c) => ({ ...c, rows: ((await db.from(c.kind).select("*").eq(c.fk, id).order("created_at", { ascending: false })).data ?? []) as Row[] }))),
        cfg.files ? db.from("documents").select("*").eq("related_table", kind).eq("related_id", id).eq("status", "ready").order("created_at", { ascending: false }).then((x: { data: Row[] | null }) => x.data ?? []) : Promise.resolve([]),
      ]);
      return { row, profile: profile.data, audit: audit.data ?? [], parents, children, documents: documents as Row[] };
    },
  });
  const refresh = () => qc.invalidateQueries({ queryKey: ["admin"] });
  const done = async (e: { message: string } | null) => { if (e) return e.message; await refresh(); return null; };

  if (!cfg) return <p className="text-sm text-muted-foreground">This record type doesn't exist.</p>;
  if (error) return <ErrorState error={error} retry={() => location.reload()} />;
  if (isLoading || data === undefined) return <PageSkeleton />;
  if (!data) return <p className="text-sm text-muted-foreground">This {cfg.singular.toLowerCase()} doesn't exist.</p>;
  const { row, profile } = data;
  const actor = { actor_id: adminId, actor_label: adminEmail };
  const back = () => navigate({ to: "/admin/accounts/$id", params: { id: row.user_id } });

  const edit = () => setModal({
    title: `Edit ${cfg.singular.toLowerCase()}`, submitLabel: "Save changes", fields: withStaffPicker(formDefaults(cfg.edit, row, cfg.codec), staff.emails),
    onSubmit: async (v) => {
      const patch = toPatch(cfg.edit, v, cfg.codec);
      if (kind === "tasks") patch.completed_at = v.status === "completed" ? (row.completed_at ?? new Date().toISOString()) : null;
      if (kind === "support_tickets") { patch.closed_at = v.status === "closed" ? (row.closed_at ?? new Date().toISOString()) : null; patch.updated_at = new Date().toISOString(); }
      if (kind === "projects" && v.status === "completed" && !row.completed_at) patch.completed_at = new Date().toISOString();
      if (kind === "compliance_requests") patch.completed_at = v.status === "open" ? null : (row.completed_at ?? new Date().toISOString());
      if (kind === "deliverables" || kind === "client_reports") patch.updated_at = new Date().toISOString();
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
    onSubmit: async (v) => {
      if (kind === "invoices") { try { await fnVoid({ data: { invoiceIds: [id], reason: v.reason } }); await refresh(); return null; } catch (e) { return (e as Error).message; } }
      return done((await db.from(kind).update({ status: "void", void_reason: v.reason }).eq("id", id)).error);
    },
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
  const newChild = (childKind: "projects" | "invoices" | "tasks" | "deliverables" | "client_reports") => {
    const fields: FieldDef[] = childKind === "invoices"
      ? [{ name: "description", label: "Description", required: true, defaultValue: `${row.plan_name} service fee` }, { name: "amount", label: "Amount (USD)", type: "number", required: true, defaultValue: String(row.monthly_fee) }]
      : recordKinds[childKind].edit;
    setModal({
      title: `New ${recordKinds[childKind].singular.toLowerCase()}`, submitLabel: "Create",
      fields: withStaffPicker(fields.map((f) => f.name === "assigned_to" ? { ...f, defaultValue: adminEmail } : f.name === "period_start" ? { ...f, defaultValue: `${today().slice(0, 7)}-01` } : f), staff.emails),
      onSubmit: async (v) => {
        const base = { user_id: row.user_id, ...(kind === "projects" ? { project_id: id, subscription_id: row.subscription_id ?? null } : { subscription_id: id }) };
        const patch = toPatch(fields, v, childKind === "client_reports" ? recordKinds.client_reports.codec : undefined);
        if (childKind === "invoices") {
          if (!(Number(v.amount) > 0)) return "Enter an amount above 0.";
          try { await fnInvoice({ data: { subscriptionId: id, description: v.description, amount: Number(v.amount) } }); await refresh(); return null; } catch (e) { return (e as Error).message; }
        }
        if (childKind === "tasks" || childKind === "deliverables" || childKind === "client_reports") Object.assign(patch, { actor_label: adminEmail });
        const ins = childKind === "projects" ? { user_id: row.user_id, subscription_id: id, ...patch } : { ...base, ...patch };
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
    title: "Add to conversation", submitLabel: "Save", fields: [{ name: "body", label: "Message", type: "textarea", required: true }, { name: "internal", label: "Visibility", type: "select", options: ["visible_to_client", "internal"] },
      { name: "then", label: "Then", type: "select", options: ["keep_status", "waiting_on_client", "closed"] }],
    onSubmit: async (v) => {
      const m = await db.from("ticket_messages").insert({ ticket_id: id, user_id: row.user_id, body: v.body, internal: v.internal !== "visible_to_client", ...actor });
      if (m.error) return m.error.message;
      const next = v.then === "keep_status" ? (row.status === "open" ? { status: "in_progress" } : {}) : { status: v.then, closed_at: v.then === "closed" ? new Date().toISOString() : null };
      return done((await db.from("support_tickets").update({ updated_at: new Date().toISOString(), ...next }).eq("id", id)).error);
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
  const setFields = async (patch: Row, title: string, description: string) => {
    const r = await db.from(kind).update({ ...patch, ...(kind === "deliverables" || kind === "client_reports" ? { updated_at: new Date().toISOString() } : {}) }).eq("id", id);
    if (r.error) popup({ type: "error", title: "Couldn't update", description: r.error.message, primaryLabel: "Close", secondaryLabel: null });
    else { await refresh(); popup({ type: "success", title, description, primaryLabel: "Done", secondaryLabel: null }); }
  };
  const fulfil = () => row.kind === "access"
    ? popup({ type: "info", title: "Send the client their data?", description: "This exports everything held about the client (without staff-only notes) to a file in their Documents and completes the request.", primaryLabel: "Export and complete", secondaryLabel: "Cancel",
      onPrimary: () => attempt("Request completed", "The export is in the client's Documents and they've been notified.", () => fnAccess({ data: { requestId: id } })) })
    : setModal({ title: "Close and anonymise this account", submitLabel: "Close account", description: "Blocks sign-in, removes personal details and the client's uploaded files, and keeps invoices, payments, agreements and the audit log as the law requires. Cancel every plan and settle or void unpaid invoices first. This can't be undone.",
      fields: [{ name: "note", label: "Note to the client", type: "textarea", required: true, defaultValue: "Your account has been closed and your personal details removed. We keep billing records for as long as the law requires." }],
      onSubmit: async (v) => { try { await fnClose({ data: { requestId: id, note: v.note } }); await refresh(); return null; } catch (e) { return (e as Error).message; } } });
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
          {kind === "subscriptions" && row.status === "pending" && !(data.children.find((c) => c.kind === "invoices")?.rows ?? []).some((i) => i.kind === "first" && i.status !== "void") && <Btn icon={CreditCard} onClick={() => attempt("First invoice sent", "Stripe emailed the invoice. The subscription activates when it's paid.", () => fnFirst({ data: { subscriptionId: id } }))}>Send first invoice</Btn>}
          {kind === "subscriptions" && (row.status === "active" || row.status === "past_due") && <Btn icon={Ban} onClick={() => subAct("pause")}>Pause</Btn>}
          {kind === "subscriptions" && row.status === "paused" && <Btn icon={RefreshCw} onClick={() => subAct("resume")}>Resume</Btn>}
          {kind === "subscriptions" && !["cancelled", "pending"].includes(String(row.status)) && <Btn icon={Ban} danger onClick={() => subAct("cancel_end")}>Cancel at period end</Btn>}
          {kind === "subscriptions" && row.status !== "cancelled" && <Btn icon={Ban} danger onClick={() => subAct("cancel_now")}>Cancel now</Btn>}
          {kind === "subscriptions" && unbilledOverage(Number(row.hours_used), Number(row.monthly_hours), Number(row.overage_billed_hours ?? 0)) > 0 && <Btn icon={Clock} onClick={overage}>Bill extra hours</Btn>}
          {kind === "subscriptions" && subProjects.length > 0 && <Btn icon={Clock} onClick={() => logHours()}>Log hours</Btn>}
          {kind === "subscriptions" && !row.sales_received && (row.guarantee_status === "claimed" || guaranteeCheck(row, data.children.find((c) => c.kind === "invoices")?.rows ?? []).eligible) && <Btn icon={RotateCcw} onClick={refund}>Guarantee refund</Btn>}
          {kind === "deliverables" && ["draft", "changes_requested"].includes(String(row.status)) && <Btn icon={Send} onClick={() => setFields({ status: "in_review" }, "Sent for review", "The client was notified and can approve or request changes.")}>Send for review</Btn>}
          {kind === "deliverables" && row.status === "in_review" && <Btn icon={Undo2} onClick={() => setFields({ status: "draft" }, "Withdrawn", "The client no longer sees this deliverable.")}>Withdraw</Btn>}
          {kind === "client_reports" && !row.published_at && <Btn icon={Eye} onClick={() => setFields({ published_at: new Date().toISOString() }, "Report published", "The client was notified and can see it in Reports.")}>Publish</Btn>}
          {kind === "client_reports" && !!row.published_at && <Btn icon={EyeOff} onClick={() => setFields({ published_at: null }, "Report unpublished", "The client no longer sees this report.")}>Unpublish</Btn>}
          {kind === "crm_activities" && !!row.follow_up_at && !row.follow_up_done_at && <Btn icon={Check} onClick={() => setFields({ follow_up_done_at: new Date().toISOString() }, "Follow-up done", "It no longer appears in follow-ups due.")}>Follow-up done</Btn>}
          {kind === "compliance_requests" && row.status === "open" && row.kind === "access" && <Btn icon={Download} onClick={fulfil}>Export data and complete</Btn>}
          {kind === "compliance_requests" && row.status === "open" && row.kind === "deletion" && <Btn icon={UserX} danger onClick={fulfil}>Close and anonymise account</Btn>}
          {kind === "projects" && <Btn icon={Clock} onClick={() => logHours(id)}>Log hours</Btn>}
          {kind === "tasks" && !!row.over_allowance && !row.overage_approved && <Btn icon={Clock} onClick={() => attempt("Extra hours approved", "Time can now be logged beyond the plan allowance.", () => fnApprove({ data: { taskId: id } }))}>Approve extra hours</Btn>}
          {kind === "invoices" && !!row.hosted_url && <Btn icon={CreditCard} onClick={() => window.open(String(row.hosted_url), "_blank", "noopener")}>Open Stripe invoice</Btn>}
          {kind === "invoices" && (row.status === "open" || row.status === "overdue") && <Btn icon={Ban} onClick={collections}>Collections</Btn>}
          {kind === "support_tickets" && <Btn icon={MessageSquare} onClick={reply}>Add message</Btn>}
          {!isVoid && !cfg.readonly && <Btn icon={Pencil} onClick={edit}>Edit</Btn>}
          {kind === "account_change_requests" && row.status === "actioned" && <Btn icon={Check} onClick={() => setModal({ title: "Mark as reviewed", submitLabel: "Mark reviewed", description: "The change was applied when the client signed. Add a note for the team if anything needs follow-up.", fields: [{ name: "note", label: "Review note", type: "textarea" }],
            onSubmit: async (v: Vals) => { try { await fnReview({ data: { id: row.id, ...(v.note ? { note: v.note } : {}) } }); await refresh(); return null; } catch (e) { return (e as Error).message; } } })}>Mark reviewed</Btn>}
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
        const canCreate = (kind === "subscriptions" && ["projects", "invoices", "tasks", "client_reports"].includes(childKind)) || (kind === "projects" && (childKind === "tasks" || childKind === "deliverables"));
        return (
          <DataTable<Row> key={c.label} title={c.label} rows={c.rows} empty={`No ${c.label.toLowerCase()} yet.`} searchable={false}
            getId={(r) => r.id}
            onRowClick={openable ? (r) => navigate({ to: "/admin/records/$kind/$id", params: { kind: childKind, id: r.id } }) : undefined}
            toolbar={canCreate ? <Btn icon={Plus} onClick={() => newChild(childKind as "projects" | "invoices" | "tasks" | "deliverables" | "client_reports")}>New</Btn> : undefined}
            columns={c.columns.map(([label, key, f]) => ({ key, label, value: (r: Row) => fmtText(r[key], f), render: (r: Row) => <FieldValue v={r[key]} f={f} /> }))} />
        );
      })}

      {cfg.files && <Section title="Files" actions={staff.can("work") ? <>
          <UploadButton clientId={row.user_id} relatedTable={kind} relatedId={id} kind={kind === "deliverables" ? "deliverable" : kind === "client_reports" ? "report" : "file"} onDone={refresh} label="Upload for client" />
          <UploadButton clientId={row.user_id} relatedTable={kind} relatedId={id} visibleToClient={false} onDone={refresh} label="Upload internal" />
        </> : undefined}>
        <DocumentList docs={data.documents} staff empty="No files attached." />
      </Section>}

      <AuditList rows={data.audit} title="Audit history" />
      {modal && <FormModal {...modal} onClose={() => setModal(null)} />}
    </div>
  );
}
