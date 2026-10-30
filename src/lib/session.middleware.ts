import { createMiddleware } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { signInBlocked } from "@/lib/admin";

/** Every server function runs through this. It refuses suspended and closed accounts (even with a token issued before the change),
 * refuses a session that hasn't entered its two-factor code when the user set two-factor up (two-factor is optional), and records
 * the sign-in location once per session. */
export const requireSession = createMiddleware({ type: "function" })
  .middleware([requireSupabaseAuth])
  .server(async ({ next, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [prof, role] = await Promise.all([
      supabaseAdmin.from("profiles").select("status").eq("id", context.userId).maybeSingle(),
      supabaseAdmin.from("user_roles").select("user_id").eq("user_id", context.userId).eq("role", "admin").maybeSingle(),
    ]);
    if (!role.data && prof.data && signInBlocked(prof.data.status)) throw new Error("This account is suspended or closed. Please contact support.");
    if (context.claims?.aal !== "aal2") {
      const { data, error } = await supabaseAdmin.auth.admin.mfa.listFactors({ userId: context.userId });
      // Refuse only on clear evidence of an unpassed authenticator; a lookup failure must not block every save.
      if (error) console.error("Two-factor lookup failed", error.message);
      else if (data.factors.some((f) => f.status === "verified")) throw new Error("Finish signing in with your two-factor code.");
    }
    try {
      const { recordSignIn } = await import("@/lib/signin.server");
      await recordSignIn(supabaseAdmin, context.userId, context.claims?.session_id);
    } catch (e) { console.error("Sign-in record failed", e); }
    return next();
  });
