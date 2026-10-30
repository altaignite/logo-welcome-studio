import { createMiddleware } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Signed-in user whose session meets their two-factor setting. Two-factor is optional: only a user who has set up an
 * authenticator, but whose session hasn't entered its code yet (aal1), is refused. Decided from the token and Supabase Auth,
 * so it doesn't depend on any database function. */
export const requireSession = createMiddleware({ type: "function" })
  .middleware([requireSupabaseAuth])
  .server(async ({ next, context }) => {
    if (context.claims?.aal === "aal2") return next();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin.auth.admin.mfa.listFactors({ userId: context.userId });
    // Refuse only on clear evidence of an unpassed authenticator; a lookup failure must not block every save.
    if (error) console.error("Two-factor lookup failed", error.message);
    else if (data.factors.some((f) => f.status === "verified")) throw new Error("Finish signing in with your two-factor code.");
    return next();
  });
