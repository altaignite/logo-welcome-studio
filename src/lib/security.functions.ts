import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { limited } from "@/lib/session.middleware";

const label = (c: { claims: any }) => String(c.claims?.email ?? "Staff");

/** Owners' security overview: open events, request volume and the heaviest users from the rate-limit counters (no per-request
 * logging), new-location sign-ins and restricted accounts. */
export const securityOverview = createServerFn({ method: "POST" })
  .middleware([limited("lookup")])
  .handler(async ({ context }) => {
    const { requirePerm } = await import("@/lib/access.server");
    await requirePerm(context, "staff");
    const { getAdmin } = await import("@/lib/billing.server");
    const admin = await getAdmin();
    const since = new Date(Date.now() - 864e5).toISOString();
    const [events, hits, signIns, restricted] = await Promise.all([
      admin.from("security_events").select("*").gte("last_seen", new Date(Date.now() - 30 * 864e5).toISOString()).order("last_seen", { ascending: false }).limit(500),
      admin.from("rate_limit_hits").select("key, window_start, count").like("key", "request:%").gte("window_start", since).limit(20000),
      admin.from("sign_in_events").select("id, user_id, ip, country, city, new_location, created_at").gte("created_at", since).order("created_at", { ascending: false }).limit(1000),
      admin.from("profiles").select("id, account_number, first_name, last_name, status, status_reason, status_changed_at").in("status", ["fraud_kyc", "suspended"]).order("status_changed_at", { ascending: false }).limit(100),
    ]);
    // Server actions per hour and per account, from the per-user request counter every server action already updates.
    const perHour = new Map<string, number>(), perUser = new Map<string, number>();
    for (const h of (hits.data ?? []) as { key: string; window_start: string; count: number }[]) {
      const hr = h.window_start.slice(0, 13);
      perHour.set(hr, (perHour.get(hr) ?? 0) + h.count);
      const u = h.key.slice("request:".length);
      perUser.set(u, (perUser.get(u) ?? 0) + h.count);
    }
    const top = [...perUser.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
    const names = top.length ? ((await admin.from("profiles").select("id, account_number, email").in("id", top.map(([u]) => u))).data ?? []) : [];
    const signInRows = (signIns.data ?? []) as { ip: string | null; new_location: boolean }[];
    return {
      events: events.data ?? [],
      requestsPerHour: [...perHour.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([hour, count]) => ({ hour, count })),
      heaviestUsers: top.map(([id, count]) => { const p = names.find((n: { id: string }) => n.id === id) as { account_number?: string; email?: string } | undefined; return { id, count, account: p?.account_number ?? null, email: p?.email ?? null }; }),
      signIns: { total: signInRows.length, newLocations: (signIns.data ?? []).filter((s: { new_location: boolean }) => s.new_location), distinctIps: new Set(signInRows.map((s) => s.ip).filter(Boolean)).size },
      restricted: restricted.data ?? [],
    };
  });

/** Owners mark a security event group as handled. A new occurrence reopens it. */
export const resolveSecurityEvent = createServerFn({ method: "POST" })
  .middleware([limited("staffAdmin")])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { requirePerm } = await import("@/lib/access.server");
    await requirePerm(context, "staff");
    const { getAdmin, must } = await import("@/lib/billing.server");
    const admin = await getAdmin();
    must(await admin.from("security_events").update({ resolved_at: new Date().toISOString(), resolved_by_label: label(context) }).eq("id", data.id));
    return { ok: true };
  });

/** Staff downloading a client's full data is recorded, so possible data leaks can be traced. */
export const recordDataExport = createServerFn({ method: "POST" })
  .middleware([limited("lookup")])
  .inputValidator((d: unknown) => z.object({ clientId: z.string().uuid(), what: z.string().trim().max(80) }).parse(d))
  .handler(async ({ data, context }) => {
    const { requirePerm } = await import("@/lib/access.server");
    await requirePerm(context, "accounts");
    const { logSecurityEvent } = await import("@/lib/security-log.server");
    await logSecurityEvent({ kind: "staff_data_export", severity: "medium", userId: data.clientId, group: `${context.userId}:${data.clientId}`, summary: `${label(context)} downloaded ${data.what}.`, detail: { staff: label(context), staff_id: context.userId } });
    return { ok: true };
  });

