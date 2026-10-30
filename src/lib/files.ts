/** Upload rules for the private client-files bucket. Size and types mirror the bucket settings in migration 0011. */
export const FILE_BUCKET = "client-files";
export const MAX_FILE_BYTES = 25 * 1024 * 1024;
export const allowedMimeTypes = [
  "application/pdf", "image/png", "image/jpeg", "image/gif", "image/webp", "text/plain", "text/csv", "application/json", "application/zip",
  "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint", "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "video/mp4", "audio/mpeg",
] as const;
export const acceptAttr = ".pdf,.png,.jpg,.jpeg,.gif,.webp,.txt,.csv,.json,.zip,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.mp4,.mp3";

export function uploadIssue(f: { name: string; size: number; type: string }): string | null {
  if (!f.name.trim()) return "The file needs a name.";
  if (f.size <= 0) return "The file is empty.";
  if (f.size > MAX_FILE_BYTES) return "Files can be up to 25 MB.";
  if (!(allowedMimeTypes as readonly string[]).includes(f.type)) return "This file type isn't supported. Use PDF, images, Office documents, text, CSV, ZIP, MP4 or MP3.";
  return null;
}

/** Storage-safe file name: letters, digits, dot, dash and underscore, keeping the extension. */
export function safeFileName(name: string) {
  const base = name.normalize("NFKD").replace(/[^\w.-]+/g, "-").replace(/-+/g, "-").replace(/^[-.]+|[-.]+$/g, "");
  return (base || "file").slice(-120);
}

/** Objects always live under the client's own folder (the documents table checks this too). */
export const storagePath = (clientId: string, folder: "uploads" | "shared" | "exports", fileId: string, name: string) => `${clientId}/${folder}/${fileId}-${safeFileName(name)}`;

export const fileSize = (b: number | null | undefined) => (b == null ? "—" : b < 1024 ? `${b} B` : b < 1048576 ? `${Math.round(b / 1024)} KB` : `${(b / 1048576).toFixed(1)} MB`);
