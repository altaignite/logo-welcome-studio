import { createFileRoute } from "@tanstack/react-router";

/** Signup asks for the email first: this says whether it already has an account, so the flow can ask for the password
 * instead of creating a duplicate. It reveals only that yes/no, and is rate limited per IP and per email. */
export const Route = createFileRoute("/api/public/account-check")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });
        let email = "";
        try { email = String(((await request.json()) as { email?: unknown }).email ?? "").trim().toLowerCase(); } catch { return json({ error: "Invalid request." }, 400); }
        if (!/^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/.test(email) || email.length > 254) return json({ error: "Enter a valid email address." }, 400);
        const { enforceLimit, RateLimitError } = await import("@/lib/rate-limit.server");
        const ip = request.headers.get("cf-connecting-ip") ?? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
        try { await enforceLimit("accountCheck", `ip:${ip}`); await enforceLimit("accountCheckEmail", `email:${email}`); }
        catch (e) { if (e instanceof RateLimitError) return json({ error: e.message }, 429); throw e; }
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data, error } = await supabaseAdmin.from("profiles").select("id").ilike("email", email.replace(/[\\%_]/g, (c) => `\\${c}`)).limit(1);
        if (error) return json({ error: "We couldn't check that email. Please try again." }, 503);
        return json({ exists: (data ?? []).length > 0 });
      },
    },
  },
});
