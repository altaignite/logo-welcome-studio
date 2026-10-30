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
}
