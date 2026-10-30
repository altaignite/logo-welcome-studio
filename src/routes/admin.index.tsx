import { placeLabel } from "@/lib/security";
import { createFileRoute, getRouteApi, Link } from "@tanstack/react-router";
import { ErrorState, PageSkeleton } from "@/components/loading";
import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { db, Section } from "@/components/admin/record-bits";
import { StatusBadge } from "@/components/admin/data-table";
import { formatDay, money } from "@/lib/admin";
import { countSince, hoursUse, monthlyRecurring, receivables, renewingWithin, revenueByMonth } from "@/lib/insights";
import { slaState } from "@/lib/support";

export const Route = createFileRoute("/admin/")({ component: Overview });
const adminRoute = getRouteApi("/admin");
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type R = any;

function Overview() {
  const { adminEmail } = adminRoute.useRouteContext();
  const since = new Date(Date.now() - 200 * 864e5).toISOString();
  const { data, isLoading, error } = useQuery({
    queryKey: ["admin", "overview"],
    queryFn: async () => {
      const q = async (p: Promise<{ data: R[] | null; error: unknown }>) => { const r = await p; if (r.error) throw r.error; return r.data ?? []; };
      const [subs, invoices, txs, apps, tickets, tasks, follow, privacy, deliverables, profiles, roles] = await Promise.all([
        q(db.from("subscriptions").select("status, monthly_fee, monthly_hours, hours_used, renews_at, cancel_at_period_end, archived_at, guarantee_status")),
        q(db.from("invoices").select("status, amount, interest_accrued, fees_accrued, collection_stage, due_at, kind").in("status", ["open", "overdue"])),
        q(db.from("transactions").select("amount, status, created_at").gte("created_at", since)),
        q(db.from("applications").select("id, status, plan_name, created_at, assigned_to").in("status", ["submitted", "in_review", "info_requested", "escalated"]).is("archived_at", null)),
        q(db.from("support_tickets").select("id, subject, status, priority, created_at, first_response_at, last_client_message_at, last_staff_message_at, assigned_to").neq("status", "closed")),
        q(db.from("tasks").select("id, title, status, due_at, assigned_to").not("status", "in", "(completed,cancelled)")),
        q(db.from("crm_activities").select("id, subject, follow_up_at, actor_label").not("follow_up_at", "is", null).is("follow_up_done_at", null)),
        q(db.from("compliance_requests").select("id, kind, due_at").eq("status", "open")),
        q(db.from("deliverables").select("id, title, status, assigned_to").in("status", ["in_review", "changes_requested"])),
        q(db.from("profiles").select("id, created_at")),
        q(db.from("user_roles").select("user_id").eq("role", "admin")),
      ]);
      const signIns = await q(db.from("sign_in_events").select("id, user_id, city, region, country, ip, created_at").eq("new_location", true).is("reviewed_at", null).order("created_at", { ascending: false }).limit(20));
      const staff = new Set(roles.map((r: R) => r.user_id));
      return { signIns, subs, invoices, txs, apps, tickets, tasks, follow, privacy, deliverables, clients: profiles.filter((p: R) => !staff.has(p.id)) };
    },
  });
  if (error) return <ErrorState error={error} retry={() => location.reload()} />;
  if (isLoading || !data) return <PageSkeleton />;
  const today = new Date().toISOString().slice(0, 10);
  const rec = receivables(data.invoices);
  const hours = hoursUse(data.subs);
  const revenue = revenueByMonth(data.txs, 6);
  const breached = data.tickets.filter((t: R) => slaState(t) === "breached");
  const mine = (a: string | null) => a === adminEmail;
  const overdueTasks = data.tasks.filter((t: R) => t.due_at && t.due_at < today);
  const dueFollow = data.follow.filter((f: R) => f.follow_up_at <= today);
  const privacySoon = data.privacy.filter((p: R) => Date.parse(p.due_at) - Date.parse(today) <= 7 * 864e5);

  const tiles: [string, string, string | undefined, string | undefined][] = [
    ["Monthly recurring", money(monthlyRecurring(data.subs)), `${data.subs.filter((s: R) => s.status === "active").length} active plans`, "/admin/records/subscriptions"],
    ["Outstanding", money(rec.outstanding), `${money(rec.overdue)} overdue`, "/admin/records/invoices"],
    ["In collections", money(rec.collections), `${rec.collectionsCount} invoices`, "/admin/records/invoices"],
    ["Applications waiting", String(data.apps.length), `${data.apps.filter((a: R) => a.status === "info_requested").length} waiting on the client`, "/admin/applications"],
    ["Open tickets", String(data.tickets.length), `${breached.length} with an overdue reply`, "/admin/support"],
    ["Hours this period", `${hours.used} of ${hours.allowance} h`, hours.over ? `${hours.over} plans over allowance` : "within allowances", undefined],
    ["New clients, 30 days", String(countSince(data.clients, 30)), `${data.clients.length} in total`, "/admin/accounts"],
    ["Renewing in 7 days", String(renewingWithin(data.subs, 7).length), `${rec.firstUnpaid} first invoices unpaid`, "/admin/records/subscriptions"],
  ];
  const list = (title: string, rows: ReactNode[], empty: string, to?: string) => (
    <Section title={title} actions={to ? <Link to={to} className="text-sm font-medium text-muted-foreground hover:text-foreground">View all</Link> : undefined}>
      <ul className="divide-y text-sm">{rows.length ? rows.slice(0, 6) : <li className="px-5 py-6 text-muted-foreground">{empty}</li>}</ul>
    </Section>
  );
  const row = (key: string, to: { kind: string; id: string } | { app: string }, title: string, meta: ReactNode) => (
    <li key={key}>
      {"app" in to
        ? <Link to="/admin/applications/$id" params={{ id: to.app }} className="flex items-center justify-between gap-3 px-5 py-3 hover:bg-secondary/60"><span className="min-w-0 truncate">{title}</span><span className="shrink-0 text-xs text-muted-foreground">{meta}</span></Link>
        : <Link to="/admin/records/$kind/$id" params={to} className="flex items-center justify-between gap-3 px-5 py-3 hover:bg-secondary/60"><span className="min-w-0 truncate">{title}</span><span className="shrink-0 text-xs text-muted-foreground">{meta}</span></Link>}
    </li>
  );

  return (
    <div className="space-y-6">
      <div><h1 className="text-2xl font-extrabold sm:text-3xl">Overview</h1><p className="mt-1 text-sm text-muted-foreground">What needs attention across every client today.</p></div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {tiles.map(([label, value, sub, to]) => {
          const body = <><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 truncate text-xl font-bold sm:text-2xl">{value}</p>{sub && <p className="truncate text-xs text-muted-foreground">{sub}</p>}</>;
          return to ? <Link key={label} to={to} className="rounded-2xl border bg-card p-4 hover:bg-secondary/40">{body}</Link> : <div key={label} className="rounded-2xl border bg-card p-4">{body}</div>;
        })}
      </div>

      <Section title="Payments received, last 6 months">
        <div className="h-64 px-2 py-4 sm:px-4" aria-hidden>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={revenue} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} barCategoryGap="30%">
              <CartesianGrid vertical={false} stroke="var(--border)" />
              <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: "var(--muted-foreground)", fontSize: 12 }} />
              <YAxis tickLine={false} axisLine={false} width={56} tick={{ fill: "var(--muted-foreground)", fontSize: 12 }} tickFormatter={(v: number) => money(v)} />
              <Tooltip cursor={{ fill: "var(--secondary)" }} formatter={(v: number) => [money(v), "Received"]}
                contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12, color: "var(--foreground)", fontSize: 13 }} />
              <Bar dataKey="total" fill="var(--foreground)" radius={[4, 4, 0, 0]} maxBarSize={36} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <table className="sr-only"><caption>Payments received by month</caption><tbody>{revenue.map((m) => <tr key={m.month}><th>{m.month}</th><td>{money(m.total)}</td></tr>)}</tbody></table>
      </Section>

      <div className="space-y-6">
        {data.signIns.length > 0 && list("New sign-in locations", data.signIns.map((x: R) => <li key={x.id}><Link to="/admin/accounts/$id" params={{ id: x.user_id }} className="flex items-center justify-between gap-3 px-5 py-3 hover:bg-secondary/60"><span className="min-w-0 truncate">{placeLabel(x)}</span><span className="shrink-0 text-xs text-muted-foreground">{formatDay(x.created_at)}</span></Link></li>), "None to review.")}
        {list("Applications to review", data.apps.map((a: R) => row(a.id, { app: a.id }, `${a.plan_name} plan`, <StatusBadge status={a.status} />)), "No applications waiting.", "/admin/applications")}
        {list("Replies overdue", breached.map((t: R) => row(t.id, { kind: "support_tickets", id: t.id }, t.subject, `${t.priority}${mine(t.assigned_to) ? ", yours" : ""}`)), "Every ticket is answered on time.", "/admin/support")}
        {list("Follow-ups due", dueFollow.map((f: R) => row(f.id, { kind: "crm_activities", id: f.id }, f.subject, formatDay(f.follow_up_at))), "No follow-ups due.", "/admin/records/crm_activities")}
        {list("Overdue tasks", overdueTasks.map((t: R) => row(t.id, { kind: "tasks", id: t.id }, t.title, `Due ${formatDay(t.due_at)}${mine(t.assigned_to) ? ", yours" : ""}`)), "No overdue tasks.", "/admin/taskforce")}
        {list("Deliverables with clients", data.deliverables.map((d: R) => row(d.id, { kind: "deliverables", id: d.id }, d.title, <StatusBadge status={d.status} />)), "Nothing out for review.", "/admin/records/deliverables")}
        {list("Privacy deadlines", privacySoon.map((p: R) => row(p.id, { kind: "compliance_requests", id: p.id }, `${String(p.kind).replaceAll("_", " ")} request`, `Due ${formatDay(p.due_at)}`)), "No privacy requests due this week.", "/admin/records/compliance_requests")}
      </div>
    </div>
  );
}
