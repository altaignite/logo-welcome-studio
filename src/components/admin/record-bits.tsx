import { useState } from "react";
import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { ArrowLeft, type LucideIcon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { DataTable, StatusBadge, type Column } from "@/components/admin/data-table";
import { accountStatusLabel, auditLines, auditRows, formatAccount, formatDate, formatDay, humanize, money, type AccountStatus } from "@/lib/admin";
const sentence = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
import type { Fmt } from "@/lib/records";
import { metricsText } from "@/lib/work";

/** Loosely typed table access for the generic record pages; RLS still applies. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const db = supabase as unknown as { from: (table: string) => any };

export function fmtText(v: unknown, f: Fmt): string {
  if (v == null || v === "") return "—";
  if (f === "metrics") return metricsText(v) || "—";
  if (f === "money") return money(Number(v));
  if (f === "date") return formatDate(String(v));
  if (f === "day") return formatDay(String(v));
  if (f === "bool") return v ? "Yes" : "No";
  if (f === "hours") return `${Number(v)} h`;
  if (f === "status") return humanize(String(v));
  return String(v).replaceAll("_", " ");
}
export function FieldValue({ v, f }: { v: unknown; f: Fmt }) {
  if (f === "status" && v) return <StatusBadge status={String(v)} />;
  return <>{fmtText(v, f)}</>;
}

export function Btn({ onClick, icon: Icon, children, danger, disabled }: { onClick: () => void; icon?: LucideIcon; children: ReactNode; danger?: boolean; disabled?: boolean }) {
  return (
    <button type="button" disabled={disabled} onClick={onClick} className={`inline-flex h-9 items-center gap-1.5 rounded-lg border bg-card px-3 text-sm font-medium hover:bg-secondary disabled:opacity-50 ${danger ? "border-destructive/40 text-destructive" : ""}`}>
      {Icon && <Icon className="size-4" />}{children}
    </button>
  );
}

type Profile = { id: string; first_name: string | null; last_name: string | null; company: string | null; account_number: string; status: string; email: string | null };
/** Client strip shown on every record page, with a way back to the profile. */
export function ClientBar({ profile }: { profile: Profile | null }) {
  if (!profile) return null;
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border bg-card p-4">
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">Client</p>
        <p className="truncate font-semibold">{profile.first_name} {profile.last_name}</p>
        <div className="mt-0.5 flex flex-wrap gap-x-4 gap-y-0.5 text-sm text-muted-foreground">
          {profile.company && <span>{profile.company}</span>}
          <span className="font-mono">{formatAccount(profile.account_number)}</span>
          {profile.email && <span>{profile.email}</span>}
        </div>
      </div>
      <div className="flex items-center gap-3">
        <StatusBadge status={profile.status} label={accountStatusLabel[profile.status as AccountStatus] ?? profile.status} />
        <Link to="/admin/accounts/$id" params={{ id: profile.id }} className="inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-sm font-medium hover:bg-secondary"><ArrowLeft className="size-4" />Client profile</Link>
      </div>
    </div>
  );
}

export function Section({ title, actions, children }: { title: string; actions?: ReactNode; children: ReactNode }) {
  return (
    <section className="overflow-hidden rounded-2xl border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b px-5 py-3"><h2 className="font-semibold">{title}</h2>{actions && <div className="flex flex-wrap gap-2">{actions}</div>}</div>
      {children}
    </section>
  );
}

export function FieldGrid({ items }: { items: [string, ReactNode][] }) {
  return (
    <dl className="grid gap-px bg-border sm:grid-cols-2 lg:grid-cols-3">
      {items.map(([k, v]) => <div key={k} className="bg-card px-5 py-3"><dt className="text-xs text-muted-foreground">{k}</dt><dd className="mt-0.5 whitespace-pre-wrap break-words text-sm font-medium">{v}</dd></div>)}
    </dl>
  );
}

type Audit = { id: string; action: string; changes: unknown; actor_label: string; created_at: string; table_name: string };
/** Audit log as a table like every other admin list; a row opens the field-by-field changes. */
export function AuditList({ rows, showTable, title = "Audit log" }: { rows: Audit[]; showTable?: boolean; title?: string }) {
  const [open, setOpen] = useState<Audit | null>(null);
  const columns: Column<Audit>[] = [
    { key: "when", label: "When", value: (r) => formatDate(r.created_at) },
    ...(showTable ? [{ key: "record", label: "Record", value: (r: Audit) => sentence(humanize(r.table_name)) }] : []),
    { key: "action", label: "Action", value: (r) => sentence(humanize(r.action)) },
    { key: "changes", label: "Changes", value: (r) => auditLines(r.action, r.changes).join(" · "), render: (r) => <span className="line-clamp-2 max-w-md">{auditLines(r.action, r.changes).join(" · ")}</span> },
    { key: "by", label: "By", value: (r) => r.actor_label },
  ];
  const changes = open ? auditRows(open.action, open.changes) : [];
  const diff = changes.some((c) => c.from != null);
  return <>
    <DataTable<Audit> title={title} rows={rows} getId={(r) => r.id} columns={columns} onRowClick={setOpen} empty="No changes recorded yet." />
    {open && <div className="fixed inset-0 z-50 grid place-items-center bg-foreground/40 p-4" role="dialog" aria-modal="true" aria-label="Audit entry" onClick={() => setOpen(null)}>
      <div className="app-modal max-w-2xl text-left" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-bold">{sentence(`${humanize(open.table_name)}: ${humanize(open.action)}`)}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{open.actor_label}, {formatDate(open.created_at)}</p>
        {changes.length > 0 ? <div className="mt-4 max-h-[60vh] overflow-auto rounded-lg border">
          <table className="w-full text-left text-sm">
            <thead className="bg-secondary/60 text-xs text-muted-foreground"><tr><th className="px-3 py-2 font-medium">Field</th>{diff && <th className="px-3 py-2 font-medium">Before</th>}<th className="px-3 py-2 font-medium">{diff ? "After" : "Value"}</th></tr></thead>
            <tbody className="divide-y">{changes.map((c, i) => <tr key={i} className="align-top">
              <td className="px-3 py-2 font-medium">{c.field}</td>
              {diff && <td className="break-all px-3 py-2 text-muted-foreground">{c.from ?? "—"}</td>}
              <td className="break-all px-3 py-2">{c.to}</td>
            </tr>)}</tbody>
          </table>
        </div> : <p className="mt-4 text-sm text-muted-foreground">No field details were recorded.</p>}
        <button type="button" onClick={() => setOpen(null)} className="app-modal-secondary mt-5">Close</button>
      </div>
    </div>}
  </>;
}
