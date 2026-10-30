import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import logo from "@/lib/logo";

/** Compact centered card used by the password pages, matching the login style. */
export function AuthShell({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  return (
    <main className="grid min-h-dvh place-items-center bg-secondary p-4">
      <section className="w-full max-w-md rounded-3xl bg-card p-6 shadow-xl sm:p-10">
        <Link to="/" aria-label="Back to login"><img src={logo.url} alt="FP logo" className="mx-auto h-12 w-12 object-contain" /></Link>
        <h1 className="mt-5 text-center text-2xl font-extrabold tracking-tight">{title}</h1>
        <p className="mt-1 text-center text-sm text-muted-foreground">{subtitle}</p>
        <div className="mt-6">{children}</div>
      </section>
    </main>
  );
}
