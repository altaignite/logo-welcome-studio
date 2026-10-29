import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { AlertTriangle, CheckCircle2, Info } from "lucide-react";

export type PopupType = "error" | "success" | "info";
export type PopupOptions = {
  type?: PopupType;
  title: string;
  description?: string;
  primaryLabel?: string;
  onPrimary?: () => void;
  secondaryLabel?: string | null;
  onSecondary?: () => void;
};

const PopupContext = createContext<(o: PopupOptions) => void>(() => {});
export const usePopup = () => useContext(PopupContext);

const icons = { error: AlertTriangle, success: CheckCircle2, info: Info };

export function PopupProvider({ children }: { children: ReactNode }) {
  const [popup, setPopup] = useState<PopupOptions | null>(null);
  const show = useCallback((o: PopupOptions) => setPopup(o), []);
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
        <div className="fixed inset-0 z-50 flex items-stretch justify-center bg-foreground/30 backdrop-blur-sm animate-in fade-in sm:items-center sm:p-6" onClick={close}>
          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="popup-title"
            onClick={(e) => e.stopPropagation()}
            className="flex w-full flex-col bg-background px-6 pb-8 pt-12 animate-in slide-in-from-bottom-6 sm:max-w-md sm:rounded-3xl sm:px-8 sm:pt-10 sm:shadow-2xl sm:zoom-in-95"
          >
            <div className="flex flex-1 flex-col items-center justify-center text-center sm:flex-none">
              <div className={`grid h-16 w-16 place-items-center rounded-full ${type === "success" ? "bg-primary/10 text-primary" : "bg-secondary text-foreground"}`}>
                <Icon className="h-7 w-7" strokeWidth={2.25} />
              </div>
              <h2 id="popup-title" className="mt-6 text-2xl font-extrabold leading-tight tracking-tight text-foreground sm:text-[1.6rem]">
                {popup.title}
              </h2>
              {popup.description && <p className="mt-2 text-base text-muted-foreground">{popup.description}</p>}
            </div>
            <div className="mt-10 space-y-3">
              <button
                autoFocus
                onClick={() => { popup.onPrimary?.(); close(); }}
                className="h-14 w-full rounded-full bg-foreground text-base font-semibold text-background transition hover:opacity-90"
              >
                {popup.primaryLabel ?? (type === "error" ? "Try again" : "Continue")}
              </button>
              {secondary && (
                <button
                  onClick={() => { popup.onSecondary?.(); close(); }}
                  className="h-14 w-full rounded-full bg-secondary text-base font-semibold text-foreground transition hover:bg-muted"
                >
                  {secondary}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </PopupContext.Provider>
  );
}
