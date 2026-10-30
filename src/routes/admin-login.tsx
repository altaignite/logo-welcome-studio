import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { Lock, Mail, ShieldCheck } from "lucide-react";
import logo from "@/assets/logo.png.asset.json";
import { supabase } from "@/integrations/supabase/client";
import { usePopup } from "@/components/popup";
import { useTurnstile } from "@/components/turnstile";
import { isUnconfirmedEmail, unconfirmedPopup } from "@/lib/email-confirmation";
import { Spinner } from "@/components/loading";
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

// One message for every failure, so the page never confirms which emails or passwords are valid or which accounts are staff.
const FAILED = { type: "error" as const, title: "Sign-in failed", description: "Check your email and password and try again.", primaryLabel: "Try again", secondaryLabel: null };

function AdminLogin() {
  const [busy, setBusy] = useState(false);
  const [mfa, setMfa] = useState(false);
  const popup = usePopup();
  const bot = useTurnstile();
  const navigate = useNavigate();
  useEffect(() => { void supabase.auth.getSession().then(async ({ data }) => { if (data.session && (await mfaNeeded())) setMfa(true); }); }, []);
  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const email = String(f.get("email") ?? "").trim().toLowerCase();
    const password = String(f.get("password") ?? "");
    if (!email || !password) return popup(FAILED);
    setBusy(true);
    const captcha = await bot.getToken();
    const { data, error } = await supabase.auth.signInWithPassword({ email, password, ...(captcha ? { options: { captchaToken: captcha } } : {}) });
    if (isUnconfirmedEmail(error)) { setBusy(false); return popup(unconfirmedPopup(email, popup, "/admin-login")); }
    if (error || !data.user) { setBusy(false); return popup(FAILED); }
    const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: data.user.id, _role: "admin" });
    setBusy(false);
    if (!isAdmin) {
      await supabase.auth.signOut();
      return popup(FAILED);
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
        <h1 className="mt-6 text-2xl font-extrabold">Staff sign in</h1>
        <p className="mt-1 text-sm text-muted-foreground">Access is by invitation only.</p>
        <form onSubmit={submit} noValidate className="mt-6 space-y-4">
          <label className="block space-y-1.5"><span className="text-[13px] font-medium">Email Address<span className="text-primary">*</span></span>
            <span className="relative block"><Mail className="absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><input name="email" type="email" autoComplete="email" className="signup-input pl-10" placeholder="Work email" /></span></label>
          <label className="block space-y-1.5"><span className="text-[13px] font-medium">Password<span className="text-primary">*</span></span>
            <span className="relative block"><Lock className="absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><input name="password" type="password" autoComplete="current-password" className="signup-input pl-10" /></span></label>
          <button type="submit" disabled={busy} className="signup-primary inline-flex items-center justify-center gap-2">{busy ? <Spinner /> : <ShieldCheck className="size-4" />}{busy ? "Signing in…" : "Sign in"}</button>
            {bot.widget}
        </form>
        <Link to="/forgot-password" className="mt-4 block text-center text-sm font-semibold hover:text-primary">Forgot password?</Link>
        </>}
      </div>
    </main>
  );
}
