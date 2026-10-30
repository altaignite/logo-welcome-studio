/** One password policy for signup, password resets, password changes and staff invitations. Length matters most (NIST 800-63B),
 * nothing from the person's own email, and no password found in data breaches. */
export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 128;

/** A message when the password breaks a rule, or null. Kept short on purpose (NIST 800-63B): length and the breach check do the
 * real work; composition rules mostly frustrate people. `email` refuses passwords built from the person's own address. */
export function passwordIssue(pw: string, email?: string | null): string | null {
  if (pw.length < PASSWORD_MIN) return `Use at least ${PASSWORD_MIN} characters.`;
  if (pw.length > PASSWORD_MAX) return `Use at most ${PASSWORD_MAX} characters.`;
  if (!/[A-Za-z]/.test(pw) || !/\d/.test(pw)) return "Use a mix of letters and numbers.";
  if (/^(.)\1+$/.test(pw) || /^(0123456789|1234567890|abcdefghijkl|qwertyuiop)/i.test(pw)) return "Avoid repeated characters or simple sequences.";
  const local = email?.split("@")[0]?.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (local && local.length >= 4 && pw.toLowerCase().replace(/[^a-z0-9]/g, "").includes(local)) return "Don't use your email address in your password.";
  return null;
}

/** Plain checklist for the password field. */
export const passwordRules = [`At least ${PASSWORD_MIN} characters`, "Letters and numbers", "Not found in known data breaches"];

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
