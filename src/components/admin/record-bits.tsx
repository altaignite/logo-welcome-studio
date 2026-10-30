import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { ArrowLeft, type LucideIcon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { StatusBadge } from "@/components/admin/data-table";
import { accountStatusLabel, auditLines, formatAccount, formatDate, formatDay, humanize, money, type AccountStatus } from "@/lib/admin";
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
export function AuditList({ rows, showTable }: { rows: Audit[]; showTable?: boolean }) {
  return (
    <ol className="divide-y">
      {rows.map((r) => (
        <li key={r.id} className="px-5 py-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="text-sm font-medium capitalize">{showTable ? `${humanize(r.table_name)} ${r.action}` : r.action}</p>
            <p className="text-xs text-muted-foreground">{r.actor_label}, {formatDate(r.created_at)}</p>
          </div>
          <ul className="mt-1 space-y-0.5 text-xs text-muted-foreground">{auditLines(r.action, r.changes).slice(0, 8).map((l, i) => <li key={i} className="break-words">{l}</li>)}</ul>
        </li>
      ))}
      {rows.length === 0 && <li className="px-5 py-6 text-sm text-muted-foreground">No changes recorded yet.</li>}
    </ol>
  );
}
