import { createMiddleware } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Signed-in user whose session meets their two-factor setting. Server functions use the service role, so they check this rule
 * (public.mfa_session_ok) themselves: a user with an authenticator who hasn't entered its code yet is refused. */
export const requireSession = createMiddleware({ type: "function" })
  .middleware([requireSupabaseAuth])
  .server(async ({ next, context }) => {
    const { data, error } = await context.supabase.rpc("mfa_session_ok");
    if (error || !data) throw new Error("Finish signing in with your two-factor code.");
    return next();
  });
