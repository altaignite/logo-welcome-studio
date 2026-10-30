import { createFileRoute, Link, Outlet, redirect, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { BarChart3, ClipboardList, CreditCard, FileCheck2, FileText, FolderKanban, FolderOpen, Headphones, Home, KeyRound, ListChecks, Menu, Receipt, Repeat, LogOut, User, X } from "lucide-react";
import logo from "@/assets/logo.png.asset.json";
import { supabase } from "@/integrations/supabase/client";
import { NotificationBell } from "@/components/notifications";
import { mfaNeeded } from "@/components/mfa";

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
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw redirect({ to: "/" });
    // Accounts with two-factor sign-in finish the code step on the login page first.
    if (await mfaNeeded()) throw redirect({ to: "/" });
    return { userId: data.user.id, email: data.user.email ?? "" };
  },
  component: Layout,
});

export const portalNav = [
  { section: "", label: "Overview", icon: Home },
  { section: "subscriptions", label: "Subscriptions", icon: Repeat },
  { section: "onboarding", label: "Onboarding brief", icon: ClipboardList },
  { section: "projects", label: "Projects", icon: FolderKanban },
  { section: "deliverables", label: "Deliverables", icon: FileCheck2 },
  { section: "tasks", label: "Tasks", icon: ListChecks },
  { section: "reports", label: "Reports", icon: BarChart3 },
  { section: "documents", label: "Documents", icon: FolderOpen },
  { section: "invoices", label: "Invoices", icon: Receipt },
  { section: "payments", label: "Payments", icon: CreditCard },
  { section: "applications", label: "Applications", icon: FileText },
  { section: "support", label: "Support", icon: Headphones },
  { section: "profile", label: "Profile", icon: User },
  { section: "security", label: "Security", icon: KeyRound },
] as const;

function Nav({ onPick }: { onPick?: () => void }) {
  const cls = "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-muted-foreground hover:bg-secondary hover:text-foreground";
  const act = { className: "bg-secondary font-semibold text-foreground" };
  return (
    <nav className="space-y-1 p-3">
      {portalNav.map(({ section, label, icon: Icon }) => section === ""
        ? <Link key="o" to="/dashboard" activeOptions={{ exact: true }} onClick={onPick} className={cls} activeProps={act}><Icon className="size-4" />{label}</Link>
        : <Link key={section} to="/dashboard/$section" params={{ section }} onClick={onPick} className={cls} activeProps={act}><Icon className="size-4" />{label}</Link>)}
    </nav>
  );
}

function Layout() {
  const { email, userId } = Route.useRouteContext();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const signOut = async () => { await qc.cancelQueries(); qc.clear(); await supabase.auth.signOut(); navigate({ to: "/", replace: true }); };
  return (
    <div className="min-h-dvh bg-secondary/50">
      <header className="sticky top-0 z-30 border-b bg-card">
        <div className="flex h-16 items-center gap-3 px-4 sm:px-6">
          <button type="button" onClick={() => setOpen(true)} aria-label="Open menu" className="rounded-lg p-2 hover:bg-secondary lg:hidden"><Menu className="size-5" /></button>
          <img src={logo.url} alt="FP" className="h-8 w-auto" />
          <span className="hidden h-5 w-px bg-border sm:block" />
          <span className="hidden text-sm font-semibold sm:block">Client dashboard</span>
          <span className="ml-auto truncate text-sm text-muted-foreground">{email}</span>
          <NotificationBell userId={userId} />
          <button type="button" onClick={signOut} aria-label="Sign out" className="rounded-lg p-2 hover:bg-secondary"><LogOut className="size-4" /></button>
        </div>
      </header>
      <div className="flex">
        <aside className="sticky top-16 hidden h-[calc(100dvh-4rem)] w-60 shrink-0 overflow-y-auto border-r bg-card lg:block"><Nav /></aside>
        {open && (
          <div className="fixed inset-0 z-40 bg-foreground/40 lg:hidden" onClick={() => setOpen(false)}>
            <div className="absolute inset-x-0 bottom-0 max-h-[85dvh] overflow-y-auto rounded-t-3xl bg-card pb-6" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between px-5 pt-4"><span className="font-semibold">Menu</span><button type="button" aria-label="Close menu" onClick={() => setOpen(false)} className="rounded-lg p-2 hover:bg-secondary"><X className="size-5" /></button></div>
              <Nav onPick={() => setOpen(false)} />
            </div>
          </div>
        )}
        <main className="min-w-0 flex-1 space-y-6 p-4 sm:p-6"><Outlet /></main>
      </div>
    </div>
  );
}
