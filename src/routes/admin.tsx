import { createFileRoute, Link, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { BarChart3, ClipboardList, Contact, FileCheck2, FileText, FolderKanban, LayoutDashboard, LifeBuoy, ListChecks, LogOut, Mail, Menu, PhoneCall, Receipt, Repeat, Settings, ShieldAlert, ShieldCheck, UserCog, Users, Wallet, X } from "lucide-react";
import logo from "@/lib/logo";
import { supabase } from "@/integrations/supabase/client";
import { NotificationBell } from "@/components/notifications";
import { guardStaff } from "@/lib/session-guard";
import { AppLoader } from "@/components/loading";
import { GlobalSearch } from "@/components/admin/search";
import { useStaff } from "@/components/admin/staff";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { schemaStatus } from "@/lib/billing.functions";
import { levelLabel, type StaffLevel } from "@/lib/staff";

export const Route = createFileRoute("/admin")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "FP Admin Dashboard" },
      { name: "description", content: "Manage FP Marketing Accelerator accounts and applications." },
      { property: "og:title", content: "FP Admin Dashboard" },
      { property: "og:description", content: "Manage FP Marketing Accelerator accounts and applications." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  beforeLoad: () => guardStaff(),
  pendingComponent: () => <AppLoader label="Opening the admin" />,

  component: AdminLayout,
});

const nav = [
  { group: "General", items: [
    { to: "/admin", label: "Overview", icon: LayoutDashboard, exact: true },
    { to: "/admin/accounts", label: "Accounts", icon: Users },
    { to: "/admin/applications", label: "Applications", icon: FileText },
    { to: "/admin/records/contacts", kind: "contacts", label: "Contacts", icon: Contact },
  ] },
  { group: "Work", items: [
    { to: "/admin/taskforce", label: "Taskforce", icon: ListChecks },
    { to: "/admin/records/projects", kind: "projects", label: "Projects", icon: FolderKanban },
    { to: "/admin/records/deliverables", kind: "deliverables", label: "Deliverables", icon: FileCheck2 },
    { to: "/admin/records/client_reports", kind: "client_reports", label: "Reports", icon: BarChart3 },
    { to: "/admin/support", label: "Support", icon: LifeBuoy },
    { to: "/admin/records/crm_activities", kind: "crm_activities", label: "Follow-ups", icon: PhoneCall },
    { to: "/admin/records/compliance_requests", kind: "compliance_requests", label: "Privacy requests", icon: ShieldCheck },
  ] },
  { group: "Billing", items: [
    { to: "/admin/records/invoices", kind: "invoices", label: "Invoices", icon: Receipt },
    { to: "/admin/records/subscriptions", kind: "subscriptions", label: "Subscriptions", icon: Repeat },
    { to: "/admin/records/transactions", kind: "transactions", label: "Payments", icon: Wallet },
    { to: "/admin/records/account_change_requests", kind: "account_change_requests", label: "Change requests", icon: ClipboardList },
    { to: "/admin/settings", label: "Billing rules", icon: Settings },
  ] },
  { group: "Team", items: [
    { to: "/admin/templates", label: "Message templates", icon: Mail },
    { to: "/admin/staff", label: "Staff and security", icon: UserCog },
    { to: "/admin/security", label: "Security log", icon: ShieldAlert },
  ] },
] as const;

function AdminLayout() {
  const { adminEmail, adminId } = Route.useRouteContext();
  const staff = useStaff();
  const checkSchema = useServerFn(schemaStatus);
  const schema = useQuery({ queryKey: ["admin", "schema-status"], queryFn: () => checkSchema(), staleTime: 10 * 60_000, retry: false });
  const path = useRouterState({ select: (s) => s.location.pathname });
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const qc = useQueryClient();
  const signOut = async () => {
    await qc.cancelQueries(); qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/admin-login", replace: true });
  };
  const initials = adminEmail.slice(0, 2).toUpperCase();
  const sidebar = (
    <div className="flex h-full flex-col">
      <div className="flex h-16 items-center gap-3 px-5">
        <img src={logo.url} alt="FP" className="h-8 w-auto" />
        <span className="h-5 w-px bg-border" />
        <span className="text-sm font-semibold">Admin</span>
      </div>
      <div className="flex-1 overflow-y-auto pb-4">
        {nav.map(({ group, items }) => <div key={group}>
          <p className="px-5 pb-2 pt-4 text-xs text-muted-foreground">{group}</p>
          <nav className="space-y-0.5">
            {items.filter((item) => item.to !== "/admin/security" || staff.can("staff")).map((item) => {
              const { to, label, icon: Icon } = item;
              const active = "exact" in item ? path === to || path === `${to}/` : path === to || path.startsWith(`${to}/`);
              const cls = `flex items-center gap-3 border-r-2 px-5 py-2.5 text-sm ${active ? "border-primary bg-secondary font-semibold" : "border-transparent text-muted-foreground hover:bg-secondary/60 hover:text-foreground"}`;
              return "kind" in item
                ? <Link key={to} to="/admin/records/$kind" params={{ kind: item.kind }} onClick={() => setOpen(false)} className={cls}><Icon className="size-4" />{label}</Link>
                : <Link key={to} to={item.to} onClick={() => setOpen(false)} className={cls}><Icon className="size-4" />{label}</Link>;
            })}
          </nav>
        </div>)}
      </div>
      <div className="mt-auto border-t p-3">
        <button type="button" onClick={signOut} className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-sm text-muted-foreground hover:bg-secondary hover:text-foreground"><LogOut className="size-4" />Sign out</button>
      </div>
    </div>
  );
  return (
    <div className="flex min-h-dvh w-full bg-secondary/50">
      <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 border-r bg-card lg:block">{sidebar}</aside>
      {open && <div className="fixed inset-0 z-40 lg:hidden">
        <button type="button" aria-label="Close menu" className="absolute inset-0 bg-foreground/30" onClick={() => setOpen(false)} />
        <aside className="relative h-full w-64 bg-card shadow-xl">{sidebar}<button type="button" aria-label="Close menu" onClick={() => setOpen(false)} className="absolute right-3 top-4 rounded-lg p-1.5 hover:bg-secondary"><X className="size-5" /></button></aside>
      </div>}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b bg-card px-4 sm:px-6">
          <button type="button" aria-label="Open menu" onClick={() => setOpen(true)} className="rounded-lg p-2 hover:bg-secondary lg:hidden"><Menu className="size-5" /></button>
          <GlobalSearch />
          <div className="ml-auto flex min-w-0 items-center gap-3">
            <span className="hidden min-w-0 text-right sm:block"><span className="block truncate text-sm text-muted-foreground">{adminEmail}</span>{staff.me && <span className="block text-[11px] text-muted-foreground">{levelLabel[staff.me.level as StaffLevel] ?? staff.me.level}</span>}</span>
            <NotificationBell userId={adminId} />
            <span className="grid size-9 shrink-0 place-items-center rounded-full bg-secondary text-xs font-semibold">{initials}</span>
          </div>
        </header>
        <main className="min-w-0 flex-1 p-4 sm:p-6 lg:p-8">
          {!!schema.data?.missing.length && <p role="alert" className="mb-4 rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm">The database is missing updates: {schema.data.missing.join(", ")}. Open the project in Lovable and apply the pending database migrations; some features won't work until then.</p>}
          {staff.me && staff.requireMfa && !staff.me.mfa_enabled && <p className="mb-4 rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm">Two-factor authentication is required for staff. You can view the admin but not change anything until you <Link to="/admin/staff" className="font-semibold underline">set it up</Link>.</p>}
          {staff.me?.level === "viewer" && <p className="mb-4 rounded-xl border bg-card p-3 text-sm text-muted-foreground">You have view-only access. Ask an owner to set your staff level under Staff and security.</p>}
          <Outlet />
        </main>
      </div>
    </div>
  );
}
