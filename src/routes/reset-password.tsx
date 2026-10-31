import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { friendlyError } from "@/lib/errors";
import { Spinner } from "@/components/loading";
import { useEffect, useState, type FormEvent } from "react";
import { supabase } from "@/integrations/supabase/client";
import { usePopup } from "@/components/popup";
import { AuthShell } from "@/components/auth-shell";
import { passwordProblem, passwordRules, recoveryAllowed } from "@/lib/passwords";

export const Route = createFileRoute("/reset-password")({
  head: () => ({
    meta: [
      { title: "Set a new password | FP Marketing Accelerator" },
      { name: "description", content: "Choose a new password for your FP Marketing Accelerator account." },
      { property: "og:title", content: "Set a new password | FP Marketing Accelerator" },
      { property: "og:description", content: "Choose a new password for your FP Marketing Accelerator account." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Reset,
});

function Reset() {
  const popup = usePopup();
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    // Only a session opened from a reset link in the last hour may set a password here (recoveryAllowed).
    const check = (token: string | null | undefined) => setReady(recoveryAllowed(token));
    const { data } = supabase.auth.onAuthStateChange((_event, session) => check(session?.access_token));
    supabase.auth.getSession().then(({ data: s }) => check(s.session?.access_token));
    return () => data.subscription.unsubscribe();
  }, []);
  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const pw = String(f.get("password") ?? ""), confirm = String(f.get("confirm") ?? "");
    if (pw !== confirm) { popup({ type: "error", title: "Passwords don't match", description: "Type the same password in both fields." }); return; }
    setBusy(true);
    const { data: cur } = await supabase.auth.getSession();
    if (!recoveryAllowed(cur.session?.access_token)) { setBusy(false); setReady(false); popup({ type: "error", title: "This reset link has expired", description: "Reset links work for one hour. Request a new one." }); return; }
    const { data: who } = await supabase.auth.getUser();
    const issue = await passwordProblem(pw, who.user?.email);
    if (issue) { setBusy(false); popup({ type: "error", title: "Choose a different password", description: issue }); return; }
    const { error } = await supabase.auth.updateUser({ password: pw });
    setBusy(false);
    if (error) { popup({ type: "error", title: "Couldn't update your password", description: friendlyError(error) }); return; }
    await supabase.auth.signOut();
    popup({ type: "success", title: "Password updated", description: "Log in with your new password.", primaryLabel: "Go to login", secondaryLabel: null, onPrimary: () => navigate({ to: "/" }) });
  };
  return (
    <AuthShell title="Set a new password" subtitle={ready ? `${passwordRules.join(", ")}.` : "Open this page from the link in your reset email. Links work for one hour."}>
      {ready ? (
        <form onSubmit={submit} className="space-y-4" noValidate>
          <label className="block space-y-1.5"><span className="block text-[13px] font-medium">New password<span className="text-primary">*</span></span>
            <input name="password" type="password" autoComplete="new-password" className="signup-input" /></label>
          <label className="block space-y-1.5"><span className="block text-[13px] font-medium">Confirm password<span className="text-primary">*</span></span>
            <input name="confirm" type="password" autoComplete="new-password" className="signup-input" /></label>
          <button type="submit" disabled={busy} className="signup-primary inline-flex items-center justify-center gap-2 text-sm">{busy && <Spinner />}{busy ? "Saving…" : "Update password"}</button>
        </form>
      ) : (
        <button type="button" onClick={() => navigate({ to: "/forgot-password" })} className="signup-primary text-sm">Request a new link</button>
      )}
    </AuthShell>
  );
}
