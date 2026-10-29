import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { ArrowLeft } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { DataTable, StatusBadge } from "@/components/admin/data-table";
import { formatAccount, formatDate, money, statusLabel } from "@/lib/admin";

export const Route = createFileRoute("/admin/accounts/$id")({ component: AccountDetail });

const tabs = ["Personal information", "Applications", "Subscriptions", "Projects", "Invoices", "Transactions", "Support tickets"] as const;

function AccountDetail() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const [tab, setTab] = useState<(typeof tabs)[number]>(tabs[0]);
  const { data, isLoading, error } = useQuery({
    queryKey: ["admin", "account", id],
    queryFn: async () => {
      const q = <T,>(p: PromiseLike<{ data: T[] | null; error: unknown }>) => p.then((r) => { if (r.error) throw r.error; return r.data ?? []; });
      const [profile, applications, subscriptions, projects, invoices, transactions, tickets] = await Promise.all([
        supabase.from("profiles").select("*").eq("id", id).maybeSingle().then((r) => { if (r.error) throw r.error; return r.data; }),
        q(supabase.from("applications").select("*").eq("user_id", id).order("created_at", { ascending: false })),
        q(supabase.from("subscriptions").select("*").eq("user_id", id).order("created_at", { ascending: false })),
        q(supabase.from("projects").select("*").eq("user_id", id).order("created_at", { ascending: false })),
        q(supabase.from("invoices").select("*").eq("user_id", id).order("issued_at", { ascending: false })),
        q(supabase.from("transactions").select("*").eq("user_id", id).order("created_at", { ascending: false })),
        q(supabase.from("support_tickets").select("*").eq("user_id", id).order("created_at", { ascending: false })),
      ]);
      return { profile, applications, subscriptions, projects, invoices, transactions, tickets };
    },
  });
  if (error) return <p className="text-sm text-destructive">{(error as Error).message}</p>;
  if (isLoading || !data) return <p className="text-sm text-muted-foreground">Loading account…</p>;
  if (!data.profile) return <p className="text-sm text-muted-foreground">This account doesn't exist.</p>;
  const p = data.profile;
  const info: [string, string][] = [
    ["Account number", formatAccount(p.account_number)], ["First name", p.first_name ?? "—"], ["Last name", p.last_name ?? "—"],
    ["Business", p.company ?? "—"], ["Email", p.email ?? "—"], ["Mobile number", p.phone ?? "—"], ["Country", p.country ?? "—"], ["Joined", formatDate(p.created_at)],
  ];
  return (
    <div className="space-y-6">
      <Link to="/admin/accounts" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" />Accounts</Link>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0"><h1 className="truncate text-2xl font-extrabold sm:text-3xl">{p.first_name} {p.last_name}</h1><p className="mt-1 font-mono text-sm text-muted-foreground">{formatAccount(p.account_number)} · {p.company}</p></div>
      </div>
      <div className="overflow-x-auto border-b">
        <div className="flex min-w-max gap-1">
          {tabs.map((t) => <button key={t} type="button" onClick={() => setTab(t)} className={`border-b-2 px-3 py-2.5 text-sm ${tab === t ? "border-primary font-semibold" : "border-transparent text-muted-foreground hover:text-foreground"}`}>{t}</button>)}
        </div>
      </div>
      {tab === "Personal information" && <div className="grid gap-px overflow-hidden rounded-2xl border bg-border sm:grid-cols-2">
        {info.map(([k, v]) => <div key={k} className="bg-card p-4"><p className="text-xs text-muted-foreground">{k}</p><p className="mt-1 text-sm font-medium">{v}</p></div>)}
      </div>}
      {tab === "Applications" && <DataTable title="Applications" rows={data.applications} searchable={false} onRowClick={(r) => navigate({ to: "/admin/applications/$id", params: { id: r.id } })} columns={[
        { key: "plan", label: "Plan", value: (r) => r.plan_name },
        { key: "fee", label: "Fee", value: (r) => r.monthly_fee, render: (r) => `${money(r.monthly_fee)} / month` },
        { key: "hours", label: "Hours", value: (r) => r.monthly_hours, render: (r) => `${r.monthly_hours} h / month` },
        { key: "status", label: "Status", value: (r) => r.status, render: (r) => <StatusBadge status={r.status} label={statusLabel[r.status]} /> },
        { key: "date", label: "Submitted", value: (r) => r.created_at, render: (r) => formatDate(r.created_at) },
      ]} />}
      {tab === "Subscriptions" && <DataTable title="Subscriptions" rows={data.subscriptions} searchable={false} empty="No subscriptions." columns={[
        { key: "plan", label: "Plan", value: (r) => r.plan_name },
        { key: "fee", label: "Fee", value: (r) => r.monthly_fee, render: (r) => `${money(r.monthly_fee)} / month` },
        { key: "hours", label: "Hours used", value: (r) => r.hours_used, render: (r) => `${r.hours_used} of ${r.monthly_hours} h` },
        { key: "status", label: "Status", value: (r) => r.status, render: (r) => <StatusBadge status={r.status} /> },
        { key: "start", label: "Started", value: (r) => r.started_at ?? "", render: (r) => formatDate(r.started_at) },
      ]} />}
      {tab === "Projects" && <DataTable title="Projects" rows={data.projects} searchable={false} empty="No projects yet." columns={[
        { key: "name", label: "Project", value: (r) => r.name }, { key: "service", label: "Service", value: (r) => r.service },
        { key: "hours", label: "Hours", value: (r) => r.hours }, { key: "status", label: "Status", value: (r) => r.status, render: (r) => <StatusBadge status={r.status} /> },
        { key: "due", label: "Due", value: (r) => r.due_at ?? "—" },
      ]} />}
      {tab === "Invoices" && <DataTable title="Invoices" rows={data.invoices} searchable={false} empty="No invoices yet." columns={[
        { key: "no", label: "Invoice", value: (r) => r.number }, { key: "amount", label: "Amount", value: (r) => r.amount, render: (r) => money(r.amount) },
        { key: "status", label: "Status", value: (r) => r.status, render: (r) => <StatusBadge status={r.status} /> },
        { key: "issued", label: "Issued", value: (r) => r.issued_at }, { key: "due", label: "Due", value: (r) => r.due_at ?? "—" },
      ]} />}
      {tab === "Transactions" && <DataTable title="Transactions" rows={data.transactions} searchable={false} empty="No transactions yet." columns={[
        { key: "ref", label: "Reference", value: (r) => r.reference }, { key: "desc", label: "Description", value: (r) => r.description },
        { key: "amount", label: "Amount", value: (r) => r.amount, render: (r) => money(r.amount) }, { key: "method", label: "Method", value: (r) => r.method ?? "—" },
        { key: "status", label: "Status", value: (r) => r.status, render: (r) => <StatusBadge status={r.status} /> },
        { key: "date", label: "Date", value: (r) => r.created_at, render: (r) => formatDate(r.created_at) },
      ]} />}
      {tab === "Support tickets" && <DataTable title="Support tickets" rows={data.tickets} searchable={false} empty="No support tickets." columns={[
        { key: "subject", label: "Subject", value: (r) => r.subject }, { key: "priority", label: "Priority", value: (r) => r.priority },
        { key: "status", label: "Status", value: (r) => r.status, render: (r) => <StatusBadge status={r.status} /> },
        { key: "date", label: "Opened", value: (r) => r.created_at, render: (r) => formatDate(r.created_at) },
      ]} />}
    </div>
  );
}
