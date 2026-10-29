import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
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

function GoogleIcon() {
  return (
    <svg viewBox="0 0 48 48" className="h-5 w-5 shrink-0" aria-hidden>
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}

const input =
  "h-12 w-full rounded-full border border-input bg-background px-5 text-sm text-foreground outline-none transition placeholder:text-muted-foreground focus:border-foreground focus:ring-2 focus:ring-ring/30";

function Login() {
  const [remember, setRemember] = useState(false);
  return (
    <main className="min-h-screen bg-secondary sm:p-6 lg:flex lg:items-center lg:justify-center lg:p-10">
      <div className="mx-auto grid min-h-screen w-full max-w-6xl bg-card sm:min-h-0 sm:rounded-3xl sm:shadow-xl lg:grid-cols-2 lg:p-6">
        <div className="relative h-56 sm:h-72 lg:order-2 lg:h-auto">
          <img
            src={hero}
            alt="Portrait in a linen blazer and red sunglasses"
            width={896}
            height={1152}
            className="h-full w-full object-cover object-top sm:rounded-t-3xl lg:rounded-2xl"
          />
        </div>

        <section className="flex flex-col items-center px-6 py-10 sm:px-12 lg:px-16 lg:py-12">
          <img src={logo.url} alt="FP logo" className="h-14 w-14 object-contain sm:h-16 sm:w-16" />

          <div className="mt-8 text-center lg:mt-14">
            <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">WELCOME BACK!</h1>
            <p className="mt-2 text-sm text-muted-foreground">Access your personal account by logging in.</p>
          </div>

          <form className="mt-8 w-full max-w-md space-y-5" onSubmit={(e) => e.preventDefault()}>
            <div className="space-y-2">
              <label htmlFor="email" className="text-sm font-medium text-foreground">Email Address or Username</label>
              <input id="email" type="text" placeholder="Enter your email" className={input} />
            </div>
            <div className="space-y-2">
              <label htmlFor="password" className="text-sm font-medium text-foreground">Password</label>
              <input id="password" type="password" placeholder="Enter your password" className={input} />
            </div>
            <div className="flex items-center justify-between gap-3 text-sm">
              <label className="flex cursor-pointer items-center gap-2 text-muted-foreground">
                <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} className="h-4 w-4 rounded-full accent-primary" />
                Remember me
              </label>
              <a href="#" className="font-medium text-foreground hover:text-primary">Forgot Password</a>
            </div>
            <button type="submit" className="h-12 w-full rounded-full bg-foreground text-sm font-medium text-background transition hover:bg-primary">
              Log In
            </button>
            <button type="button" className="flex h-12 w-full items-center justify-center gap-2 rounded-full border border-input bg-secondary text-sm font-medium text-foreground transition hover:bg-muted">
              <GoogleIcon /> Sign In with Google
            </button>
          </form>

          <p className="mt-10 text-sm text-muted-foreground lg:mt-auto lg:pt-12">
            Don't have an account ? <a href="#" className="ml-1 font-medium text-foreground hover:text-primary">Sign up</a>
          </p>
        </section>
      </div>
    </main>
  );
}
