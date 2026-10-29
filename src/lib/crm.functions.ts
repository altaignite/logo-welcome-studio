import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const input = z.object({
  userId: z.string().uuid(),
  status: z.enum(["active", "suspended", "closed"]),
  reason: z.string().trim().min(3).max(1000),
});

/** Suspends, closes or reactivates a client account. Suspended/closed users are blocked from signing in. */
export const setAccountStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => input.parse(d))
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    if (!isAdmin) throw new Error("Forbidden");
    if (data.userId === context.userId) throw new Error("You can't change your own account status.");
    const { data: target } = await context.supabase.rpc("has_role", { _user_id: data.userId, _role: "admin" });
    if (target) throw new Error("Staff accounts can't be changed here.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const ban = await supabaseAdmin.auth.admin.updateUserById(data.userId, { ban_duration: data.status === "active" ? "none" : "876000h" });
    if (ban.error) throw new Error("Couldn't update sign-in access.");

    // Update through the staff session so the audit log records who did it.
    const up = await context.supabase.from("profiles").update({ status: data.status, status_reason: data.reason, status_changed_at: new Date().toISOString() }).eq("id", data.userId);
    if (up.error) throw new Error("Couldn't update the account.");
    if (data.status !== "active") {
      await context.supabase.from("subscriptions").update({ status: data.status === "closed" ? "cancelled" : "paused" }).eq("user_id", data.userId).in("status", ["active", "pending"]);
    }
    return { ok: true };
  });
