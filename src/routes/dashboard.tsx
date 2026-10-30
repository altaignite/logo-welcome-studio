import { createFileRoute, Link, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { BarChart3, ClipboardList, CreditCard, FileCheck2, FileText, FolderKanban, FolderOpen, Headphones, Home, KeyRound, ListChecks, Menu, Receipt, Repeat, LogOut, User, X } from "lucide-react";
import logo from "@/lib/logo";
import { supabase } from "@/integrations/supabase/client";
import { NotificationBell } from "@/components/notifications";
import { guardClient } from "@/lib/session-guard";
import { AppLoader } from "@/components/loading";

export const Route = createFileRoute("/dashboard")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Client dashboard | FP Marketing Accelerator" },
      { name: "description", content: "Your plans, projects, tasks, billing and support in one place." },
      { property: "og:title", content: "Client dashboard | FP Marketing Accelerator" },
      { property: "og:description", content: "Your plans, projects, tasks, billing and support in one place." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  beforeLoad: () => guardClient(),
  pendingComponent: () => <AppLoader label="Opening your dashboard" />,

  component: Layout,
});

export const portalNav = [
  { group: "General", items: [
    { section: "", label: "Overview", icon: Home },
    { section: "onboarding", label: "Onboarding brief", icon: ClipboardList },
    { section: "applications", label: "Applications", icon: FileText },
  ] },
  { group: "Work", items: [
    { section: "projects", label: "Projects", icon: FolderKanban },
    { section: "deliverables", label: "Deliverables", icon: FileCheck2 },
    { section: "tasks", label: "Tasks", icon: ListChecks },
    { section: "reports", label: "Reports", icon: BarChart3 },
    { section: "documents", label: "Documents", icon: FolderOpen },
    { section: "support", label: "Support", icon: Headphones },
  ] },
  { group: "Billing", items: [
    { section: "subscriptions", label: "Subscriptions", icon: Repeat },
    { section: "invoices", label: "Invoices", icon: Receipt },
    { section: "payments", label: "Payments", icon: CreditCard },
  ] },
  { group: "Account", items: [
    { section: "profile", label: "Profile", icon: User },
    { section: "security", label: "Security", icon: KeyRound },
  ] },
] as const;

/** Same shell as the admin: full-height sidebar with grouped links and sign-out, a slide-in drawer on mobile, header actions on the right. */
function Layout() {
  const { email, userId } = Route.useRouteContext();
  const path = useRouterState({ select: (s) => s.location.pathname });
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const signOut = async () => { await qc.cancelQueries(); qc.clear(); await supabase.auth.signOut(); navigate({ to: "/", replace: true }); };
  const initials = email.slice(0, 2).toUpperCase();
  const sidebar = (
    <div className="flex h-full flex-col">
      <div className="flex h-16 items-center gap-3 px-5">
        <img src={logo.url} alt="FP" className="h-8 w-auto" />
        <span className="h-5 w-px bg-border" />
        <span className="text-sm font-semibold">Client</span>
      </div>
      <div className="flex-1 overflow-y-auto pb-4">
        {portalNav.map(({ group, items }) => <div key={group}>
          <p className="px-5 pb-2 pt-4 text-xs text-muted-foreground">{group}</p>
          <nav className="space-y-0.5">
            {items.map(({ section, label, icon: Icon }) => {
              const to = section ? `/dashboard/${section}` : "/dashboard";
              const active = section ? path === to || path.startsWith(`${to}/`) : path === "/dashboard" || path === "/dashboard/";
              const cls = `flex items-center gap-3 border-r-2 px-5 py-2.5 text-sm ${active ? "border-primary bg-secondary font-semibold" : "border-transparent text-muted-foreground hover:bg-secondary/60 hover:text-foreground"}`;
              return section
                ? <Link key={section} to="/dashboard/$section" params={{ section }} onClick={() => setOpen(false)} className={cls}><Icon className="size-4" />{label}</Link>
                : <Link key="overview" to="/dashboard" onClick={() => setOpen(false)} className={cls}><Icon className="size-4" />{label}</Link>;
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
          <img src={logo.url} alt="FP" className="h-8 w-auto lg:hidden" />
          <div className="ml-auto flex min-w-0 items-center gap-3">
            <span className="hidden truncate text-sm text-muted-foreground sm:block">{email}</span>
            <NotificationBell userId={userId} />
            <span className="grid size-9 shrink-0 place-items-center rounded-full bg-secondary text-xs font-semibold">{initials}</span>
          </div>
        </header>
        <main className="min-w-0 flex-1 space-y-6 p-4 sm:p-6 lg:p-8"><Outlet /></main>
      </div>
    </div>
  );
}
