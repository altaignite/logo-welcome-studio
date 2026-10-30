import { useIsFetching, useIsMutating } from "@tanstack/react-query";
import { useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AlertTriangle, Loader2, RefreshCw } from "lucide-react";
import { friendlyError, reportError } from "@/lib/errors";

export const Spinner = ({ className = "size-4" }: { className?: string }) => <Loader2 className={`${className} animate-spin`} aria-hidden />;

const Bar = ({ className }: { className: string }) => <div className={`animate-pulse rounded-md bg-secondary ${className}`} />;

/** Placeholder shaped like a page (title, stat tiles, a table) while data loads. */
export function PageSkeleton({ label = "Loading", tiles = 4, rows = 6 }: { label?: string; tiles?: number; rows?: number }) {
  return (
    <div role="status" aria-live="polite" aria-label={label} className="space-y-6">
      <div className="space-y-2"><Bar className="h-8 w-56" /><Bar className="h-4 w-80 max-w-full" /></div>
      {tiles > 0 && <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{Array.from({ length: tiles }, (_, i) => <div key={i} className="rounded-2xl border bg-card p-4"><Bar className="h-3 w-24" /><Bar className="mt-3 h-7 w-20" /></div>)}</div>}
      <TableSkeleton rows={rows} />
      <span className="sr-only">{label}…</span>
    </div>
  );
}

export function TableSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="overflow-hidden rounded-2xl border bg-card">
      <div className="border-b p-3"><Bar className="h-9 w-64 max-w-full" /></div>
      {Array.from({ length: rows }, (_, i) => <div key={i} className="flex gap-4 border-b px-4 py-3.5 last:border-b-0"><Bar className="h-4 w-1/4" /><Bar className="h-4 w-1/5" /><Bar className="h-4 w-1/6" /><Bar className="ml-auto h-4 w-16" /></div>)}
    </div>
  );
}

/** Small block placeholder inside a section. */
export const SectionSkeleton = ({ lines = 3 }: { lines?: number }) => (
  <div role="status" aria-label="Loading" className="space-y-2 p-5">{Array.from({ length: lines }, (_, i) => <Bar key={i} className={`h-4 ${i % 2 ? "w-2/3" : "w-full"}`} />)}</div>
);

/** Full-screen loader while a protected area checks the session. */
export function AppLoader({ label = "Loading" }: { label?: string }) {
  return (
    <div role="status" aria-live="polite" className="grid min-h-dvh place-items-center bg-secondary/50">
      <div className="flex flex-col items-center gap-3 text-sm text-muted-foreground"><Spinner className="size-7 text-primary" />{label}…</div>
    </div>
  );
}

/** Thin progress bar at the top of the window whenever a page or data is loading or something is saving. */
export function TopProgress() {
  const routing = useRouterState({ select: (s) => s.status === "pending" || s.isLoading });
  const busy = useIsFetching() + useIsMutating() > 0 || routing;
  const [show, setShow] = useState(false);
  useEffect(() => {
    // Avoid flashing for instant responses.
    if (!busy) { setShow(false); return; }
    const t = window.setTimeout(() => setShow(true), 120);
    return () => window.clearTimeout(t);
  }, [busy]);
  return (
    <div aria-hidden className={`pointer-events-none fixed inset-x-0 top-0 z-[60] h-0.5 overflow-hidden transition-opacity duration-300 ${show ? "opacity-100" : "opacity-0"}`}>
      <div className="h-full w-1/3 animate-[progress_1.1s_ease-in-out_infinite] rounded-full bg-primary" />
    </div>
  );
}

/** Inline error with a retry, reported to Lovable once. */
export function ErrorState({ error, retry, title = "This didn't load" }: { error: unknown; retry?: () => void; title?: string }) {
  useEffect(() => { reportError(error, { boundary: "error_state" }); }, [error]);
  return (
    <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-destructive/30 bg-destructive/5 p-4 text-sm">
      <span className="flex items-start gap-2"><AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" /><span><span className="block font-semibold">{title}</span>{friendlyError(error)}</span></span>
      {retry && <button type="button" onClick={retry} className="inline-flex h-9 items-center gap-1.5 rounded-lg border bg-card px-3 font-medium hover:bg-secondary"><RefreshCw className="size-4" />Try again</button>}
    </div>
  );
}
