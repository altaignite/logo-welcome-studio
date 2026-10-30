import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { Lock, Mail, ShieldCheck } from "lucide-react";
import logo from "@/assets/logo.png.asset.json";
import { supabase } from "@/integrations/supabase/client";
import { usePopup } from "@/components/popup";
import { isUnconfirmedEmail, unconfirmedPopup } from "@/lib/email-confirmation";
import { Spinner } from "@/components/loading";
import { passwordIssue } from "@/lib/client";
import { MfaChallenge, mfaNeeded } from "@/components/mfa";

export const Route = createFileRoute("/admin-login")({
  head: () => ({
    meta: [
      { title: "FP Admin — Sign in" },
      { name: "description", content: "Staff sign-in for the FP Marketing Accelerator admin dashboard." },
      { property: "og:title", content: "FP Admin — Sign in" },
      { property: "og:description", content: "Staff sign-in for the FP Marketing Accelerator admin dashboard." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AdminLogin,
});

const DOMAIN = "@firstpersonmarketing.com";

function AdminLogin() {
  const [mode, setMode] = useState<"in" | "up">("in");
  const [busy, setBusy] = useState(false);
  const [mfa, setMfa] = useState(false);
  const popup = usePopup();
  const navigate = useNavigate();
  useEffect(() => { void supabase.auth.getSession().then(async ({ data }) => { if (data.session && (await mfaNeeded())) setMfa(true); }); }, []);
  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const email = String(f.get("email") ?? "").trim().toLowerCase();
    const password = String(f.get("password") ?? "");
    if (!email.endsWith(DOMAIN)) {
      popup({ type: "error", title: "Staff email required", description: `Use your ${DOMAIN} email address.`, primaryLabel: "Try again", secondaryLabel: null });
      return;
    }
    if (mode === "up" && passwordIssue(password)) {
      popup({ type: "error", title: "Choose a stronger password", description: passwordIssue(password)!, primaryLabel: "Try again", secondaryLabel: null });
      return;
    }
    setBusy(true);
    if (mode === "up") {
      const { error } = await supabase.auth.signUp({ email, password, options: { emailRedirectTo: `${window.location.origin}/admin-login` } });
      setBusy(false);
      if (error) return popup({ type: "error", title: "Couldn't create staff account", description: error.message });
      setMode("in");
      return popup({ type: "success", title: "Check your inbox", description: "Confirm your email address, then sign in here.", primaryLabel: "Got it", secondaryLabel: null });
    }
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (isUnconfirmedEmail(error)) { setBusy(false); return popup(unconfirmedPopup(email, popup, "/admin-login")); }
    if (error || !data.user) { setBusy(false); return popup({ type: "error", title: "Something went wrong while trying to log you in", description: error?.message ?? "Try again." }); }
    const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: data.user.id, _role: "admin" });
    setBusy(false);
    if (!isAdmin) {
      await supabase.auth.signOut();
      return popup({ type: "error", title: "No admin access", description: "Your account isn't approved for the admin dashboard yet." });
    }
    if (await mfaNeeded()) { setMfa(true); return; }
    navigate({ to: "/admin" });
  };
  return (
    <main className="flex min-h-dvh items-center justify-center bg-secondary px-4 py-10">
      <div className="w-full max-w-sm rounded-3xl border bg-card p-6 shadow-sm sm:p-8">
        <div className="flex items-center gap-3">
          <img src={logo.url} alt="FP" className="h-9 w-auto" />
          <span className="h-6 w-px bg-border" />
          <span className="text-sm font-semibold">Admin</span>
        </div>
        {mfa ? <div className="mt-6"><MfaChallenge onDone={() => navigate({ to: "/admin" })} onCancel={async () => { await supabase.auth.signOut(); setMfa(false); }} /></div> : <>
        <h1 className="mt-6 text-2xl font-extrabold">{mode === "in" ? "Staff sign in" : "Create staff account"}</h1>
        <p className="mt-1 text-sm text-muted-foreground">Only {DOMAIN} addresses have access.</p>
        <form onSubmit={submit} noValidate className="mt-6 space-y-4">
          <label className="block space-y-1.5"><span className="text-[13px] font-medium">Email Address<span className="text-primary">*</span></span>
            <span className="relative block"><Mail className="absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><input name="email" type="email" autoComplete="email" className="signup-input pl-10" placeholder={`name${DOMAIN}`} /></span></label>
          <label className="block space-y-1.5"><span className="text-[13px] font-medium">Password<span className="text-primary">*</span></span>
            <span className="relative block"><Lock className="absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><input name="password" type="password" autoComplete={mode === "in" ? "current-password" : "new-password"} className="signup-input pl-10" /></span></label>
          <button type="submit" disabled={busy} className="signup-primary inline-flex items-center justify-center gap-2">{busy ? <Spinner /> : <ShieldCheck className="size-4" />}{busy ? "Signing in…" : mode === "in" ? "Sign in" : "Create account"}</button>
        </form>
        {mode === "in" && <Link to="/forgot-password" className="mt-4 block text-center text-sm font-semibold hover:text-primary">Forgot password?</Link>}
        <button type="button" onClick={() => setMode(mode === "in" ? "up" : "in")} className="mt-4 w-full text-center text-sm text-muted-foreground hover:text-foreground">
          {mode === "in" ? "New staff member? Create an account" : "Already have an account? Sign in"}
        </button>
        </>}
      </div>
    </main>
  );
}
