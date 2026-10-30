/** Records security events for the owners' Security page. Never throws and never blocks the request it describes.
 * Events are grouped per kind, source and hour, so a flood of attempts adds a counter instead of rows. Server only. */
export type SecuritySeverity = "low" | "medium" | "high" | "critical";

const hour = () => new Date().toISOString().slice(0, 13);

export function requestOrigin(request?: Request | null) {
  const h = request?.headers;
  return { ip: h?.get("cf-connecting-ip") ?? null, country: h?.get("cf-ipcountry") ?? null, path: request ? new URL(request.url).pathname : null };
}

export async function logSecurityEvent(e: { kind: string; severity: SecuritySeverity; group?: string; request?: Request | null; userId?: string | null; path?: string | null; summary: string; detail?: Record<string, unknown> }) {
  try {
    let request = e.request ?? null;
    if (request === null && e.request === undefined) {
      try { const { getRequest } = await import("@tanstack/react-start/server"); request = getRequest(); } catch { request = null; }
    }
    const o = requestOrigin(request);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const source = e.group ?? e.userId ?? o.ip ?? "unknown";
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabaseAdmin as any).rpc("log_security_event", {
      _kind: e.kind, _severity: e.severity, _dedupe: `${e.kind}:${source}:${hour()}`, _ip: o.ip, _country: o.country, _user: e.userId ?? null,
      _path: e.path ?? o.path, _detail: { summary: e.summary, ...(e.detail ?? {}) },
    });
  } catch (err) { console.error("Security log failed", err); }
}
