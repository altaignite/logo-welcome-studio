import { createFileRoute } from "@tanstack/react-router";

/** Browsers report Content-Security-Policy violations here (blocked scripts, connections or framing). Reports are grouped and
 * rate limited per IP; they appear on the Security page, where repeated reports from one script can mean an injection attempt. */
export const Route = createFileRoute("/api/public/csp-report")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const none = new Response(null, { status: 204 });
        const text = (await request.text().catch(() => "")).slice(0, 20000);
        let reports: Record<string, unknown>[] = [];
        try {
          const body = JSON.parse(text) as unknown;
          reports = Array.isArray(body) ? body.map((r) => (r as { body?: Record<string, unknown> }).body ?? {}) : [((body as { "csp-report"?: Record<string, unknown> })["csp-report"] ?? {})];
        } catch { return none; }
        const { enforceLimit, RateLimitError } = await import("@/lib/rate-limit.server");
        try { await enforceLimit("cspReport", `ip:${request.headers.get("cf-connecting-ip") ?? "unknown"}`); } catch (e) { if (e instanceof RateLimitError) return none; throw e; }
        const { logSecurityEvent } = await import("@/lib/security-log.server");
        for (const r of reports.slice(0, 5)) {
          const directive = String(r["effectiveDirective"] ?? r["effective-directive"] ?? r["violated-directive"] ?? "unknown").slice(0, 60);
          const blocked = String(r["blockedURL"] ?? r["blocked-uri"] ?? "inline").slice(0, 200);
          // Older browsers omit the disposition; scripts and connections are only ever report-only here, so assume a report.
          const enforced = String(r["disposition"] ?? "report") === "enforce";
          let host = blocked; try { host = new URL(blocked).host || blocked; } catch { /* inline or eval */ }
          await logSecurityEvent({ kind: enforced ? "csp_blocked" : "csp_report_only", severity: enforced ? "medium" : "low", request, group: `${directive}:${host}`,
            path: String(r["documentURL"] ?? r["document-uri"] ?? "").slice(0, 300) || null,
            summary: `${enforced ? "Blocked" : "Would block"} ${directive} from ${host}.`, detail: { directive, blocked } });
        }
        return none;
      },
    },
  },
});
