/** Email risk check with network facts: mail servers (DNS over HTTPS) and domain age (RDAP), plus the staff block list. Server only. */
import { combineRisk, localSignals, type EmailRisk } from "@/lib/email-risk";

const withTimeout = async <T>(p: (s: AbortSignal) => Promise<T>, ms = 3500): Promise<T | null> => {
  const c = new AbortController(); const t = setTimeout(() => c.abort(), ms);
  try { return await p(c.signal); } catch { return null; } finally { clearTimeout(t); }
};

/** true: has MX (or A as a fallback); false: no mail servers or a null MX; null: couldn't tell (never blocks on lookup failure). */
async function acceptsMail(domain: string): Promise<boolean | null> {
  const q = (type: string) => withTimeout(async (signal) => {
    const r = await fetch(`https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(domain)}&type=${type}`, { headers: { accept: "application/dns-json" }, signal });
    return r.ok ? ((await r.json()) as { Status: number; Answer?: { type: number; data: string }[] }) : null;
  });
  const mx = await q("MX");
  if (!mx) return null;
  if (mx.Status === 3) return false; // NXDOMAIN: the domain doesn't exist
  const records = (mx.Answer ?? []).filter((a) => a.type === 15);
  if (records.length) return !records.every((a) => /^0\s+\.?$/.test(a.data.trim())); // "0 ." is a null MX: no mail accepted
  const a = await q("A");
  if (!a) return null;
  return (a.Answer ?? []).some((x) => x.type === 1);
}

/** Days since the domain was registered, from RDAP; null when unknown. */
async function domainAgeDays(domain: string): Promise<number | null> {
  const parts = domain.split(".");
  const registrable = parts.slice(-2).join(".");
  const data = await withTimeout(async (signal) => {
    const r = await fetch(`https://rdap.org/domain/${encodeURIComponent(registrable)}`, { headers: { accept: "application/rdap+json" }, signal, redirect: "follow" });
    return r.ok ? ((await r.json()) as { events?: { eventAction: string; eventDate: string }[] }) : null;
  }, 4000);
  const reg = data?.events?.find((e) => e.eventAction === "registration")?.eventDate;
  if (!reg) return null;
  return Math.max(0, Math.floor((Date.now() - new Date(reg).getTime()) / 864e5));
}

export async function emailRisk(email: string): Promise<EmailRisk> {
  const e = email.trim().toLowerCase();
  const local = localSignals(e);
  if (local.verdict === "block") return local;
  const domain = e.split("@")[1]!;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const [mail, age, blocked] = await Promise.all([
    acceptsMail(domain), domainAgeDays(domain),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabaseAdmin as any).rpc("email_domain_blocked", { _email: e }).then((r: { data: boolean | null }) => !!r.data, () => false),
  ]);
  return combineRisk(local, { acceptsMail: mail, ageDays: age, blockedInDb: blocked });
}
