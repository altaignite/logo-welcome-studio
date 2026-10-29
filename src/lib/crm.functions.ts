import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { accountStatuses, signInBlocked, subscriptionEffect } from "@/lib/admin";

const input = z.object({
  userIds: z.array(z.string().uuid()).min(1).max(200),
  status: z.enum(accountStatuses),
  reason: z.string().trim().min(3).max(1000),
});

/** Changes client account status. Suspended and closed accounts are blocked from signing in. */
export const setAccountStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => input.parse(d))
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    if (!isAdmin) throw new Error("Forbidden");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const skipped: string[] = [];
    for (const userId of data.userIds) {
      if (userId === context.userId) { skipped.push(userId); continue; }
      const { data: target } = await context.supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
      if (target) { skipped.push(userId); continue; }
      const ban = await supabaseAdmin.auth.admin.updateUserById(userId, { ban_duration: signInBlocked(data.status) ? "876000h" : "none" });
      if (ban.error) throw new Error("Couldn't update sign-in access.");
      // Update through the staff session so the audit log records who did it.
      const up = await context.supabase.from("profiles").update({ status: data.status, status_reason: data.reason, status_changed_at: new Date().toISOString() }).eq("id", userId);
      if (up.error) throw new Error("Couldn't update the account.");
      const effect = subscriptionEffect(data.status);
      if (effect) {
        await context.supabase.from("subscriptions").update({ status: effect, ...(effect === "cancelled" ? { cancelled_at: new Date().toISOString() } : {}) })
          .eq("user_id", userId).in("status", ["active", "pending", ...(effect === "cancelled" ? ["paused"] : [])]);
      }
    }
    return { ok: true, skipped: skipped.length };
  });
