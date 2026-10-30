import { useState, type ReactNode } from "react";
import { Switch } from "@/components/ui/switch";
import { Spinner } from "@/components/loading";

export type FieldDef = {
  name: string; label: string; type?: "text" | "textarea" | "number" | "date" | "select" | "email" | "url"; options?: string[];
  required?: boolean; defaultValue?: string; max?: number; placeholder?: string;
};

/** Compact form dialog in the shared app-modal style. */
export function FormModal({ title, description, fields, submitLabel, onSubmit, onClose }: {
  title: string; description?: ReactNode | undefined; fields: FieldDef[]; submitLabel: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onSubmit: (v: any) => Promise<string | null>; onClose: () => void;
}) {
  const [values, setValues] = useState<Record<string, string>>(() => Object.fromEntries(fields.map((f) => [f.name, f.defaultValue ?? (f.type === "select" ? f.options?.[0] ?? "" : "")])));
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const missing = fields.find((f) => f.required && !values[f.name]?.trim());
    if (missing) { setErr(`${missing.label} is required.`); return; }
    setBusy(true); setErr(null);
    const res = await onSubmit(Object.fromEntries(Object.entries(values).map(([k, v]) => [k, v.trim()])));
    setBusy(false);
    if (res) setErr(res); else onClose();
  };
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-foreground/40 p-4" role="dialog" aria-modal="true" aria-label={title}>
      <form onSubmit={submit} className="app-modal text-left">
        <h2 className="text-lg font-bold">{title}</h2>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
        <div className="mt-4 space-y-3">
          {fields.map((f) => f.type === "select" && f.options?.join() === "no,yes" ? (
            <label key={f.name} className="flex cursor-pointer items-center justify-between gap-3 py-1">
              <span className="text-[13px] font-medium">{f.label}</span>
              <Switch checked={values[f.name] === "yes"} onCheckedChange={(v) => setValues({ ...values, [f.name]: v ? "yes" : "no" })} />
            </label>
          ) : (
            <label key={f.name} className="block">
              <span className="text-[13px] font-medium">{f.label}{f.required && <span className="text-primary"> *</span>}</span>
              {f.type === "textarea" ? (
                <textarea value={values[f.name]} maxLength={f.max ?? 4000} rows={3} placeholder={f.placeholder} onChange={(e) => setValues({ ...values, [f.name]: e.target.value })} className="mt-1 w-full rounded-lg border bg-background p-2.5 text-sm outline-none focus:ring-2 focus:ring-ring" />
              ) : f.type === "select" ? (
                <select value={values[f.name]} onChange={(e) => setValues({ ...values, [f.name]: e.target.value })} className="mt-1 h-10 w-full rounded-lg border bg-background px-2.5 text-sm outline-none focus:ring-2 focus:ring-ring">
                  {f.options?.map((o) => <option key={o} value={o}>{o.replaceAll("_", " ")}</option>)}
                </select>
              ) : (
                <input type={f.type ?? "text"} value={values[f.name]} maxLength={f.max ?? 300} placeholder={f.placeholder} step={f.type === "number" ? "any" : undefined} onChange={(e) => setValues({ ...values, [f.name]: e.target.value })} className="mt-1 h-10 w-full rounded-lg border bg-background px-2.5 text-sm outline-none focus:ring-2 focus:ring-ring" />
              )}
            </label>
          ))}
        </div>
        {err && <p className="mt-3 text-sm text-destructive">{err}</p>}
        <div className="mt-5 grid gap-2">
          <button type="submit" disabled={busy} aria-busy={busy} className="signup-primary inline-flex items-center justify-center gap-2">{busy && <Spinner />}{busy ? "Saving…" : submitLabel}</button>
          <button type="button" onClick={onClose} className="app-modal-secondary">Cancel</button>
        </div>
      </form>
    </div>
  );
}
