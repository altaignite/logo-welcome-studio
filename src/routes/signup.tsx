import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { ArrowLeft, ArrowRight, Check, Eye, EyeOff, LockKeyhole, Loader2, PenLine, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CountryField } from "@/components/country-field";
import { usePopup } from "@/components/popup";
import { supabase } from "@/integrations/supabase/client";
import { agreementDocuments } from "@/lib/agreements";
import { createAccountNumber, accountSchema, countries, personalSchema, plans, type Plan, type CountryCode, type PersonalDetails, formatPhoneInput, switchPhoneCountry, phonePlaceholder } from "@/lib/signup";
import logo from "@/assets/logo.png.asset.json";
import { AgreementsList, PlanCards, ReviewRow, ReviewSection, SignDialog, formatAccountNumber } from "@/components/order-flow";

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

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="block space-y-1.5"><span className="block text-[13px] font-medium text-foreground">{label}<span className="text-primary">*</span></span>{children}</label>;
}

function Signup() {
  const [step, setStep] = useState(0);
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
    const { error } = await supabase.auth.signUp({
      email: account.email.trim(), password: account.password,
      options: { emailRedirectTo: window.location.origin, data: {
        account_number: accountNumber, first_name: personal.firstName.trim(), last_name: personal.lastName.trim(), company: personal.company.trim(),
        country: personal.country, phone: personal.phone, plan_id: selectedPlan.id, plan_name: selectedPlan.name,
        monthly_fee: selectedPlan.monthlyFee, monthly_hours: selectedPlan.monthlyHours,
      } },
    });
    if (error) {
      setConfirmOpen(false);
      popup({ type: "error", title: "We couldn't submit your application", description: /database error/i.test(error.message) ? "This email address can't be used. Disposable email addresses aren't accepted; please use your business or personal email." : error.message, primaryLabel: "Try again", onPrimary: openConfirmation, secondaryLabel: "Cancel" });
      return false;
    }
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
        <span className="text-sm font-semibold sm:hidden">{step < 5 ? steps[step] : step === 5 ? "Almost there…" : "Application complete"}</span>
        <div className="flex items-center gap-3">
          <span className="hidden text-sm text-muted-foreground sm:block">{step < 5 ? `${steps[step]} · ${step + 1} of 5` : step === 5 ? "Almost there…" : "Application complete"}</span>
          {step < 5 ? <Button variant="ghost" size="icon" aria-label="Close signup" onClick={() => popup({ type: "info", title: "Leave your application?", description: "Your details won't be saved.", primaryLabel: "Leave application", onPrimary: () => { navigate({ to: "/" }); }, secondaryLabel: "Keep going" })}><X /></Button> : <div className="size-9" />}
        </div>
      </div>
    </header>

    {step < 5 ? <>
      <div className={`mx-auto px-5 pb-8 pt-6 md:px-6 md:pt-8 ${step === 0 ? "max-w-4xl" : "max-w-lg"}`}>
        <div className="mb-6 text-center"><h1 className="text-2xl font-extrabold leading-tight lg:text-3xl">{titles[step]}</h1><p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground">{subtitles[step]}</p></div>
        {step === 0 && <div>
          <PlanCards onChoose={(plan) => { setSelectedPlan(plan); setStep(1); }} />
          <p className="mt-4 text-center text-sm text-muted-foreground">Already have an account? <Button asChild variant="link" className="h-auto p-0 font-semibold text-foreground"><Link to="/">Log in</Link></Button></p>
        </div>}
        {(step === 1 || step === 2) && <form onSubmit={advance} noValidate className="space-y-4">
          {step === 1 ? <>
            <div className="grid gap-4 sm:grid-cols-2"><Field label="First name"><input className="signup-input" autoComplete="given-name" value={personal.firstName} onChange={(e) => setPersonal({ ...personal, firstName: e.target.value })} maxLength={80} /></Field><Field label="Last name"><input className="signup-input" autoComplete="family-name" value={personal.lastName} onChange={(e) => setPersonal({ ...personal, lastName: e.target.value })} maxLength={80} /></Field></div>
            <Field label="Business name"><input className="signup-input" autoComplete="organization" value={personal.company} onChange={(e) => setPersonal({ ...personal, company: e.target.value })} maxLength={160} /></Field>
            <div className="space-y-1.5"><span className="block text-[13px] font-medium">Country<span className="text-primary">*</span></span><CountryField value={personal.country} onChange={setCountry} /></div>
            <div className="space-y-1.5"><label htmlFor="mobile" className="block text-[13px] font-medium">Mobile number<span className="text-primary">*</span></label><div className="signup-group"><CountryField phone value={phoneCountry} onChange={(v) => { phoneTouched.current = true; changePhoneCountry(v); }} /><input id="mobile" autoComplete="tel" type="tel" inputMode="tel" placeholder={phonePlaceholder(phoneCountry as CountryCode | "")} value={personal.phone} maxLength={24} onChange={(e) => typePhone(e.target.value)} className="h-full min-w-0 flex-1 bg-transparent px-3 text-[15px] outline-none sm:text-sm" /></div></div>
          </> : <>
            <Field label="Email Address"><input className="signup-input" type="email" inputMode="email" autoComplete="email" value={account.email} maxLength={254} onChange={(e) => setAccount({ ...account, email: e.target.value })} /></Field>
            <Field label="Password"><div className="relative"><input className="signup-input pr-12" type={showPassword ? "text" : "password"} autoComplete="new-password" maxLength={128} value={account.password} onChange={(e) => setAccount({ ...account, password: e.target.value })} /><Button variant="ghost" size="icon" type="button" aria-label={showPassword ? "Hide password" : "Show password"} className="absolute right-1 top-1/2 -translate-y-1/2" onClick={() => setShowPassword((s) => !s)}>{showPassword ? <EyeOff /> : <Eye />}</Button></div></Field>
            <p className="text-xs text-muted-foreground">At least 8 characters.</p>
            <Field label="Confirm password"><input className="signup-input" type={showPassword ? "text" : "password"} autoComplete="new-password" maxLength={128} value={account.confirmPassword} onChange={(e) => setAccount({ ...account, confirmPassword: e.target.value })} /></Field>
            <div className="flex gap-3 border-t pt-5 text-sm text-muted-foreground"><LockKeyhole className="size-5 shrink-0" /><p>Your account is created when you sign your agreement. We'll email you a link to confirm your address.</p></div>
          </>}
          <div className="flex items-center gap-3 pt-4"><Button type="button" variant="secondary" aria-label="Back" className="size-11 shrink-0 rounded-full" onClick={() => setStep(step - 1)}><ArrowLeft /></Button><Button type="submit" className="signup-primary flex-1">{step === 1 ? "Continue" : "Review application"}<ArrowRight /></Button></div>
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
      <div className="flex items-center justify-between gap-3 py-3"><dt className="text-muted-foreground">Account number</dt><dd className="flex items-center gap-2 font-semibold tabular-nums">{formatAccountNumber(accountNumber)}<button type="button" onClick={copy} className="text-xs font-medium text-primary hover:underline">{copied ? "Copied" : "Copy"}</button></dd></div>
      <div className="flex items-center justify-between gap-3 py-3"><dt className="text-muted-foreground">Plan</dt><dd className="font-semibold">{plan.name}, {plan.monthlyHours} hours / month, ${plan.monthlyFee}/month</dd></div>
    </dl>
    <ol className="mt-8">{timeline.map((item, i) => <li key={item.title} className="relative flex gap-4 pb-6 last:pb-0">
      {i < timeline.length - 1 && <span className={`absolute left-[11px] top-7 h-[calc(100%-1.5rem)] w-px ${item.state === "done" ? "bg-foreground" : "bg-border"}`} />}
      <span className={`relative grid size-6 shrink-0 place-items-center rounded-full ${item.state === "done" ? "bg-foreground text-background" : item.state === "current" ? "border-2 border-primary bg-background" : "border bg-background"}`}>{item.state === "done" ? <Check className="size-3.5" /> : item.state === "current" ? <span className="size-2 rounded-full bg-primary" /> : null}</span>
      <div className="min-w-0"><p className={`text-sm font-semibold ${item.state === "todo" ? "text-muted-foreground" : ""}`}>{item.title}{item.state === "current" && <span className="ml-2 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">Now</span>}</p><p className="mt-1 text-sm leading-relaxed text-muted-foreground">{item.text}</p></div>
    </li>)}</ol>
    <Button asChild className="signup-primary mt-8"><Link to="/">Go to sign in</Link></Button>
  </section>;
}

