import "./lib/error-capture";

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";

type ServerEntry = {
  fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response> | Response;
};

let serverEntryPromise: Promise<ServerEntry> | undefined;

async function getServerEntry(): Promise<ServerEntry> {
  if (!serverEntryPromise) {
    serverEntryPromise = import("@tanstack/react-start/server-entry").then(
      (m) => (m.default ?? m) as ServerEntry,
    );
  }
  return serverEntryPromise;
}

// h3 swallows in-handler throws into a normal 500 Response with body
// {"unhandled":true,"message":"HTTPError"} — try/catch alone never fires for those.
async function normalizeCatastrophicSsrResponse(response: Response): Promise<Response> {
  if (response.status < 500) return response;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return response;

  const body = await response.clone().text();
  if (!isH3SwallowedErrorBody(body)) return response;

  console.error(consumeLastCapturedError() ?? new Error(`h3 swallowed SSR error: ${body}`));
  return new Response(renderErrorPage(), {
    status: 500,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

function isH3SwallowedErrorBody(body: string): boolean {
  try {
    const payload = JSON.parse(body) as { unhandled?: unknown; message?: unknown };
    return payload.unhandled === true && payload.message === "HTTPError";
  } catch {
    return false;
  }
}

/** Browser security headers on every response: no framing, no MIME sniffing, HTTPS only, minimal referrer and device access. */
const securityHeaders: Record<string, string> = {
  "X-Frame-Options": "DENY",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=(self)",
  "Cross-Origin-Opener-Policy": "same-origin",
  // Enforced: rules that can't break the app (no plugins, no framing, no base-tag hijacking, forms only to us or Stripe, HTTPS only).
  "Content-Security-Policy": "object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self' https://checkout.stripe.com https://billing.stripe.com; upgrade-insecure-requests; report-uri /api/public/csp-report",
  // Reported, not enforced yet: the full script and connection allow-list. Lovable injects its own scripts on hosted pages, so
  // enforce this only after the browser reports show no violations.
  "Content-Security-Policy-Report-Only": [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com https://cdn.gpteng.co",
    "worker-src 'self' blob:",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https://flagcdn.com https://*.supabase.co",
    "font-src 'self' data:",
    "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://ipapi.co https://api.pwnedpasswords.com https://challenges.cloudflare.com",
    "frame-src https://challenges.cloudflare.com",
    "object-src 'none'",
    "base-uri 'self'",
    "frame-ancestors 'none'",
    "report-uri /api/public/csp-report",
  ].join("; "),
};
function withSecurityHeaders(response: Response) {
  try {
    for (const [k, v] of Object.entries(securityHeaders)) if (!response.headers.has(k)) response.headers.set(k, v);
    return response;
  } catch {
    // Some responses have immutable headers; copy them.
    const r = new Response(response.body, response);
    for (const [k, v] of Object.entries(securityHeaders)) if (!r.headers.has(k)) r.headers.set(k, v);
    return r;
  }
}

export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    try {
      const handler = await getServerEntry();
      const response = await handler.fetch(request, env, ctx);
      return withSecurityHeaders(await normalizeCatastrophicSsrResponse(response));
    } catch (error) {
      console.error(error);
      // Repeated crashes on one path can mean someone is probing it with malformed requests.
      try {
        const { logSecurityEvent } = await import("@/lib/security-log.server");
        await logSecurityEvent({ kind: "server_error", severity: "medium", request, group: new URL(request.url).pathname, summary: `The server failed while handling ${request.method} ${new URL(request.url).pathname}.`, detail: { error: String((error as Error)?.message ?? error).slice(0, 300) } });
      } catch { /* logging must never break the error page */ }
      return new Response(renderErrorPage(), {
        status: 500,
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }
  },
};
