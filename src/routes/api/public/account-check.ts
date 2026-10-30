import { createFileRoute } from "@tanstack/react-router";

/** Signup asks for the email first: this says whether it already has an account, so the flow can ask for the password
 * instead of creating a duplicate. It reveals only that yes/no, and is rate limited per IP and per email. */
export const Route = createFileRoute("/api/public/account-check")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });
        let email = "", token: string | null = null;
        try { const b = (await request.json()) as { email?: unknown; turnstile?: unknown }; email = String(b.email ?? "").trim().toLowerCase(); token = typeof b.turnstile === "string" ? b.turnstile : null; } catch { return json({ error: "Invalid request." }, 400); }
        if (!/^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/.test(email) || email.length > 254) return json({ error: "Enter a valid email address." }, 400);
        const { enforceLimit, RateLimitError } = await import("@/lib/rate-limit.server");
        // Only Cloudflare's header: X-Forwarded-For is set by the caller and would let anyone dodge the per-IP limit.
        const ip = request.headers.get("cf-connecting-ip") ?? "unknown";
        // Bot check first (Cloudflare Turnstile), so automated email scanning never reaches the lookup.
        const { verifyTurnstile } = await import("@/lib/turnstile.server");
        const bot = await verifyTurnstile(token, ip === "unknown" ? null : ip);
        if (!bot.ok) {
          const { logSecurityEvent } = await import("@/lib/security-log.server");
          await logSecurityEvent({ kind: "bot_blocked", severity: "medium", request, summary: `The bot check failed on the signup email step (${bot.reason}).`, detail: { reason: bot.reason } });
          return json({ error: "Please complete the security check and try again." }, 403);
        }
        try { await enforceLimit("accountCheck", `ip:${ip}`); await enforceLimit("accountCheckEmail", `email:${email}`); }
        catch (e) { if (e instanceof RateLimitError) return json({ error: e.message }, 429); throw e; }
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data, error } = await supabaseAdmin.from("profiles").select("id, status, created_at").ilike("email", email.replace(/[\\%_]/g, (c) => `\\${c}`)).limit(1);
        if (error) return json({ error: "We couldn't check that email. Please try again." }, 503);
        const row = (data ?? [])[0] as { status: string; created_at: string } | undefined;
        // New addresses are risk-checked: fake, disposable, undeliverable or brand-new domains are refused; risky ones are logged.
        if (!row) {
          const { emailRisk } = await import("@/lib/email-risk.server");
          const risk = await emailRisk(email);
          if (risk.verdict === "block") return json({ error: risk.reasons[0], risk }, 422);
          if (risk.verdict === "review") {
            const { logSecurityEvent } = await import("@/lib/security-log.server");
            await logSecurityEvent({ kind: "email_high_risk", severity: "medium", request, group: email.split("@")[1] ?? email, summary: `Signup started with a high-risk email (${email.split("@")[1]}): ${risk.reasons.join(" ")}`, detail: { reasons: risk.reasons } });
          }
          return json({ exists: false, risk });
        }
        // Right after signup, the flow asks whether security checks restricted the new account so it can show the KYC page.
        // Only accounts created in the last 10 minutes answer, so this can't be used to probe existing accounts.
        const fresh = !!row && Date.now() - new Date(row.created_at).getTime() < 10 * 60_000;
        return json({ exists: !!row, ...(fresh ? { restricted: row!.status === "fraud_kyc" } : {}) });
      },
    },
  },
});
