/** Transactional email through Resend's HTTP API (fetch-based, Worker compatible). Server only.
 * Set RESEND_API_KEY and EMAIL_FROM (for example "FP Marketing <hello@yourdomain.com>") once the sending domain is verified. */
export const emailConfigured = () => !!process.env["RESEND_API_KEY"] && !!process.env["EMAIL_FROM"];

export async function sendEmail(m: { to: string; subject: string; html: string; text: string; idempotencyKey: string }) {
  const key = process.env["RESEND_API_KEY"], from = process.env["EMAIL_FROM"];
  if (!key || !from) throw new Error("Email isn't configured.");
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", "Idempotency-Key": m.idempotencyKey },
    body: JSON.stringify({ from, to: [m.to], subject: m.subject, html: m.html, text: m.text }),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { message?: string } | null;
    console.error("Email send failed", res.status, body?.message);
    throw new Error("The email provider rejected the message.");
  }
}
