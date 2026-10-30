import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { Mail, Lock, Eye, EyeOff, ArrowRight } from "lucide-react";
import { usePopup } from "@/components/popup";
import { isUnconfirmedEmail, unconfirmedPopup } from "@/lib/email-confirmation";
import { Spinner } from "@/components/loading";
import { SwitchField } from "@/components/switch-field";
import logo from "@/assets/logo.png.asset.json";
import hero from "@/assets/login-hero.jpg";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { MfaChallenge, mfaNeeded } from "@/components/mfa";
import { planFromSearch, type PlanId } from "@/lib/signup";

export const Route = createFileRoute("/")({
  // A plan chosen at signup by someone who already has an account carries through sign-in to ordering.
  validateSearch: (s: Record<string, unknown>): { plan?: PlanId } => { const plan = planFromSearch(s["plan"]); return plan ? { plan } : {}; },
  head: () => ({
    meta: [
      { title: "FP Marketing Accelerator — Sign in" },
      { name: "description", content: "Sign in to your FP Marketing Accelerator account." },
      { property: "og:title", content: "FP Marketing Accelerator — Sign in" },
      { property: "og:description", content: "Sign in to your FP Marketing Accelerator account." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Login,
});

const input = "signup-input pl-10";

function Login() {
  const [remember, setRemember] = useState(false);
  const [show, setShow] = useState(false);
  const [mfa, setMfa] = useState(false);
  const [busy, setBusy] = useState(false);
  const popup = usePopup();
  const navigate = useNavigate();
  const { plan } = Route.useSearch();
  const next = () => (plan ? navigate({ to: "/dashboard/order", search: { plan } }) : navigate({ to: "/dashboard" }));
  // A signed-in session that still needs its authenticator code continues here (the dashboard sends it back).
  useEffect(() => { void supabase.auth.getSession().then(async ({ data }) => { if (data.session && (await mfaNeeded())) setMfa(true); }); }, []);
  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const email = String(f.get("email") ?? "").trim();
    const pw = String(f.get("password") ?? "");
    if (!email || !pw) {
      popup({ type: "error", title: "Please fill in your email and password", description: "Both fields are needed to log in." });
      return;
    }
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password: pw });
    if (error) {
      setBusy(false);
      if (isUnconfirmedEmail(error)) popup(unconfirmedPopup(email, popup));
      else if (/banned/i.test(error.message)) popup({ type: "error", title: "Your account is suspended", description: "Please contact our support team to restore access." });
      else popup({ type: "error", title: "Something went wrong while trying to log you in", description: error.message });
      return;
    }
    if (await mfaNeeded()) { setBusy(false); setMfa(true); return; }
    // Keep the spinner until the dashboard has opened.
    await next();
    setBusy(false);
  };
  return (
    <main className="min-h-dvh bg-background lg:flex lg:items-center lg:justify-center lg:bg-secondary lg:p-8">
      <div className="relative mx-auto flex min-h-dvh w-full max-w-6xl flex-col lg:grid lg:min-h-0 lg:grid-cols-2 lg:overflow-hidden lg:rounded-[2rem] lg:bg-card lg:p-4 lg:shadow-2xl">
        <div className="relative h-[30dvh] min-h-48 shrink-0 overflow-hidden lg:order-2 lg:h-auto lg:min-h-[680px] lg:rounded-3xl">
          <img
            src={hero}
            alt="Entrepreneur working late in a high-rise office overlooking the city"
            width={896}
            height={1152}
            className="absolute inset-0 h-full w-full object-cover object-[60%_30%]"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-foreground/80 via-foreground/10 to-transparent" />
          <div className="absolute inset-x-0 bottom-10 hidden px-10 lg:block">
            <p className="text-sm font-medium uppercase tracking-[0.25em] text-background/70">Marketing Accelerator</p>
            <p className="mt-3 max-w-sm text-3xl font-bold leading-tight text-background">Grow faster. Market smarter.</p>
          </div>
        </div>

        <section className="relative -mt-6 flex flex-1 flex-col items-center rounded-t-[1.5rem] bg-background px-5 pb-6 pt-5 sm:px-12 lg:mt-0 lg:rounded-none lg:bg-transparent lg:px-14 lg:py-12">
          <img src={logo.url} alt="FP logo" className="h-10 w-10 object-contain sm:h-14 sm:w-14" />

          <div className="mt-3 text-center lg:mt-12">
            <h1 className="text-2xl font-extrabold tracking-tight text-foreground sm:text-4xl">WELCOME BACK!</h1>
            <p className="mt-1 text-sm text-muted-foreground sm:mt-2 sm:text-base">Access your personal account by logging in.</p>
            <p className="mt-3 text-sm text-muted-foreground">New to First Person Marketing? <Link to="/signup" className="font-semibold text-foreground underline underline-offset-4">Choose a plan and get started</Link></p>
          </div>

          {mfa ? <div className="mt-5 flex w-full justify-center sm:mt-8"><MfaChallenge onDone={() => void next()} onCancel={async () => { await supabase.auth.signOut(); setMfa(false); }} /></div> :
          <form className="mt-5 w-full max-w-md space-y-4 sm:mt-8 sm:space-y-5" onSubmit={onSubmit} noValidate>
            <div className="space-y-1.5">
              <label htmlFor="email" className="block text-[13px] font-medium text-foreground">Email Address<span className="text-primary">*</span></label>
              <div className="relative">
                <Mail className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <input id="email" name="email" type="email" autoComplete="email" inputMode="email" placeholder="Enter your email" className={input} />
              </div>
            </div>
            <div className="space-y-1.5">
              <label htmlFor="password" className="block text-[13px] font-medium text-foreground">Password<span className="text-primary">*</span></label>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <input id="password" name="password" type={show ? "text" : "password"} autoComplete="current-password" placeholder="Enter your password" className={`${input} pr-11`} />
                <button type="button" onClick={() => setShow((v) => !v)} aria-label={show ? "Hide password" : "Show password"} className="absolute right-1 top-1/2 grid size-9 -translate-y-1/2 place-items-center rounded-full text-muted-foreground transition hover:bg-muted hover:text-foreground">
                  {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
            </div>
            <div className="flex items-center justify-between gap-3 text-sm">
              <SwitchField checked={remember} onCheckedChange={setRemember} label={<span className="text-muted-foreground">Remember me</span>} className="flex-row-reverse justify-end" />
              <Link to="/forgot-password" className="font-semibold text-foreground hover:text-primary">Forgot Password?</Link>
            </div>
            <button type="submit" disabled={busy} aria-busy={busy} className="signup-primary group flex items-center justify-center gap-2 text-sm disabled:opacity-80">
              {busy ? <><Spinner />Signing in…</> : <>Log In <ArrowRight className="h-5 w-5 transition group-hover:translate-x-1" /></>}
            </button>
          </form>}

          <p className="mt-auto pt-5 text-sm text-muted-foreground sm:pt-10">
            Don't have an account? <Button asChild variant="link" className="ml-1 h-auto p-0 font-semibold text-foreground hover:text-primary"><Link to="/signup">Sign up</Link></Button>
          </p>
        </section>
      </div>
    </main>
  );
}
