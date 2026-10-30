/** Cloudflare Turnstile bot check. Keys come from Lovable's secrets (TURNSTILE_SITE_KEY, TURNSTILE_SECRET_KEY) or, if those aren't
 * set, from app_secrets, where owners save them on the Security page (the secret never returns to the browser). Until both exist
 * it allows every request, so signups never break; the Security page shows that it is off. Server only. */
type Keys = { siteKey: string | null; secretKey: string | null };
/** The project's Turnstile widget (site keys are public). TURNSTILE_SITE_KEY overrides it. */
export const TURNSTILE_SITE_KEY = "0x4AAAAAAFsskqAgEnHzOGC5";
let cache: { at: number; keys: Keys } | null = null;

export async function turnstileKeys(): Promise<Keys> {
  const envSite = process.env["TURNSTILE_SITE_KEY"] ?? TURNSTILE_SITE_KEY, envSecret = process.env["TURNSTILE_SECRET_KEY"] ?? null;
  if (envSite && envSecret) return { siteKey: envSite, secretKey: envSecret };
  if (cache && Date.now() - cache.at < 60_000) return cache.keys;
  let keys: Keys = { siteKey: envSite, secretKey: envSecret };
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (supabaseAdmin as any).from("app_secrets").select("name, value").in("name", ["turnstile_site_key", "turnstile_secret_key"]);
    const get = (n: string) => (data ?? []).find((r: { name: string }) => r.name === n)?.value ?? null;
    keys = { siteKey: envSite ?? get("turnstile_site_key"), secretKey: envSecret ?? get("turnstile_secret_key") };
  } catch { /* fall back to whatever the environment has */ }
  cache = { at: Date.now(), keys };
  return keys;
}
export const clearTurnstileCache = () => { cache = null; };
export const turnstileConfigured = async () => { const k = await turnstileKeys(); return !!k.siteKey && !!k.secretKey; };

async function siteverify(secret: string, token: string, ip: string | null) {
  const body = new URLSearchParams({ secret, response: token, ...(ip ? { remoteip: ip } : {}) });
  const r = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body });
  return (await r.json()) as { success?: boolean; "error-codes"?: string[] };
}

/** True when Cloudflare accepts the secret (a dummy token then fails only as an invalid response, not an invalid secret). */
export async function secretKeyValid(secret: string) {
  const d = await siteverify(secret, "test-token-for-key-check", null);
  return !(d["error-codes"] ?? []).includes("invalid-input-secret");
}

export async function verifyTurnstile(token: string | null | undefined, ip: string | null): Promise<{ ok: boolean; reason?: string }> {
  const { siteKey, secretKey } = await turnstileKeys();
  if (!secretKey || !siteKey) return { ok: true, reason: "not configured" };
  if (!token || token.length > 2048) return { ok: false, reason: "missing token" };
  try {
    const data = await siteverify(secretKey, token, ip);
    return data.success ? { ok: true } : { ok: false, reason: (data["error-codes"] ?? ["failed"]).join(", ") };
  } catch {
    // Cloudflare unreachable: don't lock real people out; rate limits still apply.
    return { ok: true, reason: "verification unavailable" };
  }
}
