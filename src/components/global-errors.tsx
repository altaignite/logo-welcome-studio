import { useEffect } from "react";
import { usePopup } from "@/components/popup";
import { errorReference, friendlyError, reportError } from "@/lib/errors";

/** Errors nothing else caught (a failed promise in a click handler, a script error) become a popup and a Lovable report. */
export function GlobalErrorPopups() {
  const popup = usePopup();
  useEffect(() => {
    const show = (e: unknown, mechanism: string) => {
      const ref = errorReference();
      reportError(e, { mechanism, reference: ref });
      popup({ type: "error", title: "Something went wrong", description: `${friendlyError(e)} Reference ${ref}.`, primaryLabel: "Close", secondaryLabel: null });
    };
    const onRejection = (ev: PromiseRejectionEvent) => {
      // Navigation redirects and aborted requests aren't errors.
      const r = ev.reason as { isRedirect?: boolean; name?: string } | undefined;
      if (r?.isRedirect || r?.name === "AbortError") return;
      show(ev.reason, "unhandledrejection");
    };
    const onError = (ev: ErrorEvent) => { if (ev.error) show(ev.error, "onerror"); };
    window.addEventListener("unhandledrejection", onRejection);
    window.addEventListener("error", onError);
    return () => { window.removeEventListener("unhandledrejection", onRejection); window.removeEventListener("error", onError); };
  }, [popup]);
  return null;
}
