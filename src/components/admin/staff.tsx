import { useQuery } from "@tanstack/react-query";
import { getRouteApi } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import type { FieldDef } from "@/components/admin/form-modal";
import { levelGrants, type StaffPerm } from "@/lib/staff";

const adminRoute = getRouteApi("/admin");
export type StaffRow = { user_id: string; email: string; name: string | null; level: string; mfa_enabled: boolean; created_at: string };

/** Staff directory, the signed-in staff member's level and the 2FA rule. Buttons use can() to hide actions; the database enforces them. */
export function useStaff() {
  const { adminId } = adminRoute.useRouteContext();
  const q = useQuery({
    queryKey: ["admin", "staff-directory"], staleTime: 60_000,
    queryFn: async () => {
      const [dir, sec] = await Promise.all([supabase.rpc("staff_directory"), supabase.from("security_settings").select("require_staff_mfa").eq("id", 1).maybeSingle()]);
      if (dir.error) throw dir.error;
      return { staff: (dir.data ?? []) as StaffRow[], requireMfa: !!sec.data?.require_staff_mfa };
    },
  });
  const staff = q.data?.staff ?? [];
  const me = staff.find((s) => s.user_id === adminId);
  return {
    ...q, staff, me, requireMfa: q.data?.requireMfa ?? false, emails: staff.map((s) => s.email).filter(Boolean),
    can: (perm: StaffPerm) => levelGrants(me?.level, perm),
  };
}

/** Turns free-text assignment fields into a pick list of staff emails (keeping any current value). */
export function withStaffPicker(fields: FieldDef[], emails: string[]): FieldDef[] {
  return fields.map((f) => {
    if (f.name !== "assigned_to" && f.name !== "account_manager") return f;
    const cur = f.defaultValue ?? "";
    return { ...f, type: "select", options: ["", ...new Set([...emails, ...(cur ? [cur] : [])])] };
  });
}
