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
  // Stripe's card form runs in its own frame and needs the Payment Request API there for Apple Pay and Google Pay.
  "Permissions-Policy": 'camera=(), microphone=(), geolocation=(), payment=(self "https://js.stripe.com")',
  // Allow popups: some Stripe payment methods and bank confirmations open one and report back.
  "Cross-Origin-Opener-Policy": "same-origin-allow-popups",
};

/** The full Content-Security-Policy allow-list: only this site, Supabase, Stripe and the few services the browser uses. */
const fullCsp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' https://cdn.gpteng.co https://js.stripe.com https://*.js.stripe.com",
  "worker-src 'self' blob:",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://flagcdn.com https://*.supabase.co https://*.stripe.com",
  "font-src 'self' data:",
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://ipapi.co https://api.pwnedpasswords.com https://api.stripe.com https://m.stripe.network",
  "frame-src https://js.stripe.com https://*.js.stripe.com https://hooks.stripe.com",
  "object-src 'none'",
  "base-uri 'self'",
  "frame-ancestors 'none'",
  "form-action 'self' https://checkout.stripe.com https://billing.stripe.com",
  "upgrade-insecure-requests",
  "report-uri /api/public/csp-report",
].join("; ");
// Rules that can't break anything (no plugins, no framing, no base-tag hijacking, forms only to us or Stripe, HTTPS only).
const coreCsp = "object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self' https://checkout.stripe.com https://billing.stripe.com; upgrade-insecure-requests; report-uri /api/public/csp-report";

/** The published site enforces the full allow-list, which blocks scripts from anywhere else (the usual way XSS loads a payload)
 * and eval. Lovable's editor preview and local development inject their own tooling (eval, blob workers), so they enforce only
 * the core rules and report the rest. */
export function cspHeaders(host: string): Record<string, string> {
  const preview = /(^|\.)lovableproject\.com$|^id-preview-|^localhost$|^127\.0\.0\.1$|^\[::1\]$/.test(host.replace(/:\d+$/, ""));
  return preview ? { "Content-Security-Policy": coreCsp, "Content-Security-Policy-Report-Only": fullCsp } : { "Content-Security-Policy": fullCsp };
}
function withSecurityHeaders(response: Response, host = "") {
  const headers = { ...securityHeaders, ...cspHeaders(host) };
  try {
    for (const [k, v] of Object.entries(headers)) if (!response.headers.has(k)) response.headers.set(k, v);
    return response;
  } catch {
    // Some responses have immutable headers; copy them.
    const r = new Response(response.body, response);
    for (const [k, v] of Object.entries(headers)) if (!r.headers.has(k)) r.headers.set(k, v);
    return r;
  }
}

/** HTTPS only: a plain-HTTP request is redirected permanently (HSTS then keeps browsers on HTTPS). Local development is exempt. */
export function httpsRedirect(request: Request): Response | null {
  const url = new URL(request.url);
  const local = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(url.hostname);
  const proto = request.headers.get("x-forwarded-proto") ?? url.protocol.replace(":", "");
  if (local || proto !== "http") return null;
  url.protocol = "https:";
  return new Response(null, { status: 308, headers: { Location: url.toString() } });
}

/** Cross-site request forgery guard: sign-in uses a bearer token, not cookies, so forged requests carry no credentials anyway;
 * on top of that, any state-changing request sent by a browser from another site (its Origin header names a different host) is
 * refused. Stripe's signed webhook and server-to-server calls send no Origin and are unaffected. */
export function crossSiteRefused(request: Request): Response | null {
  if (["GET", "HEAD", "OPTIONS"].includes(request.method)) return null;
  const origin = request.headers.get("origin");
  if (!origin) return null;
  const url = new URL(request.url);
  if (url.pathname === "/api/public/stripe/webhook") return null;
  try { if (new URL(origin).host === url.host) return null; } catch { /* malformed Origin: refuse */ }
  return new Response("Cross-site request refused", { status: 403, headers: { "content-type": "text/plain" } });
}

export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    const early = httpsRedirect(request) ?? crossSiteRefused(request);
    if (early) {
      if (early.status === 403) {
        try { const { logSecurityEvent } = await import("@/lib/security-log.server"); await logSecurityEvent({ kind: "cross_site_request", severity: "medium", request, group: new URL(request.url).pathname, summary: `A cross-site ${request.method} to ${new URL(request.url).pathname} from ${request.headers.get("origin")} was refused.` }); } catch { /* never block on logging */ }
      }
      return withSecurityHeaders(early, new URL(request.url).host);
    }
    try {
      const handler = await getServerEntry();
      const response = await handler.fetch(request, env, ctx);
      return withSecurityHeaders(await normalizeCatastrophicSsrResponse(response), new URL(request.url).host);
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
