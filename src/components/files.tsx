import { downloadAgreementPdf } from "@/lib/agreement-pdf";
import { useServerFn } from "@tanstack/react-start";
import { useRef, useState } from "react";
import { Download, FileText, Loader2, Upload } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { usePopup } from "@/components/popup";
import { acceptAttr, FILE_BUCKET, fileSize, uploadIssue } from "@/lib/files";
import { formatDate } from "@/lib/admin";
import { fileLink, finishFileUpload, startFileUpload } from "@/lib/portal.functions";

type Doc = { id: string; title: string; size_bytes: number | null; created_at: string; uploaded_by_label: string; kind: string; visible_to_client?: boolean; archived_at?: string | null };

/** Upload through a one-time signed URL; the server checks the file and the record it is attached to. */
export function UploadButton({ clientId, relatedTable, relatedId, kind, visibleToClient, onDone, label = "Upload file", className }: {
  clientId?: string; relatedTable?: string; relatedId?: string; kind?: "file" | "deliverable" | "report"; visibleToClient?: boolean; onDone: () => void | Promise<void>; label?: string; className?: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  const popup = usePopup();
  const start = useServerFn(startFileUpload), finish = useServerFn(finishFileUpload);
  const [busy, setBusy] = useState(false);
  const pick = async (file: File | undefined) => {
    if (!file) return;
    const issue = uploadIssue(file);
    if (issue) { popup({ type: "error", title: "Can't upload this file", description: issue, primaryLabel: "Close", secondaryLabel: null }); return; }
    setBusy(true);
    try {
      const t = await start({ data: { title: file.name, file: { name: file.name, size: file.size, type: file.type }, ...(clientId ? { clientId } : {}), ...(relatedTable ? { relatedTable } : {}),
        ...(relatedId ? { relatedId } : {}), ...(kind ? { kind } : {}), ...(visibleToClient === undefined ? {} : { visibleToClient }) } });
      const up = await supabase.storage.from(FILE_BUCKET).uploadToSignedUrl(t.path, t.token, file, { contentType: file.type });
      if (up.error) throw new Error("The upload failed. Please try again.");
      await finish({ data: { documentId: t.documentId } });
      await onDone();
    } catch (e) {
      popup({ type: "error", title: "Upload failed", description: (e as Error).message, primaryLabel: "Close", secondaryLabel: null });
    }
    setBusy(false);
    if (input.current) input.current.value = "";
  };
  return <>
    <input ref={input} type="file" accept={acceptAttr} className="hidden" onChange={(e) => pick(e.target.files?.[0])} />
    <button type="button" disabled={busy} onClick={() => input.current?.click()} className={className ?? "inline-flex h-9 items-center gap-1.5 rounded-lg border bg-card px-3 text-sm font-medium hover:bg-secondary disabled:opacity-50"}>
      {busy ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}{busy ? "Uploading…" : label}
    </button>
  </>;
}

export function useOpenFile() {
  const link = useServerFn(fileLink);
  const popup = usePopup();
  return async (id: string) => {
    try { const r = await link({ data: { documentId: id } }); window.location.assign(r.url); }
    catch (e) { popup({ type: "error", title: "Couldn't open the file", description: (e as Error).message, primaryLabel: "Close", secondaryLabel: null }); }
  };
}

export function DocumentList({ docs, empty = "No files yet.", staff }: { docs: Doc[]; empty?: string; staff?: boolean }) {
  const open = useOpenFile();
  return (
    <ul className="divide-y text-sm">
      {docs.map((d) => (
        <li key={d.id} className="flex items-center justify-between gap-3 px-5 py-3">
          <span className="flex min-w-0 items-center gap-3">
            <FileText className="size-4 shrink-0 text-muted-foreground" />
            <span className="min-w-0">
              <span className="block truncate font-medium">{d.title}</span>
              <span className="block text-xs text-muted-foreground">{fileSize(d.size_bytes)}, {d.uploaded_by_label}, {formatDate(d.created_at)}{staff && d.visible_to_client === false ? ", internal" : ""}{d.archived_at ? ", archived" : ""}</span>
            </span>
          </span>
          <button type="button" onClick={() => open(d.id)} aria-label={`Download ${d.title}`} className="inline-flex h-8 shrink-0 items-center gap-1 rounded-full border px-3 text-xs font-semibold hover:bg-secondary"><Download className="size-3.5" />Download</button>
        </li>
      ))}
      {docs.length === 0 && <li className="px-5 py-6 text-muted-foreground">{empty}</li>}
    </ul>
  );
}

type Agreement = { id: string; title: string; body: string; version: string; signed_at: string };
export function AgreementList({ agreements, empty = "No signed agreements." }: { agreements: Agreement[]; empty?: string }) {
  const [openId, setOpenId] = useState<string | null>(null);
  return (
    <ul className="divide-y text-sm">
      {agreements.map((a) => (
        <li key={a.id} className="px-5 py-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span><span className="block font-medium">{a.title}</span><span className="text-xs text-muted-foreground">Signed {formatDate(a.signed_at)}, version {a.version}</span></span>
            <span className="flex gap-1.5">
              <button type="button" onClick={() => setOpenId(openId === a.id ? null : a.id)} className="h-8 rounded-full border px-3 text-xs font-semibold hover:bg-secondary">{openId === a.id ? "Hide" : "Read"}</button>
              <button type="button" onClick={() => void downloadAgreementPdf(a)} className="inline-flex h-8 items-center gap-1 rounded-full border px-3 text-xs font-semibold hover:bg-secondary"><Download className="size-3.5" />Download</button>
            </span>
          </div>
          {openId === a.id && <pre className="mt-3 max-h-80 overflow-auto whitespace-pre-wrap rounded-lg bg-secondary/60 p-3 font-sans text-sm">{a.body}</pre>}
        </li>
      ))}
      {agreements.length === 0 && <li className="px-5 py-6 text-muted-foreground">{empty}</li>}
    </ul>
  );
}
