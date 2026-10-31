import { supabase } from "@/integrations/supabase/client";
import { createFileRoute, getRouteApi } from "@tanstack/react-router";
import { ErrorState, TableSkeleton } from "@/components/loading";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { DataTable, StatusBadge } from "@/components/admin/data-table";
import { FormModal, type FieldDef } from "@/components/admin/form-modal";
import { Section } from "@/components/admin/record-bits";
import { useStaff, type StaffRow } from "@/components/admin/staff";
import { MfaSettings } from "@/components/mfa";
import { BlockedDomains } from "@/components/admin/blocked-domains";
import { usePopup } from "@/components/popup";
import { formatDate } from "@/lib/admin";
import type { Vals } from "@/lib/records";
import { levelDescription, levelLabel, staffLevels, type StaffLevel } from "@/lib/staff";
import { cancelStaffInvite, inviteStaff, revokeStaff, setStaffLevel, setStaffMfaRequired } from "@/lib/staff.functions";

export const Route = createFileRoute("/admin/staff")({ component: Staff });
const adminRoute = getRouteApi("/admin");

function Staff() {
  const { adminId, adminEmail } = adminRoute.useRouteContext();
  const qc = useQueryClient();
  const popup = usePopup();
  const s = useStaff();
  const fnLevel = useServerFn(setStaffLevel), fnRevoke = useServerFn(revokeStaff), fnMfa = useServerFn(setStaffMfaRequired), fnInvite = useServerFn(inviteStaff), fnCancel = useServerFn(cancelStaffInvite);
  const invites = useQuery({ queryKey: ["admin", "staff-invites"], queryFn: async () => ((await supabase.from("staff_invites").select("*").is("accepted_at", null).order("created_at", { ascending: false })).data ?? []) as { email: string; level: string; invited_by_label: string; expires_at: string }[] });
  const [modal, setModal] = useState<{ title: string; description?: string; fields: FieldDef[]; submitLabel: string; onSubmit: (v: Vals) => Promise<string | null> } | null>(null);
  const refresh = () => qc.invalidateQueries({ queryKey: ["admin"] });
  const owner = s.can("staff");
  const changeLevel = (r: StaffRow) => setModal({
    title: `Access for ${r.email}`, submitLabel: "Save level", description: staffLevels.map((l) => `${levelLabel[l]}: ${levelDescription[l]}`).join(" "),
    fields: [{ name: "level", label: "Staff level", type: "select", options: [...staffLevels], defaultValue: r.level }],
    onSubmit: async (v) => { try { await fnLevel({ data: { userId: r.user_id, level: v.level as StaffLevel } }); await refresh(); return null; } catch (e) { return (e as Error).message; } },
  });
  const revoke = (r: StaffRow) => setModal({
    title: `Remove ${r.email}?`, submitLabel: "Remove staff access", description: "They keep their sign-in but lose the admin dashboard straight away. This is kept in the audit log.",
    fields: [{ name: "reason", label: "Reason", type: "textarea", required: true }],
    onSubmit: async (v) => { try { await fnRevoke({ data: { userId: r.user_id, reason: v.reason } }); await refresh(); return null; } catch (e) { return (e as Error).message; } },
  });
  const invite = () => setModal({
    title: "Invite a staff member", submitLabel: "Send invitation", description: "Staff access is by invitation only. We email them a link to set their password; the access level applies once they accept. Invitations expire after 7 days.",
    fields: [{ name: "email", label: "Work email", type: "email", required: true }, { name: "level", label: "Staff level", type: "select", options: [...staffLevels], defaultValue: "viewer" }],
    onSubmit: async (v) => { try { const r = await fnInvite({ data: { email: v.email, level: v.level as StaffLevel } }); await refresh();
      popup({ type: "success", title: r.granted ? "Staff access granted" : "Invitation sent", description: r.granted ? `${v.email} already had a confirmed account and now has staff access.` : `We emailed ${v.email} a link to join.`, primaryLabel: "Done", secondaryLabel: null }); return null; } catch (e) { return (e as Error).message; } },
  });
  const toggleMfa = () => popup({
    type: "info", title: s.requireMfa ? "Stop requiring two-factor sign-in?" : "Require two-factor sign-in for all staff?",
    description: s.requireMfa ? "Staff without an authenticator can make changes again." : "Staff without an authenticator app can still view the admin, but can't change anything until they set one up.",
    primaryLabel: s.requireMfa ? "Stop requiring" : "Require it", secondaryLabel: "Cancel",
    onPrimary: async () => { try { await fnMfa({ data: { required: !s.requireMfa } }); await refresh(); } catch (e) { popup({ type: "error", title: "Couldn't change this", description: (e as Error).message, primaryLabel: "Close", secondaryLabel: null }); } },
  });
  return (
    <div className="space-y-6">
      <div><h1 className="text-2xl font-extrabold sm:text-3xl">Staff and security</h1><p className="mt-1 text-sm text-muted-foreground">Staff join by invitation only. New staff start with view-only access.</p></div>
      {s.error ? <ErrorState error={s.error} retry={() => location.reload()} /> : s.isLoading ? <TableSkeleton /> :
        <DataTable<StaffRow> title="Staff" rows={s.staff} empty="No staff yet." columns={[
          { key: "email", label: "Email", value: (r) => r.email ?? "" },
          { key: "name", label: "Name", value: (r) => r.name ?? "" },
          { key: "level", label: "Level", value: (r) => r.level, render: (r) => <StatusBadge status={r.level === "viewer" ? "pending" : "active"} label={levelLabel[r.level as StaffLevel] ?? r.level} /> },
          { key: "mfa", label: "Two-factor", value: (r) => (r.mfa_enabled ? "On" : "Off"), render: (r) => <StatusBadge status={r.mfa_enabled ? "active" : s.requireMfa ? "failed" : "draft"} label={r.mfa_enabled ? "On" : "Off"} /> },
          { key: "since", label: "Staff since", value: (r) => r.created_at, render: (r) => formatDate(r.created_at) },
          { key: "x", label: "Actions", value: () => "", render: (r) => owner ? <div className="flex justify-end gap-1.5">
            <button type="button" onClick={() => changeLevel(r)} className="h-8 rounded-full border px-3 text-xs font-semibold hover:bg-secondary">Change level</button>
            {r.user_id !== adminId && <button type="button" onClick={() => revoke(r)} className="h-8 rounded-full border border-destructive/40 px-3 text-xs font-semibold text-destructive">Remove</button>}
          </div> : null },
        ]} />}
      {owner && <Section title="Invitations" actions={<button type="button" onClick={invite} className="h-9 rounded-full bg-foreground px-4 text-xs font-semibold text-background">Invite staff</button>}>
        {(invites.data ?? []).length === 0 ? <p className="p-5 text-sm text-muted-foreground">No pending invitations. Staff can only join by invitation.</p>
          : <ul className="divide-y text-sm">{(invites.data ?? []).map((i) => <li key={i.email} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3">
            <span className="min-w-0"><span className="block truncate font-medium">{i.email}</span><span className="text-xs text-muted-foreground">{levelLabel[i.level as StaffLevel] ?? i.level}, invited by {i.invited_by_label}, {new Date(i.expires_at) < new Date() ? "expired" : `expires ${formatDate(i.expires_at)}`}</span></span>
            <button type="button" onClick={async () => { await fnCancel({ data: { email: i.email } }); await refresh(); }} className="h-8 rounded-full border px-3 text-xs font-semibold hover:bg-secondary">Cancel</button></li>)}</ul>}
      </Section>}
      <div className="space-y-6">
        <Section title={s.requireMfa ? "Your two-factor authentication (required for staff)" : "Your two-factor authentication"}><MfaSettings onChange={refresh} /></Section>
        <Section title="Staff security rule">
          <div className="space-y-3 p-5 text-sm">
            <p>{s.requireMfa ? "Two-factor sign-in is required. Staff without it can only view." : "Two-factor sign-in is optional for staff."} Staff who turn it on always need their code to make changes.</p>
            {owner ? <button type="button" onClick={toggleMfa} className="h-10 rounded-full bg-foreground px-6 text-sm font-semibold text-background">{s.requireMfa ? "Stop requiring it" : "Require for all staff"}</button>
              : <p className="text-muted-foreground">Only owners can change this.</p>}
          </div>
        </Section>
      </div>
      <BlockedDomains canEdit={s.can("accounts")} adminEmail={adminEmail} />
      {modal && <FormModal {...modal} onClose={() => setModal(null)} />}
    </div>
  );
}
