import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { supabase } from "@/integrations/supabase/client";
import { usePopup } from "@/components/popup";
import { AuthShell } from "@/components/auth-shell";
import { passwordIssue } from "@/lib/client";

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
    const { data } = supabase.auth.onAuthStateChange((event) => { if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") setReady(true); });
    supabase.auth.getSession().then(({ data: s }) => { if (s.session) setReady(true); });
    return () => data.subscription.unsubscribe();
  }, []);
  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const pw = String(f.get("password") ?? ""), confirm = String(f.get("confirm") ?? "");
    const issue = passwordIssue(pw);
    if (issue) { popup({ type: "error", title: "Choose a stronger password", description: issue }); return; }
    if (pw !== confirm) { popup({ type: "error", title: "Passwords don't match", description: "Type the same password in both fields." }); return; }
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password: pw });
    setBusy(false);
    if (error) { popup({ type: "error", title: "Couldn't update your password", description: error.message }); return; }
    await supabase.auth.signOut();
    popup({ type: "success", title: "Password updated", description: "Log in with your new password.", primaryLabel: "Go to login", secondaryLabel: null, onPrimary: () => navigate({ to: "/" }) });
  };
  return (
    <AuthShell title="Set a new password" subtitle={ready ? "At least 10 characters with upper and lower case letters and a number." : "Open this page from the link in your reset email."}>
      {ready ? (
        <form onSubmit={submit} className="space-y-4" noValidate>
          <label className="block space-y-1.5"><span className="block text-[13px] font-medium">New password<span className="text-primary">*</span></span>
            <input name="password" type="password" autoComplete="new-password" className="signup-input" /></label>
          <label className="block space-y-1.5"><span className="block text-[13px] font-medium">Confirm password<span className="text-primary">*</span></span>
            <input name="confirm" type="password" autoComplete="new-password" className="signup-input" /></label>
          <button type="submit" disabled={busy} className="signup-primary text-sm">{busy ? "Saving…" : "Update password"}</button>
        </form>
      ) : (
        <button type="button" onClick={() => navigate({ to: "/forgot-password" })} className="signup-primary text-sm">Request a new link</button>
      )}
    </AuthShell>
  );
}
