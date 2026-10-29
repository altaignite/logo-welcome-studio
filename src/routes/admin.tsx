import { createFileRoute, Link, Outlet, redirect, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { FileText, LogOut, Menu, Users, X } from "lucide-react";
import logo from "@/assets/logo.png.asset.json";
import { supabase } from "@/integrations/supabase/client";

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
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw redirect({ to: "/admin-login" });
    const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: data.user.id, _role: "admin" });
    if (!isAdmin) throw redirect({ to: "/admin-login" });
    return { adminEmail: data.user.email ?? "", adminId: data.user.id };
  },
  component: AdminLayout,
});

const nav = [
  { to: "/admin/accounts", label: "Accounts", icon: Users },
  { to: "/admin/applications", label: "Applications", icon: FileText },
] as const;

function AdminLayout() {
  const { adminEmail } = Route.useRouteContext();
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
      <p className="px-5 pb-2 pt-4 text-xs text-muted-foreground">General</p>
      <nav className="space-y-0.5">
        {nav.map(({ to, label, icon: Icon }) => {
          const active = path.startsWith(to);
          return (
            <Link key={to} to={to} onClick={() => setOpen(false)} className={`flex items-center gap-3 border-r-2 px-5 py-2.5 text-sm ${active ? "border-primary bg-secondary font-semibold" : "border-transparent text-muted-foreground hover:bg-secondary/60 hover:text-foreground"}`}>
              <Icon className="size-4" />{label}
            </Link>
          );
        })}
      </nav>
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
          <div className="ml-auto flex min-w-0 items-center gap-3">
            <span className="hidden truncate text-sm text-muted-foreground sm:block">{adminEmail}</span>
            <span className="grid size-9 shrink-0 place-items-center rounded-full bg-secondary text-xs font-semibold">{initials}</span>
          </div>
        </header>
        <main className="min-w-0 flex-1 p-4 sm:p-6 lg:p-8"><Outlet /></main>
      </div>
    </div>
  );
}
