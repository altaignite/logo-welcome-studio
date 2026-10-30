/** Records one sign-in event per session and flags new locations (the database notifies staff and the user). Server only. */
import { getRequest } from "@tanstack/react-start/server";
import { isNewLocation, placeFromRequest } from "@/lib/security";

type Admin = any;

export async function recordSignIn(admin: Admin, userId: string, sessionId: string | undefined) {
  if (!sessionId) return;
  const seen = await admin.from("sign_in_events").select("id").eq("session_id", sessionId).maybeSingle();
  if (seen.error || seen.data) return;
  const req = getRequest() as Request & { cf?: { country?: string; region?: string; city?: string } };
  const place = placeFromRequest(req.headers, req.cf);
  const prev = (await admin.from("sign_in_events").select("ip, country, region, city").eq("user_id", userId).order("created_at", { ascending: false }).limit(200)).data ?? [];
  await admin.from("sign_in_events").upsert({
    user_id: userId, session_id: sessionId, ...place, user_agent: (req.headers.get("user-agent") ?? "").slice(0, 300) || null,
    new_location: isNewLocation(place, prev),
  }, { onConflict: "session_id", ignoreDuplicates: true });
  let cleanEmail = false;
  // First sign-in: re-check the email, since the signup API can be called without the signup page's check.
  if (!prev.length) {
    const { data: u } = await admin.auth.admin.getUserById(userId);
    const email = u?.user?.email;
    const { data: staffRole } = await admin.from("user_roles").select("user_id").eq("user_id", userId).eq("role", "admin").maybeSingle();
    if (email && !staffRole) {
      const { emailRisk } = await import("@/lib/email-risk.server");
      const risk = await emailRisk(email);
      cleanEmail = risk.verdict === "ok";
      if (risk.verdict === "block") {
        const { flagForKyc } = await import("@/lib/kyc.server");
        await flagForKyc(admin, userId, `The account's email failed the email risk check: ${risk.reasons.join(" ")}`, "email risk check");
      } else if (risk.verdict === "review") {
        const { logSecurityEvent } = await import("@/lib/security-log.server");
        await logSecurityEvent({ kind: "email_high_risk", severity: "medium", userId, summary: `New account with a high-risk email (${email.split("@")[1]}): ${risk.reasons.join(" ")}`, detail: { reasons: risk.reasons } });
      }
    }
  }
  // Security pattern: many accounts from one network in a day.
  const { checkSharedIp } = await import("@/lib/kyc.server");
  await checkSharedIp(admin, userId, place.ip);
  // Clean new signups are approved straight away and get their first invoice; anything flagged (review ticket, restriction) waits.
  if (cleanEmail) {
    const { autoApproveSignup } = await import("@/lib/billing.server");
    try { await autoApproveSignup(admin, userId, true); } catch (e) { console.error("Automatic approval failed", e); }
  }
}
