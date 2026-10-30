/** One password policy for signup, password resets, password changes and staff invitations. Length matters most (NIST 800-63B),
 * plus a mix of character types, no obvious patterns, nothing from the person's own email, and no password found in data breaches. */
export const PASSWORD_MIN = 12;
export const PASSWORD_MAX = 128;

const common = ["password", "passw0rd", "qwerty", "letmein", "welcome", "admin", "iloveyou", "monkey", "dragon", "football", "baseball", "abc123", "123456", "111111", "sunshine", "princess", "trustno1", "firstperson", "marketing"];

/** A message when the password breaks a rule, or null. `email` lets the rule refuse passwords built from the person's own address. */
export function passwordIssue(pw: string, email?: string | null): string | null {
  if (pw.length < PASSWORD_MIN) return `Use at least ${PASSWORD_MIN} characters.`;
  if (pw.length > PASSWORD_MAX) return `Use at most ${PASSWORD_MAX} characters.`;
  if (!/[a-z]/.test(pw) || !/[A-Z]/.test(pw)) return "Use both upper and lower case letters.";
  if (!/\d/.test(pw)) return "Include at least one number.";
  if (!/[^A-Za-z0-9]/.test(pw)) return "Include at least one symbol, such as ! ? # or %.";
  if (/(.)\1\1/.test(pw)) return "Avoid repeating the same character three times in a row.";
  if (/(0123|1234|2345|3456|4567|5678|6789|abcd|bcde|cdef|qwer|asdf|zxcv)/i.test(pw)) return "Avoid sequences like 1234, abcd or qwer.";
  const lower = pw.toLowerCase();
  if (common.some((w) => lower.includes(w))) return "Avoid common words like password, qwerty or welcome.";
  const local = email?.split("@")[0]?.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (local && local.length >= 4 && lower.replace(/[^a-z0-9]/g, "").includes(local)) return "Don't use your email address in your password.";
  return null;
}

/** Plain checklist for the password field. */
export const passwordRules = [`At least ${PASSWORD_MIN} characters`, "Upper and lower case letters", "A number and a symbol", "Not found in known data breaches"];

/** Checks Have I Been Pwned with k-anonymity: only the first 5 characters of the password's SHA-1 hash leave the browser, never
 * the password. Returns how many times it appeared in breaches (0 = not found), or null if the check couldn't run. */
export async function breachCount(pw: string): Promise<number | null> {
  try {
    const hash = [...new Uint8Array(await crypto.subtle.digest("SHA-1", new TextEncoder().encode(pw)))].map((b) => b.toString(16).padStart(2, "0")).join("").toUpperCase();
    const prefix = hash.slice(0, 5), suffix = hash.slice(5);
    const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 5000);
    const r = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`, { headers: { "Add-Padding": "true" }, signal: ctrl.signal }).finally(() => clearTimeout(t));
    if (!r.ok) return null;
    for (const line of (await r.text()).split("\n")) {
      const [s, n] = line.trim().split(":");
      if (s === suffix) return Number(n) || 0;
    }
    return 0;
  } catch { return null; }
}

/** Rules plus the breach check; the message to show, or null when the password can be used. */
export async function passwordProblem(pw: string, email?: string | null): Promise<string | null> {
  const rule = passwordIssue(pw, email);
  if (rule) return rule;
  const seen = await breachCount(pw);
  if (seen && seen > 0) return `This password has appeared in ${seen.toLocaleString()} known data breaches, so attackers try it first. Please choose a different one.`;
  return null;
}
