/** Cloudflare Turnstile bot check. Configured with TURNSTILE_SITE_KEY and TURNSTILE_SECRET_KEY in Lovable's secrets; until both are
 * set it allows every request (so signups never break), and the Security log shows that it is off. Server only. */
export const turnstileSiteKey = () => process.env["TURNSTILE_SITE_KEY"] ?? null;
export const turnstileConfigured = () => !!process.env["TURNSTILE_SITE_KEY"] && !!process.env["TURNSTILE_SECRET_KEY"];

export async function verifyTurnstile(token: string | null | undefined, ip: string | null): Promise<{ ok: boolean; reason?: string }> {
  const secret = process.env["TURNSTILE_SECRET_KEY"];
  if (!secret || !turnstileSiteKey()) return { ok: true, reason: "not configured" };
  if (!token || token.length > 2048) return { ok: false, reason: "missing token" };
  try {
    const body = new URLSearchParams({ secret, response: token, ...(ip ? { remoteip: ip } : {}) });
    const r = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body });
    const data = (await r.json()) as { success?: boolean; "error-codes"?: string[] };
    return data.success ? { ok: true } : { ok: false, reason: (data["error-codes"] ?? ["failed"]).join(", ") };
  } catch {
    // Cloudflare unreachable: don't lock real people out; rate limits still apply.
    return { ok: true, reason: "verification unavailable" };
  }
}
