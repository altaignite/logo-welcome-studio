import { createFileRoute } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { Mail, Lock, Eye, EyeOff, ArrowRight } from "lucide-react";
import { usePopup } from "@/components/popup";
import logo from "@/assets/logo.png.asset.json";
import hero from "@/assets/login-hero.jpg";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Welcome back — Sign in" },
      { name: "description", content: "Access your personal account by logging in." },
      { property: "og:title", content: "Welcome back — Sign in" },
      { property: "og:description", content: "Access your personal account by logging in." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Login,
});

const input =
  "h-12 w-full rounded-xl border border-transparent bg-secondary pl-11 pr-5 text-[0.95rem] text-foreground outline-none transition placeholder:text-muted-foreground hover:border-input focus:border-foreground focus:bg-background focus:ring-4 focus:ring-foreground/5 sm:h-14 sm:rounded-2xl sm:pl-14 sm:text-base";

function Login() {
  const [remember, setRemember] = useState(false);
  const [show, setShow] = useState(false);
  const popup = usePopup();
  const soon = (what: string) =>
    popup({ type: "info", title: `${what} is coming soon`, description: "This option isn't available yet.", primaryLabel: "Got it", secondaryLabel: null });
  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const email = String(f.get("email") ?? "").trim();
    const pw = String(f.get("password") ?? "");
    if (!email || !pw) {
      popup({ type: "error", title: "Please fill in your email and password", description: "Both fields are needed to log in." });
      return;
    }
    if (pw.length < 6) {
      popup({ type: "error", title: "Something went wrong while trying to log you in", description: "Try again or come back later." });
      return;
    }
    popup({ type: "success", title: "Welcome back!", description: "You're logged in successfully.", primaryLabel: "Continue", secondaryLabel: null });
  };
  return (
    <main className="min-h-dvh bg-background lg:flex lg:items-center lg:justify-center lg:bg-secondary lg:p-8">
      <div className="relative mx-auto flex min-h-dvh w-full max-w-6xl flex-col lg:grid lg:min-h-0 lg:grid-cols-2 lg:overflow-hidden lg:rounded-[2rem] lg:bg-card lg:p-4 lg:shadow-2xl">
        <div className="relative h-[42dvh] min-h-64 shrink-0 overflow-hidden lg:order-2 lg:h-auto lg:min-h-[680px] lg:rounded-3xl">
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

        <section className="relative -mt-8 flex flex-1 flex-col items-center rounded-t-[2rem] bg-background px-6 pb-8 pt-8 sm:px-12 lg:mt-0 lg:rounded-none lg:bg-transparent lg:px-14 lg:py-12">
          <img src={logo.url} alt="FP logo" className="h-12 w-12 object-contain sm:h-14 sm:w-14" />

          <div className="mt-6 text-center lg:mt-12">
            <h1 className="text-[1.75rem] font-extrabold tracking-tight text-foreground sm:text-4xl">WELCOME BACK!</h1>
            <p className="mt-2 text-sm text-muted-foreground sm:text-base">Access your personal account by logging in.</p>
          </div>

          <form className="mt-8 w-full max-w-md space-y-5" onSubmit={onSubmit} noValidate>
            <div className="space-y-2">
              <label htmlFor="email" className="pl-1 text-sm font-semibold text-foreground">Email Address or Username</label>
              <div className="relative">
                <Mail className="pointer-events-none absolute left-5 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
                <input id="email" name="email" type="text" autoComplete="username" placeholder="Enter your email" className={input} />
              </div>
            </div>
            <div className="space-y-2">
              <label htmlFor="password" className="pl-1 text-sm font-semibold text-foreground">Password</label>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-5 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
                <input id="password" name="password" type={show ? "text" : "password"} autoComplete="current-password" placeholder="Enter your password" className={`${input} pr-14`} />
                <button type="button" onClick={() => setShow((v) => !v)} aria-label={show ? "Hide password" : "Show password"} className="absolute right-2 top-1/2 grid h-10 w-10 -translate-y-1/2 place-items-center rounded-full text-muted-foreground transition hover:bg-muted hover:text-foreground">
                  {show ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
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
            <button type="submit" className="group flex h-14 w-full items-center justify-center gap-2 rounded-full bg-foreground text-base font-semibold text-background transition hover:bg-primary active:scale-[0.99]">
              Log In <ArrowRight className="h-5 w-5 transition group-hover:translate-x-1" />
            </button>
          </form>

          <p className="mt-auto pt-10 text-sm text-muted-foreground">
            Don't have an account? <button type="button" onClick={() => soon("Sign up")} className="ml-1 font-semibold text-foreground hover:text-primary">Sign up</button>
          </p>
        </section>
      </div>
    </main>
  );
}
