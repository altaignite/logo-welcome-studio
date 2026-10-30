/** Notification email rules shared by the outbox job and its tests. Notifications themselves are written by database triggers. */

export const EMAIL_MAX_ATTEMPTS = 5;
/** Pending emails older than this are dropped rather than sent late (the in-app notification stays). */
export const EMAIL_MAX_AGE_DAYS = 3;
export const EMAIL_BATCH = 50;

const escapes: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
export const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => escapes[c]!);

/** In-app paths only ("/dashboard/..."), never protocol-relative or absolute URLs. */
export const safeLink = (link: string | null | undefined) => (link && /^\/[A-Za-z0-9]/.test(link) ? link : null);

/** Addresses that must never be emailed, such as accounts anonymised after a closure request. */
export const undeliverable = (addr: string | null | undefined) => !addr || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(addr) || /\.invalid$/i.test(addr);

export type EmailDecision = "send" | "skip" | "wait";
/** What the outbox does with a pending notification right now. */
export function emailDecision(n: { email_to: string | null; email_attempts: number; created_at: string }, configured: boolean, now = new Date()): EmailDecision {
  if (undeliverable(n.email_to) || n.email_attempts >= EMAIL_MAX_ATTEMPTS) return "skip";
  if (now.getTime() - new Date(n.created_at).getTime() > EMAIL_MAX_AGE_DAYS * 864e5) return "skip";
  return configured ? "send" : "wait";
}

/** Plain text and HTML versions of a notification email. Everything from the database is escaped. */
export function renderEmail(n: { title: string; body: string | null; link: string | null }, origin: string, brand = "FP Marketing Accelerator") {
  const link = safeLink(n.link);
  const url = link ? `${origin.replace(/\/+$/, "")}${link}` : null;
  const text = [n.title, n.body ?? "", url ? `Open: ${url}` : "", `— ${brand}`].filter(Boolean).join("\n\n");
  const para = (s: string) => `<p style="margin:0 0 16px;line-height:1.5">${escapeHtml(s).replace(/\n/g, "<br>")}</p>`;
  const html = `<!doctype html><html><body style="margin:0;padding:24px;background:#f5f5f5;font-family:Arial,Helvetica,sans-serif;color:#111">`
    + `<div style="max-width:560px;margin:0 auto;background:#fff;border-radius:16px;padding:28px">`
    + `<h1 style="margin:0 0 16px;font-size:20px">${escapeHtml(n.title)}</h1>${n.body ? para(n.body) : ""}`
    + (url ? `<p style="margin:24px 0"><a href="${escapeHtml(url)}" style="background:#111;color:#fff;text-decoration:none;padding:12px 20px;border-radius:999px;display:inline-block">Open in your dashboard</a></p>` : "")
    + `<p style="margin:24px 0 0;font-size:12px;color:#777">${escapeHtml(brand)}. You can turn off email notifications in your profile.</p></div></body></html>`;
  return { subject: n.title.slice(0, 200), text, html };
}

/** Relative time for the notification list. */
export function timeAgo(iso: string, now = new Date()) {
  const s = Math.max(0, Math.round((now.getTime() - new Date(iso).getTime()) / 1000));
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  if (s < 86400 * 7) return `${Math.floor(s / 86400)} d ago`;
  return new Date(iso).toLocaleDateString("en-GB", { dateStyle: "medium" });
}
