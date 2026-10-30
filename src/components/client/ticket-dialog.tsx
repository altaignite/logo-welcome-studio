import { useServerFn } from "@tanstack/react-start";
import { useRef, useState, type FormEvent } from "react";
import { Paperclip, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { acceptAttr, FILE_BUCKET, fileSize, uploadIssue } from "@/lib/files";
import { clientPriorities, contactPreferences, departments, type DepartmentId } from "@/lib/support";
import { createSupportTicket, finishFileUpload, startFileUpload } from "@/lib/portal.functions";

type Opt = { id: string; name: string };
const field = "mt-1 h-10 w-full rounded-lg border bg-background px-2.5 text-sm outline-none focus:ring-2 focus:ring-ring";

/** New support request: department, priority, related plan or project, how to reach the client, message and attachments. */
export function TicketDialog({ plans, projects, defaults, onClose, onCreated }: {
  plans: Opt[]; projects: Opt[]; defaults?: { subscriptionId?: string; department?: DepartmentId; subject?: string };
  onClose: () => void; onCreated: (ticketId: string) => void | Promise<void>;
}) {
  const create = useServerFn(createSupportTicket), start = useServerFn(startFileUpload), finish = useServerFn(finishFileUpload);
  const [v, setV] = useState({ department: defaults?.department ?? "account", priority: "normal", subject: defaults?.subject ?? "", message: "",
    subscriptionId: defaults?.subscriptionId ?? "", projectId: "", contactPreference: "dashboard", contactPhone: "" });
  const [files, setFiles] = useState<File[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const set = (k: keyof typeof v) => (e: { target: { value: string } }) => setV({ ...v, [k]: e.target.value });
  const dept = departments.find((d) => d.id === v.department)!;
  const addFiles = (list: FileList | null) => {
    const next = [...files];
    for (const f of Array.from(list ?? [])) { const issue = uploadIssue(f); if (issue) { setErr(`${f.name}: ${issue}`); continue; } if (next.length < 5) next.push(f); }
    setFiles(next); if (input.current) input.current.value = "";
  };
  const submit = async (e: FormEvent) => {
    e.preventDefault(); setErr(null); setBusy("Sending…");
    try {
      const r = await create({ data: {
        department: v.department as DepartmentId, priority: v.priority as "normal", subject: v.subject, message: v.message,
        contactPreference: v.contactPreference as "dashboard", ...(v.contactPhone ? { contactPhone: v.contactPhone } : {}),
        ...(v.subscriptionId ? { subscriptionId: v.subscriptionId } : {}), ...(v.projectId ? { projectId: v.projectId } : {}),
      } });
      for (const [i, f] of files.entries()) {
        setBusy(`Uploading ${i + 1} of ${files.length}…`);
        const t = await start({ data: { title: f.name, file: { name: f.name, size: f.size, type: f.type }, relatedTable: "support_tickets", relatedId: r.ticketId } });
        const up = await supabase.storage.from(FILE_BUCKET).uploadToSignedUrl(t.path, t.token, f, { contentType: f.type });
        if (!up.error) await finish({ data: { documentId: t.documentId } });
      }
      await onCreated(r.ticketId); onClose();
    } catch (e2) {
      // Zod messages arrive as JSON; show the first readable one.
      const msg = (e2 as Error).message;
      try { const parsed = JSON.parse(msg) as { message: string }[]; setErr(parsed[0]?.message ?? msg); } catch { setErr(msg); }
    }
    setBusy(null);
  };
  return (
    <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-foreground/40 p-4" role="dialog" aria-modal="true" aria-label="New support request">
      <form onSubmit={submit} className="app-modal max-h-[92dvh] overflow-y-auto text-left">
        <h2 className="text-lg font-bold">New support request</h2>
        <p className="mt-1 text-sm text-muted-foreground">Tell us what you need and we'll route it to the right team.</p>
        <div className="mt-4 space-y-3">
          <label className="block"><span className="text-[13px] font-medium">Department<span className="text-primary"> *</span></span>
            <select value={v.department} onChange={set("department")} className={field}>{departments.map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}</select>
            <span className="mt-1 block text-xs text-muted-foreground">{dept.help}</span></label>
          <label className="block"><span className="text-[13px] font-medium">Subject<span className="text-primary"> *</span></span>
            <input value={v.subject} onChange={set("subject")} maxLength={200} placeholder="A short summary" className={field} /></label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block"><span className="text-[13px] font-medium">Priority</span>
              <select value={v.priority} onChange={set("priority")} className={field}>{clientPriorities.map((p) => <option key={p.id} value={p.id}>{p.label}: {p.help}</option>)}</select></label>
            <label className="block"><span className="text-[13px] font-medium">Related plan</span>
              <select value={v.subscriptionId} onChange={set("subscriptionId")} className={field}><option value="">None</option>{plans.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
          </div>
          {projects.length > 0 && <label className="block"><span className="text-[13px] font-medium">Related project</span>
            <select value={v.projectId} onChange={set("projectId")} className={field}><option value="">None</option>{projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>}
          <label className="block"><span className="text-[13px] font-medium">Message<span className="text-primary"> *</span></span>
            <textarea value={v.message} onChange={set("message")} maxLength={5000} rows={5} placeholder="What happened, what you expected, and any links or steps to reproduce." className="mt-1 w-full rounded-lg border bg-background p-2.5 text-sm outline-none focus:ring-2 focus:ring-ring" /></label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block"><span className="text-[13px] font-medium">How should we reply?</span>
              <select value={v.contactPreference} onChange={set("contactPreference")} className={field}>{contactPreferences.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}</select></label>
            {v.contactPreference === "phone" && <label className="block"><span className="text-[13px] font-medium">Phone number<span className="text-primary"> *</span></span>
              <input value={v.contactPhone} onChange={set("contactPhone")} maxLength={40} inputMode="tel" placeholder="+1 555 123 4567" className={field} /></label>}
          </div>
          <div>
            <input ref={input} type="file" multiple accept={acceptAttr} className="hidden" onChange={(e) => addFiles(e.target.files)} />
            <button type="button" onClick={() => input.current?.click()} className="inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-sm font-medium hover:bg-secondary"><Paperclip className="size-4" />Attach files</button>
            <span className="ml-2 text-xs text-muted-foreground">Up to 5 files, 25 MB each. Never send passwords.</span>
            {files.length > 0 && <ul className="mt-2 space-y-1 text-sm">{files.map((f, i) => <li key={`${f.name}-${i}`} className="flex items-center justify-between gap-2 rounded-lg bg-secondary/60 px-2.5 py-1.5">
              <span className="truncate">{f.name} <span className="text-xs text-muted-foreground">{fileSize(f.size)}</span></span>
              <button type="button" aria-label={`Remove ${f.name}`} onClick={() => setFiles(files.filter((_, j) => j !== i))}><X className="size-4" /></button></li>)}</ul>}
          </div>
        </div>
        {err && <p className="mt-3 text-sm text-destructive">{err}</p>}
        <div className="mt-5 grid gap-2">
          <button type="submit" disabled={!!busy} className="signup-primary">{busy ?? "Send request"}</button>
          <button type="button" onClick={onClose} className="app-modal-secondary">Cancel</button>
        </div>
      </form>
    </div>
  );
}
