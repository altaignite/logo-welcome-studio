/** Staff checks for server functions. Service-role writes bypass row level security, so every staff action checks here first. */
import type { StaffPerm } from "@/lib/staff";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Ctx = { supabase: any; userId: string; claims: any };

export async function isStaff(ctx: Ctx) {
  const { data } = await ctx.supabase.rpc("has_role", { _user_id: ctx.userId, _role: "admin" });
  return !!data;
}

/** Staff level grants the permission and the session meets the 2FA rule (checked in the database with the caller's token). */
export async function hasPerm(ctx: Ctx, perm: StaffPerm) {
  const { data } = await ctx.supabase.rpc("has_perm", { _user_id: ctx.userId, _perm: perm });
  return !!data;
}

export async function requirePerm(ctx: Ctx, perm: StaffPerm) {
  if (!(await hasPerm(ctx, perm))) throw new Error((await isStaff(ctx)) ? "Your staff level doesn't allow this, or you need to sign in with two-factor authentication." : "Forbidden");
}

export const actorLabel = (ctx: Ctx, fallback = "Client") => String(ctx.claims?.email ?? fallback);
