import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { AlertTriangle, CheckCircle2, Info, Loader2 } from "lucide-react";
import { friendlyError, reportError } from "@/lib/errors";

export type PopupType = "error" | "success" | "info";
export type PopupOptions = {
  type?: PopupType;
  title: string;
  description?: string | undefined;
  primaryLabel?: string;
  onPrimary?: () => void | Promise<unknown>;
  secondaryLabel?: string | null;
  onSecondary?: () => void;
};

const PopupContext = createContext<(o: PopupOptions) => void>(() => {});
export const usePopup = () => useContext(PopupContext);

const icons = { error: AlertTriangle, success: CheckCircle2, info: Info };

export function PopupProvider({ children }: { children: ReactNode }) {
  const [popup, setPopup] = useState<PopupOptions | null>(null);
  const [busy, setBusy] = useState(false);
  const show = useCallback((o: PopupOptions) => {
    if (o.type === "error") {
      reportError(new Error(`${o.title}${o.description ? `: ${o.description}` : ""}`), { source: "error_popup" }, "warning");
      setPopup({ ...o, description: o.description ? friendlyError(o.description) : o.description });
    } else setPopup(o);
  }, []);
  const close = () => setPopup(null);

  useEffect(() => {
    if (!popup) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [popup]);

  const type = popup?.type ?? "info";
  const Icon = icons[type];
  const secondary = popup?.secondaryLabel === undefined ? "Cancel" : popup.secondaryLabel;

  return (
    <PopupContext.Provider value={show}>
      {children}
      {popup && (
        <div className="fixed inset-0 z-50 bg-foreground/40 backdrop-blur-sm animate-in fade-in" onClick={close}>
          <div role="alertdialog" aria-modal="true" aria-labelledby="popup-title" onClick={(e) => e.stopPropagation()} className="app-modal text-center animate-in zoom-in-95 duration-200">
            <div className={`mx-auto grid size-12 place-items-center rounded-full ${type === "success" ? "bg-primary/10 text-primary" : "bg-secondary text-foreground"}`}><Icon className="size-5" strokeWidth={2.25} /></div>
            <h2 id="popup-title" className="mt-4 text-xl font-bold leading-snug text-balance text-foreground">{popup.title}</h2>
            {popup.description && <p className="mt-1.5 text-sm text-pretty text-muted-foreground">{popup.description}</p>}
            <div className="mt-6 space-y-2">
              <button autoFocus disabled={busy} aria-busy={busy} onClick={async () => {
                const current = popup;
                const r = current.onPrimary?.();
                // Async actions keep the popup open with a spinner; a follow-up popup they open replaces this one.
                if (r instanceof Promise) { setBusy(true); try { await r; } finally { setBusy(false); } setPopup((p) => (p === current ? null : p)); }
                else close();
              }} className="signup-primary inline-flex items-center justify-center gap-2 text-sm">{busy && <Loader2 className="size-4 animate-spin" />}{popup.primaryLabel ?? (type === "error" ? "Try again" : "Continue")}</button>
              {secondary && <button disabled={busy} onClick={() => { popup.onSecondary?.(); close(); }} className="app-modal-secondary">{secondary}</button>}
            </div>
          </div>
        </div>
      )}
    </PopupContext.Provider>
  );
}
