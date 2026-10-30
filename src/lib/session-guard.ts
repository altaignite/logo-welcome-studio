import { redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { mfaNeeded } from "@/components/mfa";
import { touchSession } from "@/lib/account-security.functions";

/** Fast route guards for the client and staff areas. The session comes from local storage (no network), the staff check is cached
 * for a few minutes per user, and the server sign-in check runs in the background. The server and database still enforce
 * everything on every request; this only decides where to send the browser. */
const TTL = 5 * 60_000;
let staffCache: { userId: string; ok: boolean; at: number } | null = null;
let touched: string | null = null;

async function sessionUser(loginTo: "/" | "/admin-login") {
  const { data } = await supabase.auth.getSession();
  const user = data.session?.user;
  if (!user) throw redirect({ to: loginTo });
  if (await mfaNeeded()) throw redirect({ to: loginTo });
  // Once per session: record the sign-in and sign out a suspended or closed account.
  const sid = data.session!.access_token.slice(-24);
  if (touched !== sid) {
    touched = sid;
    void touchSession().catch(async (e: Error) => {
      if (/KYC_REQUIRED/.test(e.message)) { window.location.assign("/kyc"); return; }
      if (/suspended|closed|expired|unauthorized/i.test(e.message)) { await supabase.auth.signOut(); window.location.assign(loginTo); }
    });
  }
  return user;
}

export async function guardClient() {
  const user = await sessionUser("/");
  return { userId: user.id, email: user.email ?? "" };
}

export async function guardStaff() {
  const user = await sessionUser("/admin-login");
  if (!staffCache || staffCache.userId !== user.id || Date.now() - staffCache.at > TTL) {
    const { data } = await supabase.rpc("has_role", { _user_id: user.id, _role: "admin" });
    staffCache = { userId: user.id, ok: !!data, at: Date.now() };
  }
  if (!staffCache.ok) throw redirect({ to: "/admin-login" });
  return { adminEmail: user.email ?? "", adminId: user.id };
}

/** Forget cached checks on sign-out. */
supabase.auth.onAuthStateChange((event) => { if (event === "SIGNED_OUT") { staffCache = null; touched = null; } });
