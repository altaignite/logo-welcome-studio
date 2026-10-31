import { createFileRoute } from "@tanstack/react-router";

/** Right after signing, signup asks for the first invoice so the client can pay before leaving. The new account isn't signed in
 * yet (email unconfirmed), so the caller proves it by the account id signup returned plus its email, and only accounts created
 * in the last 30 minutes answer (later, the client signs in and pays from the dashboard). A clean signup (email risk "ok", nothing flagged) is approved and invoiced here, exactly as on
 * first sign-in; anything flagged waits for staff and gets no pay link. It only ever returns what's needed to pay that account's own first invoice (Stripe's confirmation secret and hosted page). */
export const Route = createFileRoute("/api/public/signup-payment")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });
        let userId = "", email = "";
        try { const b = (await request.json()) as { userId?: unknown; email?: unknown }; userId = String(b.userId ?? ""); email = String(b.email ?? "").trim().toLowerCase(); } catch { return json({ error: "Invalid request." }, 400); }
        if (!/^[0-9a-f-]{36}$/i.test(userId) || email.length > 254) return json({ error: "Invalid request." }, 400);
        const { enforceLimit, RateLimitError } = await import("@/lib/rate-limit.server");
        const ip = request.headers.get("cf-connecting-ip") ?? "unknown";
        try { await enforceLimit("signupPayment", `ip:${ip}`); await enforceLimit("signupPaymentAccount", `user:${userId}`); }
        catch (e) { if (e instanceof RateLimitError) return json({ error: e.message }, 429); throw e; }
        const { supabaseAdmin: admin } = await import("@/integrations/supabase/client.server");
        const { data: u } = await admin.auth.admin.getUserById(userId);
        const user = u?.user;
        // One generic answer for every mismatch, so this can't be used to probe accounts.
        if (!user || (user.email ?? "").toLowerCase() !== email || Date.now() - new Date(user.created_at).getTime() > 30 * 60_000) return json({ payment: null, expired: true });
        const { data: prof } = await admin.from("profiles").select("status").eq("id", userId).maybeSingle();
        if (!prof || prof.status === "fraud_kyc") return json({ payment: null, restricted: prof?.status === "fraud_kyc" });
        const { emailRisk } = await import("@/lib/email-risk.server");
        const risk = await emailRisk(email);
        if (risk.verdict === "ok") {
          const { autoApproveSignup } = await import("@/lib/billing.server");
          try { await autoApproveSignup(admin, userId, true); } catch (e) { console.error("Signup approval failed", e); }
        }
        const { data: inv } = await admin.from("invoices").select("id").eq("user_id", userId).eq("kind", "first").eq("status", "open").order("created_at", { ascending: false }).limit(1).maybeSingle();
        if (!inv) {
          // No open first invoice: either staff review the signup first, or the unpaid first invoice expired (about 23 hours).
          const { count } = await admin.from("applications").select("id", { count: "exact", head: true }).eq("user_id", userId).in("status", ["submitted", "in_review", "info_requested", "escalated"]);
          return json({ payment: null, review: (count ?? 0) > 0 });
        }
        const { invoicePayment } = await import("@/lib/billing.server");
        try { return json({ payment: await invoicePayment(admin, inv.id, userId), review: false }); }
        catch (e) { console.error("Signup payment details failed", e); return json({ payment: null, review: false }, 503); }
      },
    },
  },
});
