/** Saves signup progress in this browser so a visitor who closes the page can continue where they left off. Passwords and
 * signature codes are never saved (at the pay step only the new account's id is kept); after a restore the visitor re-enters the password. Drafts expire after 7 days. */
import { plans, type PersonalDetails } from "@/lib/signup";

export const DRAFT_KEY = "fp-signup-draft-v1";
export const DRAFT_DAYS = 7;

export type SignupDraft = {
  savedAt: number;
  step: number;
  planId: string;
  personal: PersonalDetails;
  phoneCountry: string;
  email: string;
  accountNumber: string;
  existingAccount: boolean;
  /** Set at the pay step: the new account's id (never a secret), so a visitor who leaves can come back and pay. */
  payUserId: string;
};

const str = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : "");

/** Validates whatever was stored (it can be stale or edited by hand) and returns a safe draft, or null. */
export function parseDraft(raw: string | null, now = Date.now()): SignupDraft | null {
  if (!raw) return null;
  try {
    const d = JSON.parse(raw) as Record<string, unknown>;
    const savedAt = Number(d["savedAt"]);
    if (!savedAt || now - savedAt > DRAFT_DAYS * 864e5) return null;
    const planId = str(d["planId"], 20);
    if (!plans.some((p) => p.id === planId)) return null;
    const p = (d["personal"] ?? {}) as Record<string, unknown>;
    const payUserId = /^[0-9a-f-]{36}$/i.test(str(d["payUserId"], 36)) ? str(d["payUserId"], 36) : "";
    const step = payUserId ? 6 : Math.min(4, Math.max(1, Math.floor(Number(d["step"]) || 1)));
    const accountNumber = /^\d{10}$/.test(str(d["accountNumber"], 10)) ? str(d["accountNumber"], 10) : "";
    return {
      savedAt, step, planId, accountNumber, existingAccount: d["existingAccount"] === true, payUserId,
      personal: { firstName: str(p["firstName"], 80), lastName: str(p["lastName"], 80), company: str(p["company"], 160), country: str(p["country"], 2), phone: str(p["phone"], 30) },
      phoneCountry: str(d["phoneCountry"], 2), email: str(d["email"], 254),
    };
  } catch { return null; }
}

/** Where to resume: the password isn't saved, so anything past the details step continues at "create your password". */
export function resumeStep(d: SignupDraft): { step: number; gate: "email" | "password" | null } {
  if (d.payUserId) return { step: 6, gate: null };
  if (d.existingAccount) return { step: 1, gate: "password" };
  if (!d.email) return { step: 1, gate: "email" };
  if (d.step <= 1) return { step: 1, gate: null };
  return { step: 2, gate: null };
}

export function loadDraft(): SignupDraft | null {
  try { return parseDraft(window.localStorage.getItem(DRAFT_KEY)); } catch { return null; }
}
export function saveDraft(d: Omit<SignupDraft, "savedAt">) {
  try { window.localStorage.setItem(DRAFT_KEY, JSON.stringify({ ...d, savedAt: Date.now() })); } catch { /* private mode or storage full: progress just isn't kept */ }
}
export function clearDraft() {
  try { window.localStorage.removeItem(DRAFT_KEY); } catch { /* ignore */ }
}
