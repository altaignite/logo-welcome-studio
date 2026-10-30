import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { KeyRound, LogOut, MapPin, ShieldOff } from "lucide-react";
import { Btn, FieldGrid, Section, db } from "@/components/admin/record-bits";
import { StatusBadge } from "@/components/admin/data-table";
import { FormModal, type FieldDef } from "@/components/admin/form-modal";
import { usePopup } from "@/components/popup";
import { formatDate } from "@/lib/admin";
import { deviceLabel, placeLabel } from "@/lib/security";
import type { Vals } from "@/lib/records";
import { getAccountSecurity, removeMfaFactor, revokeSessions, sendPasswordReset, updateUserMetadata } from "@/lib/account-security.functions";

/** Account Security tab: sign-in record, sessions, two-factor, metadata and sign-in history with new-location flags. */
export function AccountSecurity({ userId, adminEmail }: { userId: string; adminEmail: string }) {
  const qc = useQueryClient();
  const popup = usePopup();
  const load = useServerFn(getAccountSecurity), fnRevoke = useServerFn(revokeSessions), fnMeta = useServerFn(updateUserMetadata);
  const fnFactor = useServerFn(removeMfaFactor), fnReset = useServerFn(sendPasswordReset);
  const [modal, setModal] = useState<{ title: string; description?: string; fields: FieldDef[]; submitLabel: string; onSubmit: (v: Vals) => Promise<string | null> } | null>(null);
  const key = ["admin", "account-security", userId];
  const { data, isLoading, error } = useQuery({ queryKey: key, queryFn: () => load({ data: { userId } }) });
  const refresh = () => qc.invalidateQueries({ queryKey: ["admin"] });
  const fail = (e: unknown) => popup({ type: "error", title: "Something went wrong", description: (e as Error).message, primaryLabel: "Close", secondaryLabel: null });
  if (error) return <p className="text-sm text-destructive">{(error as Error).message}</p>;
  if (isLoading || !data) return <p className="text-sm text-muted-foreground">Loading sign-in details…</p>;
  const reason = (title: string, submitLabel: string, description: string, run: (r: string) => Promise<unknown>) => setModal({
    title, submitLabel, description, fields: [{ name: "reason", label: "Reason (saved in the audit log)", type: "textarea", required: true }],
    onSubmit: async (v) => { try { await run(v.reason); await refresh(); return null; } catch (e) { return (e as Error).message; } },
  });
  const endAll = () => reason("Sign out of every device?", "Sign out everywhere", "Ends every session now. Pages already open stop working within the hour, or at once if the account is suspended.",
    (r) => fnRevoke({ data: { userId, reason: r } }));
  const endOne = (id: string) => reason("End this session?", "End session", "That device will need to sign in again.", (r) => fnRevoke({ data: { userId, sessionId: id, reason: r } }));
  const dropFactor = (id: string) => reason("Remove two-factor authentication?", "Remove", "Use this when the client has lost their phone. They're signed out and can set it up again.",
    (r) => fnFactor({ data: { userId, factorId: id, reason: r } }));
  const reset = () => popup({ type: "info", title: "Send a password reset email?", description: `A reset link goes to ${data.user.email}.`, primaryLabel: "Send", secondaryLabel: "Cancel",
    onPrimary: async () => { try { await fnReset({ data: { userId } }); popup({ type: "success", title: "Reset email sent", primaryLabel: "Done", secondaryLabel: null }); } catch (e) { fail(e); } } });
  const editMeta = () => setModal({
    title: "Edit user metadata", submitLabel: "Save metadata", description: "One field per line as name: value, for example preferred_language: en. Names use lower case letters, numbers and underscores. Leave empty to clear.",
    fields: [{ name: "meta", label: "Metadata", type: "textarea", max: 4000, defaultValue: Object.entries(data.user.user_metadata).map(([k, v]) => `${k}: ${v ?? ""}`).join("\n") }],
    onSubmit: async (v) => {
      const metadata: Record<string, string | number | boolean | null> = {};
      for (const line of String(v.meta ?? "").split("\n").map((l) => l.trim()).filter(Boolean)) {
        const i = line.indexOf(":"); if (i < 1) return `"${line}" needs a name and a value separated by a colon.`;
        const raw = line.slice(i + 1).trim();
        metadata[line.slice(0, i).trim()] = raw === "" ? null : raw === "true" ? true : raw === "false" ? false : /^-?\d+(\.\d+)?$/.test(raw) ? Number(raw) : raw;
      }
      try { await fnMeta({ data: { userId, metadata } }); await refresh(); return null; } catch (e) { return (e as Error).message; }
    },
  });
  const review = async (ids: string[]) => {
    const r = await db.from("sign_in_events").update({ reviewed_at: new Date().toISOString(), reviewed_by_label: adminEmail }).in("id", ids);
    if (r.error) fail(r.error); await refresh();
  };
  const flagged = data.signIns.filter((s) => s.new_location && !s.reviewed_at);
  const banned = data.user.banned_until && new Date(data.user.banned_until) > new Date();
  return (
    <div className="space-y-4">
      {flagged.length > 0 && <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
        <span className="flex items-start gap-2"><MapPin className="mt-0.5 size-4 shrink-0" />{flagged.length} sign-in{flagged.length > 1 ? "s" : ""} from a new location: {flagged.map((s) => `${placeLabel(s)} on ${formatDate(s.created_at)}`).join("; ")}</span>
        <span className="flex gap-2"><Btn onClick={() => review(flagged.map((s) => s.id))}>Mark reviewed</Btn><Btn danger icon={LogOut} onClick={endAll}>Sign out everywhere</Btn></span>
      </div>}
      <Section title="Sign-in" actions={<><Btn icon={KeyRound} onClick={reset}>Send password reset</Btn><Btn icon={LogOut} danger onClick={endAll}>Sign out everywhere</Btn></>}>
        <FieldGrid items={[["Sign-in email", data.user.email ?? "—"], ["Email confirmed", formatDate(data.user.email_confirmed_at)], ["Last sign-in", formatDate(data.user.last_sign_in_at)],
          ["Created", formatDate(data.user.created_at)], ["Sign-in access", banned ? `Blocked until ${formatDate(data.user.banned_until)}` : "Allowed"], ["Sign-in methods", data.user.providers.join(", ") || "Email"]]} />
      </Section>
      <Section title={`Active sessions (${data.sessions.length})`}>
        <ul className="divide-y text-sm">{data.sessions.map((s) => <li key={s.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
          <span><span className="block font-medium">{deviceLabel(s.user_agent)}{s.aal === "aal2" && <span className="ml-2 text-xs text-muted-foreground">two-factor</span>}</span>
            <span className="text-xs text-muted-foreground">{s.ip ?? "IP unknown"}, signed in {formatDate(s.created_at)}{s.updated_at ? `, active ${formatDate(s.updated_at)}` : ""}</span></span>
          <Btn danger onClick={() => endOne(s.id)}>End</Btn></li>)}
          {data.sessions.length === 0 && <li className="px-5 py-6 text-muted-foreground">No active sessions.</li>}</ul>
      </Section>
      <Section title="Two-factor authentication">
        <ul className="divide-y text-sm">{data.factors.map((f) => <li key={f.id} className="flex items-center justify-between gap-3 px-5 py-3">
          <span><span className="block font-medium">{f.name ?? "Authenticator app"}</span><span className="text-xs text-muted-foreground">{f.status}, added {formatDate(f.created_at)}</span></span>
          <Btn icon={ShieldOff} danger onClick={() => dropFactor(f.id)}>Remove</Btn></li>)}
          {data.factors.length === 0 && <li className="px-5 py-6 text-muted-foreground">Not set up. Two-factor is optional for clients.</li>}</ul>
      </Section>
      <Section title="User metadata" actions={<Btn onClick={editMeta}>Edit</Btn>}>
        {Object.keys(data.user.user_metadata).length ? <FieldGrid items={Object.entries(data.user.user_metadata).map(([k, v]) => [k.replaceAll("_", " "), String(v ?? "—")])} />
          : <p className="px-5 py-6 text-sm text-muted-foreground">No metadata.</p>}
      </Section>
      <Section title="Sign-in history">
        <ul className="divide-y text-sm">{data.signIns.map((s) => <li key={s.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
          <span><span className="block font-medium">{placeLabel(s)}</span><span className="text-xs text-muted-foreground">{deviceLabel(s.user_agent)}, {s.ip ?? "IP unknown"}, {formatDate(s.created_at)}{s.reviewed_at ? `, reviewed by ${s.reviewed_by_label}` : ""}</span></span>
          {s.new_location && <StatusBadge status={s.reviewed_at ? "completed" : "on_hold"} label={s.reviewed_at ? "New location, reviewed" : "New location"} />}</li>)}
          {data.signIns.length === 0 && <li className="px-5 py-6 text-muted-foreground">No sign-ins recorded yet.</li>}</ul>
      </Section>
      {modal && <FormModal {...modal} onClose={() => setModal(null)} />}
    </div>
  );
}
