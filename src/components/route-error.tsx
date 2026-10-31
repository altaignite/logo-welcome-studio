import { useRouter, type ErrorComponentProps } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { errorReference, friendlyError, reportError } from "@/lib/errors";

/** Error page for any route: a readable message, a reference code, retry and home, and the details on request. Reported to Lovable. */
export function RouteError({ error, reset }: ErrorComponentProps) {
  const router = useRouter();
  const ref = useMemo(errorReference, [error]);
  const [details, setDetails] = useState(false);
  useEffect(() => { console.error(error); reportError(error, { boundary: "route_error", reference: ref }, "error", false); }, [error, ref]);
  return (
    <div className="grid min-h-[60dvh] place-items-center px-4 py-10">
      <div className="w-full max-w-md rounded-3xl border bg-card p-6 text-center shadow-sm">
        <span className="mx-auto grid size-12 place-items-center rounded-full bg-destructive/10 text-destructive"><AlertTriangle className="size-5" /></span>
        <h1 className="mt-4 text-xl font-bold">This page didn't load</h1>
        <p className="mt-2 text-sm text-muted-foreground">{friendlyError(error)}</p>
        <p className="mt-3 text-xs text-muted-foreground">The problem was reported automatically. Reference <span className="font-mono font-semibold">{ref}</span></p>
        <div className="mt-6 grid gap-2">
          <button type="button" onClick={() => { void router.invalidate(); reset(); }} className="signup-primary">Try again</button>
          <a href="/" className="app-modal-secondary inline-flex items-center justify-center">Go home</a>
        </div>
        {/* Technical details (message and stack) are for developers only: never shown on the live site. */}
        {import.meta.env.DEV && <button type="button" onClick={() => setDetails((d) => !d)} className="mt-4 text-xs text-muted-foreground underline">{details ? "Hide details" : "Show details"}</button>}
        {import.meta.env.DEV && details && <pre className="mt-2 max-h-48 overflow-auto rounded-lg bg-secondary p-3 text-left text-[11px]">{error instanceof Error ? `${error.message}\n${error.stack ?? ""}` : String(error)}</pre>}
      </div>
    </div>
  );
}
