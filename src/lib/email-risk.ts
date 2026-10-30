/** Pure parts of the email risk check, shared by the server check and tests. */
import { isBlockedDomain } from "@/lib/disposable-domains";

export type EmailVerdict = "ok" | "review" | "block";
export type EmailRisk = { verdict: EmailVerdict; reasons: string[]; suggestion?: string; domainAgeDays?: number | null };

/** Domains younger than this are allowed but flagged for review. */
export const NEW_DOMAIN_REVIEW_DAYS = 30;

const providers = ["gmail.com", "googlemail.com", "outlook.com", "hotmail.com", "live.com", "yahoo.com", "icloud.com", "me.com", "aol.com", "proton.me", "protonmail.com", "gmx.com", "zoho.com"];
const roles = new Set(["admin", "administrator", "info", "contact", "support", "sales", "noreply", "no-reply", "test", "testing", "abuse", "postmaster", "webmaster", "root", "billing", "hello", "office"]);

export const emailSyntaxOk = (email: string) => /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]{1,64}@(?=.{4,253}$)(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)+[A-Za-z]{2,63}$/.test(email) && !email.includes("..");

function distance(a: string, b: string) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)] as number[]);
  for (let j = 1; j <= b.length; j++) d[0]![j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i]![j] = Math.min(d[i - 1]![j]! + 1, d[i]![j - 1]! + 1, d[i - 1]![j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length]![b.length]!;
}

/** "jane@gmial.com" suggests "jane@gmail.com". */
export function typoSuggestion(email: string): string | undefined {
  const [local, domain] = email.toLowerCase().split("@");
  if (!local || !domain || providers.includes(domain)) return undefined;
  const hit = providers.find((p) => { const d = distance(domain, p); return d > 0 && (d <= 1 || (d <= 2 && p.length >= 9)) && Math.abs(domain.length - p.length) <= 2; });
  return hit ? `${local}@${hit}` : undefined;
}

/** Signals that don't need the network. */
export function localSignals(email: string): EmailRisk {
  const e = email.trim().toLowerCase();
  if (!emailSyntaxOk(e)) return { verdict: "block", reasons: ["This isn't a valid email address."] };
  const [local = "", domain = ""] = e.split("@");
  if (isBlockedDomain(e)) return { verdict: "block", reasons: ["Disposable or temporary email addresses can't be used."] };
  const reasons: string[] = [];
  let verdict: EmailVerdict = "ok";
  const suggestion = typoSuggestion(e);
  if (suggestion) { verdict = "review"; reasons.push(`The domain looks like a typo of ${suggestion.split("@")[1]}.`); }
  if (roles.has(local.split("+")[0]!)) { verdict = "review"; reasons.push("Shared or role address (like info@ or admin@)."); }
  if (/\d{6,}/.test(local) || (/^[a-z0-9]{16,}$/.test(local) && !/[aeiou]{1}.*[aeiou]/.test(local))) { verdict = "review"; reasons.push("The address looks randomly generated."); }
  if (/^(xn--)|\.(zip|mov|top|xyz|click|loan|work|gq|tk|ml|cf|ga)$/.test(domain)) { verdict = "review"; reasons.push("The domain uses a high-risk ending often used for spam."); }
  return { verdict, reasons, ...(suggestion ? { suggestion } : {}) };
}

/** Combines local signals with mail-server and domain-age facts from the server. */
export function combineRisk(local: EmailRisk, facts: { acceptsMail: boolean | null; ageDays: number | null; blockedInDb: boolean }): EmailRisk {
  if (local.verdict === "block") return local;
  if (facts.blockedInDb) return { verdict: "block", reasons: ["Email addresses from this domain can't be used."] };
  if (facts.acceptsMail === false) return { verdict: "block", reasons: ["This email domain can't receive email. Check the address for typos."], ...(local.suggestion ? { suggestion: local.suggestion } : {}) };
  const reasons = [...local.reasons];
  let verdict = local.verdict;
  // New businesses often have brand-new domains, so a young domain is flagged for review, never blocked.
  if (facts.ageDays !== null && facts.ageDays < NEW_DOMAIN_REVIEW_DAYS) { verdict = "review"; reasons.push(`The email domain was registered ${facts.ageDays} days ago.`); }
  return { verdict, reasons, ...(local.suggestion ? { suggestion: local.suggestion } : {}), domainAgeDays: facts.ageDays };
}
