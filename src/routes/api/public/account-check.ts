import { createFileRoute } from "@tanstack/react-router";

/** Signup's email step: checks that the address is real and usable (syntax, disposable, undeliverable) and suggests typo fixes.
 * It never reveals whether the address has an account. Rate limited per IP and per email. */
export const Route = createFileRoute("/api/public/account-check")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });
        let email = "";
        try { email = String(((await request.json()) as { email?: unknown }).email ?? "").trim().toLowerCase(); } catch { return json({ error: "Invalid request." }, 400); }
        if (!/^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/.test(email) || email.length > 254) return json({ error: "Enter a valid email address." }, 400);
        const { enforceLimit, RateLimitError } = await import("@/lib/rate-limit.server");
        // Only Cloudflare's header: X-Forwarded-For is set by the caller and would let anyone dodge the per-IP limit.
        const ip = request.headers.get("cf-connecting-ip") ?? "unknown";
        try { await enforceLimit("accountCheck", `ip:${ip}`); await enforceLimit("accountCheckEmail", `email:${email}`); }
        catch (e) { if (e instanceof RateLimitError) return json({ error: e.message }, 429); throw e; }
        // Every address gets the same kind of answer: fake, disposable and undeliverable addresses are refused, risky ones logged,
        // and nothing ever says whether the address already has an account (no account lookup happens here at all).
        const { emailRisk } = await import("@/lib/email-risk.server");
        const risk = await emailRisk(email);
        if (risk.verdict === "block") return json({ error: risk.reasons[0], risk: risk.suggestion ? { suggestion: risk.suggestion } : {} }, 422);
        if (risk.verdict === "review") {
          const { logSecurityEvent } = await import("@/lib/security-log.server");
          await logSecurityEvent({ kind: "email_high_risk", severity: "medium", request, group: email.split("@")[1] ?? email, summary: `Signup started with a high-risk email (${email.split("@")[1]}): ${risk.reasons.join(" ")}`, detail: { reasons: risk.reasons } });
        }
        return json({ ok: true, risk: { verdict: risk.verdict, ...(risk.suggestion ? { suggestion: risk.suggestion } : {}) } });
      },
    },
  },
});
