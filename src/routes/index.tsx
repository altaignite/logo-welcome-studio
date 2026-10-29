import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { Mail, Lock, Eye, EyeOff, ArrowRight } from "lucide-react";
import { usePopup } from "@/components/popup";
import logo from "@/assets/logo.png.asset.json";
import hero from "@/assets/login-hero.jpg";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/")({
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
  const popup = usePopup();
  const navigate = useNavigate();
  const soon = (what: string) =>
    popup({ type: "info", title: `${what} is coming soon`, description: "This option isn't available yet.", primaryLabel: "Got it", secondaryLabel: null });
  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const email = String(f.get("email") ?? "").trim();
    const pw = String(f.get("password") ?? "");
    if (!email || !pw) {
      popup({ type: "error", title: "Please fill in your email and password", description: "Both fields are needed to log in." });
      return;
    }
    const { error } = await supabase.auth.signInWithPassword({ email, password: pw });
    if (error) {
      if (/banned/i.test(error.message)) popup({ type: "error", title: "Your account is suspended", description: "Please contact our support team to restore access." });
      else popup({ type: "error", title: "Something went wrong while trying to log you in", description: error.message });
      return;
    }
    navigate({ to: "/dashboard" });
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
          </div>

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
              <label className="flex cursor-pointer items-center gap-2 text-muted-foreground">
                <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} className="h-4 w-4 accent-primary" />
                Remember me
              </label>
              <button type="button" onClick={() => soon("Password reset")} className="font-semibold text-foreground hover:text-primary">Forgot Password?</button>
            </div>
            <button type="submit" className="signup-primary group flex items-center justify-center gap-2 text-sm">
              Log In <ArrowRight className="h-5 w-5 transition group-hover:translate-x-1" />
            </button>
          </form>

          <p className="mt-auto pt-5 text-sm text-muted-foreground sm:pt-10">
            Don't have an account? <Button asChild variant="link" className="ml-1 h-auto p-0 font-semibold text-foreground hover:text-primary"><Link to="/signup">Sign up</Link></Button>
          </p>
        </section>
      </div>
    </main>
  );
}
