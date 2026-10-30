/** Automatic security flags. Every pattern calls flagForKyc: the database sets the account to "Fraud - KYC" with the reason,
 * opens an urgent Security ticket with an internal note and alerts staff (public.flag_for_kyc); then the account's plans
 * are paused in Stripe like any hold. The client can only see the /kyc page until staff reinstate the account. Server only. */
import { KYC_ERROR } from "@/lib/admin";

type Admin = any;

/** New accounts signing in from one IP address within a day before it is treated as a multi-account pattern. */
export const SHARED_IP_ACCOUNTS = 3;
/** Accounts younger than this count towards the shared-IP pattern. */
export const NEW_ACCOUNT_DAYS = 7;

export async function flagForKyc(admin: Admin, userId: string, reason: string, source: string): Promise<boolean> {
  const { data, error } = await admin.rpc("flag_for_kyc", { _user: userId, _reason: reason, _source: source });
  if (error) { console.error("KYC flag failed", error.message); return false; }
  if (data === true) {
    try {
      const { applyAccountStatusEffects } = await import("@/lib/account-status.server");
      await applyAccountStatusEffects(admin, userId, "fraud_kyc", `Account restricted for KYC review: ${reason}`, null, "Security");
    } catch (e) { console.error("Pausing plans after a KYC flag failed", e); }
  }
  return data === true;
}

/** Duplicate mobile number on this account (checked when ordering; signup and phone changes are checked by a database trigger). */
export async function checkDuplicatePhone(admin: Admin, userId: string) {
  const { data: other } = await admin.rpc("duplicate_phone_owner", { _user: userId });
  if (!other) return false;
  const { data: o } = await admin.from("profiles").select("account_number").eq("id", other).maybeSingle();
  return flagForKyc(admin, userId, `This account was flagged due to duplication of phone number: the mobile number is already used by account ${o?.account_number ?? other}.`, "duplicate phone number");
}

/** Throws the KYC error for the client when the account is (now) restricted. */
export async function assertNotKyc(admin: Admin, userId: string) {
  const { data } = await admin.from("profiles").select("status").eq("id", userId).maybeSingle();
  if (data?.status === "fraud_kyc") throw new Error(KYC_ERROR);
}

/** Several client accounts signing in from the same IP address within 24 hours. */
export async function checkSharedIp(admin: Admin, userId: string, ip: string | null) {
  if (!ip) return false;
  const since = new Date(Date.now() - 864e5).toISOString();
  const rows = (await admin.from("sign_in_events").select("user_id").eq("ip", ip).gte("created_at", since).limit(500)).data ?? [];
  const users = [...new Set(rows.map((r: { user_id: string }) => r.user_id))] as string[];
  if (!users.includes(userId)) users.push(userId);
  if (users.length < SHARED_IP_ACCOUNTS) return false;
  // Only new accounts count: carriers and offices put many established clients behind one address.
  const recent = new Date(Date.now() - NEW_ACCOUNT_DAYS * 864e5).toISOString();
  const staff = new Set(((await admin.from("user_roles").select("user_id").eq("role", "admin").in("user_id", users)).data ?? []).map((r: { user_id: string }) => r.user_id));
  const fresh = new Set(((await admin.from("profiles").select("id").in("id", users).gte("created_at", recent)).data ?? []).map((r: { id: string }) => r.id));
  const clients = users.filter((u) => !staff.has(u) && fresh.has(u));
  if (clients.length < SHARED_IP_ACCOUNTS || !clients.includes(userId)) return false;
  return flagForKyc(admin, userId, `${clients.length} new accounts (created in the last ${NEW_ACCOUNT_DAYS} days) signed in from the same IP address (${ip}) within 24 hours.`, "shared IP address");
}
