import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { ArrowLeft, ArrowRight, Check, Eye, EyeOff, LockKeyhole, Loader2, PenLine, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CountryField } from "@/components/country-field";
import { MfaChallenge, mfaNeeded } from "@/components/mfa";
import { Spinner } from "@/components/loading";
import { useServerFn } from "@tanstack/react-start";
import { orderAdditionalPlan } from "@/lib/client.functions";
import { usePopup } from "@/components/popup";
import { isUnconfirmedEmail, unconfirmedPopup } from "@/lib/email-confirmation";
import { supabase } from "@/integrations/supabase/client";
import { agreementDocuments } from "@/lib/agreements";
import { createAccountNumber, accountSchema, countries, personalSchema, plans, type Plan, type CountryCode, type PersonalDetails, formatPhoneInput, switchPhoneCountry, phonePlaceholder, phoneNational } from "@/lib/signup";
import logo from "@/assets/logo.png.asset.json";
import { AgreementsList, OrderWizard, PlanCards, ReviewRow, ReviewSection, SignDialog, formatAccountNumber } from "@/components/order-flow";

export const Route = createFileRoute("/signup")({
  head: () => ({ meta: [
    { title: "Join FP — Marketing Accelerator" },
    { name: "description", content: "Choose your FP marketing acceleration subscription from $199 per month, with marketing, design and development and a 90-day service-fee guarantee." },
    { property: "og:title", content: "Join FP — Marketing Accelerator" },
    { property: "og:description", content: "Marketing, design and development from $199/month. Start your FP application." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" },
  ] }),
  component: Signup,
});

const steps = ["Your plan", "Personal details", "Create account", "Review", "Agreements"];
const titles = ["CHOOSE YOUR PLAN", "Let's get to know you.", "Make it yours.", "Almost there!", "Your agreements"];
const subtitles = ["Marketing, design & development. A monthly hours allowance that fits your ambition.", "The person and business behind the ambition.", "Create your FP login details.", "Please check your details carefully.", "Read your agreements before proceeding. Save a copy for your records."];

const gateTitles = {
  email: ["What's your email?", "We'll check whether you already have an FP account."],
  password: ["Welcome back.", "Sign in to add this plan to your existing account."],
  mfa: ["One more step.", "Enter the code from your authenticator app."],
} as const;

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="block space-y-1.5"><span className="block text-[13px] font-medium text-foreground">{label}<span className="text-primary">*</span></span>{children}</label>;
}

function Signup() {
  const [step, setStep] = useState(0);
  // Email first: "email" asks for it, "password" signs an existing account in, null continues as a new client.
  const [gate, setGate] = useState<"email" | "password" | "mfa" | null>("email");
  const [existing, setExisting] = useState(false);
  const [gateBusy, setGateBusy] = useState(false);
  const [loginPassword, setLoginPassword] = useState("");
  const [selectedPlan, setSelectedPlan] = useState<Plan>(plans[0]);
  const [personal, setPersonal] = useState<PersonalDetails>({ firstName: "", lastName: "", company: "", country: "", phone: "" });
  const [phoneCountry, setPhoneCountry] = useState<string>("");
  const [account, setAccount] = useState({ email: "", password: "", confirmPassword: "" });
  const [showPassword, setShowPassword] = useState(false);
  const [accountNumber, setAccountNumber] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [signature, setSignature] = useState<{ name: string; at: string } | null>(null);
  const documents = agreementDocuments(selectedPlan, { name: `${personal.firstName} ${personal.lastName}`.trim(), company: personal.company, email: account.email, phone: personal.phone, country: personal.country, accountNumber }, signature?.at);
  const phoneTouched = useRef(false);
  const countryTouched = useRef(false);
  const popup = usePopup();
  const navigate = useNavigate();

  useEffect(() => {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 5000);
    fetch("https://ipapi.co/json/", { signal: controller.signal, credentials: "omit", referrerPolicy: "no-referrer" })
      .then((response) => response.ok ? response.json() : null)
      .then((data: unknown) => {
        if (!data || typeof data !== "object" || !("country_code" in data)) return;
        const detected = countries.find((c) => c.code === data.country_code);
        if (!detected) return;
        if (!countryTouched.current) setPersonal((p) => ({ ...p, country: detected.code }));
        if (!phoneTouched.current) {
          setPhoneCountry(detected.code);
          setPersonal((p) => (p.phone ? p : { ...p, phone: `${detected.dial} ` }));
        }
      }).catch(() => {}).finally(() => window.clearTimeout(timeout));
    return () => { controller.abort(); window.clearTimeout(timeout); };
  }, []);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" });
  }, [step]);

  const setCountry = (country: CountryCode) => {
    countryTouched.current = true;
    setPersonal((p) => ({ ...p, country }));
    if (!phoneTouched.current) changePhoneCountry(country);
  };
  const changePhoneCountry = (country: CountryCode) => {
    setPersonal((p) => ({ ...p, phone: switchPhoneCountry(p.phone, phoneCountry as CountryCode | "", country) }));
    setPhoneCountry(country);
  };
  const typePhone = (raw: string) => {
    phoneTouched.current = true;
    const next = formatPhoneInput(raw, phoneCountry as CountryCode | "");
    setPhoneCountry(next.country);
    setPersonal((p) => ({ ...p, phone: next.value }));
  };
  const checkEmail = async (event: FormEvent) => {
    event.preventDefault();
    const email = account.email.trim();
    const valid = accountSchema.innerType().shape.email.safeParse(email);
    if (!valid.success) { popup({ type: "error", title: "Let's check your email", description: valid.error.issues[0]?.message ?? "Enter a valid email address.", primaryLabel: "Try again", secondaryLabel: null }); return; }
    setGateBusy(true);
    try {
      const r = await fetch("/api/public/account-check", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email }) });
      const body = (await r.json().catch(() => ({}))) as { exists?: boolean; error?: string };
      if (!r.ok) throw new Error(body.error ?? "We couldn't check your email. Please try again.");
      setGate(body.exists ? "password" : null);
    } catch (e) { popup({ type: "error", title: "We couldn't check your email", description: (e as Error).message, primaryLabel: "Close", secondaryLabel: null }); }
    finally { setGateBusy(false); }
  };
  const signIn = async (event: FormEvent) => {
    event.preventDefault();
    if (!loginPassword) return;
    setGateBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email: account.email.trim(), password: loginPassword });
    if (error) {
      setGateBusy(false);
      // The plan is kept: after confirming, the client comes back to this tab and signs in.
      if (isUnconfirmedEmail(error)) { popup(unconfirmedPopup(account.email.trim(), popup, "/signup")); return; }
      popup({ type: "error", title: /banned/i.test(error.message) ? "Your account is suspended" : "That password didn't work", description: /banned/i.test(error.message) ? "Please contact our support team to restore access." : "Check your password and try again, or reset it below.", primaryLabel: "Try again", secondaryLabel: null });
      return;
    }
    setLoginPassword("");
    try {
      if (await mfaNeeded()) { setGate("mfa"); return; }
      setGate(null); setExisting(true);
    } catch (e) { popup({ type: "error", title: "We couldn't finish signing you in", description: (e as Error).message, primaryLabel: "Close", secondaryLabel: null }); }
    finally { setGateBusy(false); }
  };
  const forgot = async () => {
    await supabase.auth.resetPasswordForEmail(account.email.trim(), { redirectTo: `${window.location.origin}/reset-password` });
    popup({ type: "success", title: "Check your email", description: `We sent a reset link to ${account.email.trim()}. Set a new password in the tab it opens, then come back here and sign in. Your order is kept on this page.`, primaryLabel: "Got it", secondaryLabel: null });
  };
  const advance = (event: FormEvent) => {
    event.preventDefault();
    const result = step === 1 ? personalSchema.safeParse(personal) : step === 2 ? accountSchema.safeParse(account) : null;
    if (result && !result.success) {
      popup({ type: "error", title: "Let's check your details", description: result.error.issues[0]?.message ?? "Please check your information.", primaryLabel: "Try again", secondaryLabel: null });
      return;
    }
    if (step === 2 && !accountNumber) setAccountNumber(createAccountNumber());
    setStep((s) => s + 1);
  };
  const openConfirmation = () => setConfirmOpen(true);
  const accept = async (): Promise<boolean> => {
    const { data, error } = await supabase.auth.signUp({
      email: account.email.trim(), password: account.password,
      options: { emailRedirectTo: window.location.origin, data: {
        account_number: accountNumber, first_name: personal.firstName.trim(), last_name: personal.lastName.trim(), company: personal.company.trim(),
        country: personal.country, phone: personal.phone, plan_id: selectedPlan.id, plan_name: selectedPlan.name,
        monthly_fee: selectedPlan.monthlyFee, monthly_hours: selectedPlan.monthlyHours,
      } },
    });
    if (error) {
      setConfirmOpen(false);
      popup({ type: "error", title: "We couldn't submit your application", description: /database error/i.test(error.message) ? "We couldn't create your account with these details. Please check your name, business, country and mobile number, and use your business or personal email (disposable addresses aren't accepted)." : error.message, primaryLabel: "Try again", onPrimary: openConfirmation, secondaryLabel: "Cancel" });
      return false;
    }
    // Supabase doesn't reveal existing emails: it returns a user with no identities and creates nothing. Send them to sign in instead.
    if (data.user && (data.user.identities?.length ?? 0) === 0) {
      setConfirmOpen(false);
      popup({ type: "info", title: "You already have an account", description: `Sign in to add the ${selectedPlan.name} plan to your existing account.`, primaryLabel: "Sign in", onPrimary: () => { setStep(1); setGate("password"); }, secondaryLabel: null });
      return false;
    }
    // Security checks run when the account is created (for example a mobile number already used by another account).
    try {
      const r = await fetch("/api/public/account-check", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: account.email.trim() }) });
      if (r.ok && ((await r.json()) as { restricted?: boolean }).restricted) { setConfirmOpen(false); window.location.assign("/kyc"); return true; }
    } catch { /* the check is best effort; staff still see the flag */ }
    setSignature({ name: `${personal.firstName} ${personal.lastName}`, at: new Date().toISOString() });
    setStep(5);
    return true;
  };


  return <main className="min-h-dvh bg-background text-foreground">
    <div className="relative w-full">
      <section className="min-w-0">
    <header className="border-b bg-background">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5 sm:h-20 sm:px-8">
        <div className="flex items-center gap-4">
          <Link to="/" aria-label="FP home"><img src={logo.url} alt="FP" className="size-9 object-contain sm:size-11" /></Link>
          <span aria-hidden className="hidden h-8 w-px bg-border sm:block" />
          <span className="hidden text-sm font-semibold tracking-tight sm:block">New Service Application</span>
        </div>
        <span className="text-sm font-semibold sm:hidden">{existing ? "Add a plan" : step === 1 && gate ? (gate === "email" ? "Your email" : "Sign in") : step < 5 ? steps[step] : step === 5 ? "Almost there…" : "Application complete"}</span>
        <div className="flex items-center gap-3">
          <span className="hidden text-sm text-muted-foreground sm:block">{existing ? "Add a plan" : step === 1 && gate ? (gate === "email" ? "Your email" : "Sign in") : step < 5 ? `${steps[step]} · ${step + 1} of 5` : step === 5 ? "Almost there…" : "Application complete"}</span>
          {step < 5 ? <Button variant="ghost" size="icon" aria-label="Close signup" onClick={() => popup({ type: "info", title: "Leave your application?", description: "Your details won't be saved.", primaryLabel: "Leave application", onPrimary: () => { navigate({ to: "/" }); }, secondaryLabel: "Keep going" })}><X /></Button> : <div className="size-9" />}
        </div>
      </div>
    </header>

    {existing ? <ExistingClientOrder plan={selectedPlan} onDone={() => navigate({ to: "/dashboard" })} /> : step < 5 ? <>
      <div className={`mx-auto px-5 pb-8 pt-6 md:px-6 md:pt-8 ${step === 0 ? "max-w-4xl" : "max-w-lg"}`}>
        <div className="mb-6 text-center"><h1 className="text-2xl font-extrabold leading-tight lg:text-3xl">{step === 1 && gate ? gateTitles[gate][0] : titles[step]}</h1><p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground">{step === 1 && gate ? gateTitles[gate][1] : subtitles[step]}</p></div>
        {step === 0 && <div>
          <PlanCards onChoose={async (plan) => {
            setSelectedPlan(plan);
            // Someone already signed in adds the plan to their account right here.
            const { data } = await supabase.auth.getSession();
            if (data.session && !(await mfaNeeded())) { setExisting(true); return; }
            setGate("email"); setStep(1);
          }} />
          <p className="mt-4 text-center text-sm text-muted-foreground">Already a client? Choose a plan and sign in with your email to add it to your account.</p>
        </div>}
        {step === 1 && gate === "email" && <form onSubmit={checkEmail} noValidate className="space-y-4">
          <Field label="Email Address"><input className="signup-input" type="email" inputMode="email" autoComplete="email" autoFocus value={account.email} maxLength={254} onChange={(e) => setAccount({ ...account, email: e.target.value })} /></Field>
          <p className="text-xs text-muted-foreground">Already a client? Use the email you sign in with and we'll add this plan to your account.</p>
          <div className="flex items-center gap-3 pt-4"><Button type="button" variant="secondary" aria-label="Back" className="size-11 shrink-0 rounded-full" onClick={() => setStep(0)}><ArrowLeft /></Button><Button type="submit" disabled={gateBusy} className="signup-primary flex-1">{gateBusy ? <Loader2 className="animate-spin" /> : null}Continue<ArrowRight /></Button></div>
        </form>}
        {step === 1 && gate === "password" && <form onSubmit={signIn} noValidate className="space-y-4">
          <div className="flex items-center justify-between gap-3 border-b pb-3 text-sm"><span className="min-w-0 truncate">{account.email}</span><button type="button" className="shrink-0 text-xs font-medium underline underline-offset-4" onClick={() => { setGate("email"); setLoginPassword(""); }}>Change</button></div>
          <Field label="Password"><div className="relative"><input className="signup-input pr-12" type={showPassword ? "text" : "password"} autoComplete="current-password" autoFocus maxLength={128} value={loginPassword} onChange={(e) => setLoginPassword(e.target.value)} /><Button variant="ghost" size="icon" type="button" aria-label={showPassword ? "Hide password" : "Show password"} className="absolute right-1 top-1/2 -translate-y-1/2" onClick={() => setShowPassword((v) => !v)}>{showPassword ? <EyeOff /> : <Eye />}</Button></div></Field>
          <button type="button" className="text-xs font-medium underline underline-offset-4" onClick={forgot}>Forgot your password?</button>
          <div className="flex items-center gap-3 pt-4"><Button type="button" variant="secondary" aria-label="Back" className="size-11 shrink-0 rounded-full" onClick={() => setGate("email")}><ArrowLeft /></Button><Button type="submit" disabled={gateBusy} className="signup-primary flex-1">{gateBusy ? <Loader2 className="animate-spin" /> : null}Sign in and continue<ArrowRight /></Button></div>
        </form>}
        {step === 1 && gate === "mfa" && <MfaChallenge onDone={() => { setGate(null); setExisting(true); }} onCancel={async () => { await supabase.auth.signOut(); setGate("password"); }} />}
        {(step === 2 || (step === 1 && gate === null)) && <form onSubmit={advance} noValidate className="space-y-4">
          {step === 1 ? <>
            <div className="grid gap-4 sm:grid-cols-2"><Field label="First name"><input className="signup-input" autoComplete="given-name" value={personal.firstName} onChange={(e) => setPersonal({ ...personal, firstName: e.target.value })} maxLength={80} /></Field><Field label="Last name"><input className="signup-input" autoComplete="family-name" value={personal.lastName} onChange={(e) => setPersonal({ ...personal, lastName: e.target.value })} maxLength={80} /></Field></div>
            <Field label="Business name"><input className="signup-input" autoComplete="organization" value={personal.company} onChange={(e) => setPersonal({ ...personal, company: e.target.value })} maxLength={160} /></Field>
            <div className="space-y-1.5"><span className="block text-[13px] font-medium">Country<span className="text-primary">*</span></span><CountryField value={personal.country} onChange={setCountry} /></div>
            <div className="space-y-1.5"><label htmlFor="mobile" className="block text-[13px] font-medium">Mobile number<span className="text-primary">*</span></label><div className="signup-group"><CountryField phone value={phoneCountry} onChange={(v) => { phoneTouched.current = true; changePhoneCountry(v); }} /><input id="mobile" autoComplete="tel" type="tel" inputMode="tel" placeholder={phonePlaceholder(phoneCountry as CountryCode | "")} value={phoneNational(personal.phone, phoneCountry as CountryCode | "")} maxLength={24} onChange={(e) => typePhone(e.target.value)} className="h-full min-w-0 flex-1 bg-transparent px-3 text-[15px] outline-none sm:text-sm" /></div></div>
          </> : <>
            <div className="flex items-center justify-between gap-3 border-b pb-3 text-sm"><span className="min-w-0 truncate">{account.email}</span><button type="button" className="shrink-0 text-xs font-medium underline underline-offset-4" onClick={() => { setStep(1); setGate("email"); }}>Change</button></div>
            <Field label="Password"><div className="relative"><input className="signup-input pr-12" type={showPassword ? "text" : "password"} autoComplete="new-password" maxLength={128} value={account.password} onChange={(e) => setAccount({ ...account, password: e.target.value })} /><Button variant="ghost" size="icon" type="button" aria-label={showPassword ? "Hide password" : "Show password"} className="absolute right-1 top-1/2 -translate-y-1/2" onClick={() => setShowPassword((s) => !s)}>{showPassword ? <EyeOff /> : <Eye />}</Button></div></Field>
            <p className="text-xs text-muted-foreground">At least 8 characters.</p>
            <Field label="Confirm password"><input className="signup-input" type={showPassword ? "text" : "password"} autoComplete="new-password" maxLength={128} value={account.confirmPassword} onChange={(e) => setAccount({ ...account, confirmPassword: e.target.value })} /></Field>
            <div className="flex gap-3 border-t pt-5 text-sm text-muted-foreground"><LockKeyhole className="size-5 shrink-0" /><p>Your account is created when you sign your agreement. We'll email you a link to confirm your address.</p></div>
          </>}
          <div className="flex items-center gap-3 pt-4"><Button type="button" variant="secondary" aria-label="Back" className="size-11 shrink-0 rounded-full" onClick={() => (step === 1 ? setGate("email") : setStep(step - 1))}><ArrowLeft /></Button><Button type="submit" className="signup-primary flex-1">{step === 1 ? "Continue" : "Review application"}<ArrowRight /></Button></div>
        </form>}
        {step === 3 && <div>
          <ReviewSection title="Your application" onEdit={() => setStep(0)}><ReviewRow label="Plan" value={selectedPlan.name} /><ReviewRow label="Service fee" value={`$${selectedPlan.monthlyFee} / month`} /><ReviewRow label="Assigned monthly hours" value={`${selectedPlan.monthlyHours} hours shared across all services; not unlimited`} /><ReviewRow label="Included services" value="Marketing, design & development" /><ReviewRow label="Money-back guarantee" value="90 days if no sales are received. Service fees only; advertising budgets excluded." /></ReviewSection>
          <ReviewSection title="Personal information" onEdit={() => setStep(1)}><ReviewRow label="Full name" value={`${personal.firstName} ${personal.lastName}`} /><ReviewRow label="Business" value={personal.company} /><ReviewRow label="Country" value={countries.find((c) => c.code === personal.country)?.name ?? ""} country={personal.country} /><ReviewRow label="Mobile number" value={personal.phone} /></ReviewSection>
          <ReviewSection title="Account details" onEdit={() => setStep(2)}><ReviewRow label="Account number" value={formatAccountNumber(accountNumber)} /><ReviewRow label="Email Address" value={account.email} /></ReviewSection>
          <Button className="signup-primary mt-6" onClick={() => setStep(4)}>To your agreements <ArrowRight /></Button>
        </div>}
        {step === 4 && <div>
          <AgreementsList documents={documents} />
          <p className="mt-4 text-xs leading-relaxed text-muted-foreground">Please read each document. By accepting, you agree to each of them and sign digitally with a confirmation code. You can save a PDF copy of each now, and the signed copies stay in your dashboard.</p>
          <div className="mt-5 flex gap-3"><Button variant="secondary" aria-label="Back to review" className="size-11 shrink-0 rounded-full" onClick={() => setStep(3)}><ArrowLeft /></Button><Button className="signup-primary flex-1" onClick={openConfirmation}>Accept & continue <PenLine /></Button></div>
        </div>}
      </div>
    </> : step === 5 ? <ProcessingScreen hours={selectedPlan.monthlyHours} accountNumber={accountNumber} onDone={() => { setAccount((a) => ({ ...a, password: "", confirmPassword: "" })); setStep(6); }} /> : <SuccessScreen name={personal.firstName} accountNumber={accountNumber} plan={selectedPlan} signedAt={signature?.at ?? new Date().toISOString()} email={account.email} />}

      </section>
    </div>
    <SignDialog open={confirmOpen} onOpenChange={setConfirmOpen} title="Confirm your application" onSign={accept} />
  </main>;
}

const processingStages = (hours: number) => [
  { label: "Verifying your details", ms: 1400 },
  { label: "Securing your digital signature", ms: 1200 },
  { label: `Reserving your ${hours} monthly service hours`, ms: 1600 },
  { label: "Preparing your agreements", ms: 1400 },
  { label: "Finalising your application", ms: 1000 },
];

function ProcessingScreen({ hours, accountNumber, onDone }: { hours: number; accountNumber: string; onDone: () => void }) {
  const stages = processingStages(hours);
  const total = stages.reduce((sum, s) => sum + s.ms, 0);
  const [elapsed, setElapsed] = useState(0);
  const done = useRef(onDone); done.current = onDone;
  useEffect(() => {
    const start = performance.now();
    const timer = window.setInterval(() => {
      const t = performance.now() - start;
      setElapsed(t);
      if (t >= total + 400) { window.clearInterval(timer); done.current(); }
    }, 100);
    return () => window.clearInterval(timer);
  }, [total]);
  let acc = 0; let current = stages.length; let progress = 100;
  for (const [i, stage] of stages.entries()) {
    if (elapsed < acc + stage.ms) {
      current = i;
      const t = (elapsed - acc) / stage.ms;
      const eased = t < 0.75 ? 1 - Math.pow(1 - t / 0.75, 2) : 1; // move, then pause like real work
      progress = ((acc + stage.ms * eased * 0.96) / total) * 100;
      break;
    }
    acc += stage.ms;
  }
  return <section className="mx-auto max-w-lg px-5 pb-16 pt-10 md:px-6 md:pt-14" aria-live="polite">
    <div className="text-center"><h1 className="text-2xl font-bold sm:text-3xl">Processing your application</h1><p className="mx-auto mt-3 max-w-sm text-sm leading-relaxed text-muted-foreground">Please keep this page open. This only takes a few seconds.</p></div>
    <p className="mt-4 text-center text-sm text-muted-foreground">Account number <span className="font-semibold tabular-nums text-foreground">{formatAccountNumber(accountNumber)}</span></p>
    <div className="mt-8"><div className="flex justify-between text-xs text-muted-foreground"><span>{stages[current]?.label ?? "Complete"}…</span><span className="tabular-nums">{Math.floor(progress)}%</span></div>
      <div role="progressbar" aria-label="Processing application" aria-valuenow={Math.floor(progress)} aria-valuemin={0} aria-valuemax={100} className="relative mt-2 h-1.5 overflow-hidden rounded-full bg-secondary"><div className="h-full rounded-full bg-foreground transition-[width] duration-300 ease-out" style={{ width: `${progress}%` }} /><div className="signup-shimmer pointer-events-none absolute inset-0 bg-gradient-to-r from-transparent via-background/40 to-transparent" /></div></div>
    <ol className="mt-8 space-y-1">{stages.map((stage, i) => {
      const state = i < current ? "done" : i === current ? "active" : "todo";
      return <li key={stage.label} className={`flex items-center gap-3 rounded-xl px-3 py-3 text-sm ${state === "active" ? "bg-secondary font-medium" : ""} ${state === "todo" ? "text-muted-foreground" : ""}`}>
        <span className={`grid size-6 shrink-0 place-items-center rounded-full ${state === "done" ? "bg-foreground text-background" : "border"}`}>{state === "done" ? <Check className="size-3.5" /> : state === "active" ? <Loader2 className="size-3.5 animate-spin" /> : null}</span>{stage.label}</li>;
    })}</ol>
  </section>;
}


function SuccessScreen({ name, accountNumber, plan, signedAt, email }: { name: string; accountNumber: string; plan: Plan; signedAt: string; email: string }) {
  const popup = usePopup();
  // Supabase allows one confirmation email a minute, so the link counts down instead of failing.
  const [cooldown, setCooldown] = useState(60);
  useEffect(() => { if (cooldown <= 0) return; const t = window.setTimeout(() => setCooldown((c) => c - 1), 1000); return () => window.clearTimeout(t); }, [cooldown]);
  const resend = async () => {
    const { error } = await supabase.auth.resend({ type: "signup", email, options: { emailRedirectTo: window.location.origin } });
    if (error) { popup({ type: "error", title: "We couldn't resend the email", description: /seconds|rate|security purposes/i.test(error.message) ? "Please wait a minute and try again." : error.message, primaryLabel: "Close", secondaryLabel: null }); return; }
    setCooldown(60);
    popup({ type: "success", title: "Confirmation email sent", description: `We sent a new link to ${email}. Check your spam or promotions folder if you don't see it within a few minutes.`, primaryLabel: "Got it", secondaryLabel: null });
  };
  const [copied, setCopied] = useState(false);
  const copy = () => { void navigator.clipboard?.writeText(accountNumber).then(() => { setCopied(true); window.setTimeout(() => setCopied(false), 1800); }).catch(() => {}); };
  const time = new Date(signedAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
  const timeline = [
    { title: "Application submitted", text: time, state: "done" },
    { title: "Agreement signed digitally", text: "Your confirmation code was accepted.", state: "done" },
    { title: "Confirm your email", text: `We sent a link to ${email}. Open it to activate your dashboard login.`, state: "current" },
    { title: "Account review", text: "We're checking your details, usually within 1 business day. We'll email you with any update.", state: "todo" },
    { title: "Onboarding call", text: `We'll contact you at ${email} to plan your first month.`, state: "todo" },
    { title: "Your accelerator starts", text: `${plan.monthlyHours} service hours assigned every month.`, state: "todo" },
  ] as const;
  return <section className="mx-auto max-w-lg px-5 pb-12 pt-8 md:px-6 md:pt-12">
    <div className="text-center"><span className="mx-auto grid size-14 place-items-center rounded-full bg-foreground text-background"><Check className="size-7" /></span><h1 className="mt-5 text-2xl font-bold leading-tight sm:text-3xl">Application submitted, {name}!</h1><p className="mx-auto mt-3 max-w-sm text-sm leading-relaxed text-muted-foreground">Confirm your email to activate your login. Here's what happens next.</p></div>
    <dl className="mt-8 divide-y border-y text-sm">
      <div className="flex items-center justify-between gap-3 py-3"><dt className="text-muted-foreground">Account number</dt><dd className="flex items-center gap-2 font-semibold tabular-nums">{formatAccountNumber(accountNumber)}<button type="button" onClick={copy} className="text-xs font-medium underline underline-offset-4 hover:text-muted-foreground">{copied ? "Copied" : "Copy"}</button></dd></div>
      <div className="flex items-center justify-between gap-3 py-3"><dt className="text-muted-foreground">Plan</dt><dd className="font-semibold">{plan.name}, {plan.monthlyHours} hours / month, ${plan.monthlyFee}/month</dd></div>
    </dl>
    <ol className="mt-8">{timeline.map((item, i) => <li key={item.title} className="relative flex gap-4 pb-6 last:pb-0">
      {i < timeline.length - 1 && <span className={`absolute left-[11px] top-7 h-[calc(100%-1.5rem)] w-px ${item.state === "done" ? "bg-foreground" : "bg-border"}`} />}
      <span className={`relative grid size-6 shrink-0 place-items-center rounded-full ${item.state === "done" ? "bg-foreground text-background" : item.state === "current" ? "border-2 border-primary bg-background" : "border bg-background"}`}>{item.state === "done" ? <Check className="size-3.5" /> : item.state === "current" ? <span className="size-2 rounded-full bg-primary" /> : null}</span>
      <div className="min-w-0"><p className={`text-sm font-semibold ${item.state === "todo" ? "text-muted-foreground" : ""}`}>{item.title}{item.state === "current" && <span className="ml-2 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">Now</span>}</p><p className="mt-1 text-sm leading-relaxed text-muted-foreground">{item.text}</p></div>
    </li>)}</ol>
    <Button asChild className="signup-primary mt-8"><Link to="/">Go to sign in</Link></Button>
    <p className="mt-4 text-center text-xs text-muted-foreground">Didn't get the email? Check your spam folder, or{" "}
      <button type="button" disabled={cooldown > 0} onClick={resend} className="font-medium text-foreground underline underline-offset-4 disabled:no-underline disabled:opacity-60">{cooldown > 0 ? `resend in ${cooldown}s` : "resend it"}</button>.</p>
  </section>;
}


/** An existing client who signed in during signup adds the chosen plan to their account without leaving the flow. */
function ExistingClientOrder({ plan, onDone }: { plan: Plan; onDone: () => void }) {
  const fnOrder = useServerFn(orderAdditionalPlan);
  const [client, setClient] = useState<Parameters<typeof OrderWizard>[0]["client"] | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    void (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) { setFailed(true); return; }
      const { data: p } = await supabase.from("profiles").select("first_name, last_name, company, email, phone, country, address_line, city, state, postal_code, account_number").eq("id", u.user.id).maybeSingle();
      if (!p) { setFailed(true); return; }
      const address = [p.address_line, [p.city, p.state, p.postal_code].filter(Boolean).join(" ")].filter(Boolean).join(", ") || null;
      setClient({ name: `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim() || (p.email ?? ""), company: p.company, email: p.email ?? u.user.email ?? null, phone: p.phone, country: p.country, address, accountNumber: p.account_number });
    })().catch(() => setFailed(true));
  }, []);
  return <div className="px-5 pt-6 md:px-6 md:pt-8">
    {failed ? <p className="mx-auto max-w-lg text-center text-sm text-muted-foreground">We couldn't load your account. Please refresh the page and try again.</p>
      : !client ? <div className="grid place-items-center py-16"><Spinner /></div>
      : <OrderWizard mode="client" initialPlan={plan.id} doneLabel="Go to my dashboard" client={client} onPlace={async (p) => { await fnOrder({ data: { planId: p.id, signed: true } }); }} onDone={onDone} />}
  </div>;
}
