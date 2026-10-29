import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { ArrowLeft, ArrowRight, Check, Clock, Code2, Megaphone, Palette, ChevronDown, Download, Eye, EyeOff, LockKeyhole, Loader2, PenLine, RefreshCw, Rocket, ShieldCheck, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CountryField, CountryFlag } from "@/components/country-field";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { usePopup } from "@/components/popup";
import { accountSchema, countries, createSignatureCode, isSignatureMatch, personalSchema, plans, planTerms, type Plan, type CountryCode, type PersonalDetails } from "@/lib/signup";
import logo from "@/assets/logo.png.asset.json";

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
const baseDocuments = [
  { title: "Client Agreement", body: "FP Marketing Accelerator\n\nYour monthly subscription covers marketing, design and development services within your assigned monthly service hours. Services are not unlimited. Advertising budgets are excluded and are separate from service fees." },
  { title: "Subscription Agreement", body: "Marketing Accelerator subscription\n\nService fee: $199 per month. Includes marketing, design and development. Does not include advertising budgets." },
  { title: "90-day Money-back Guarantee", body: "90-day money-back guarantee\n\nIf no sales are received within 90 days, the money-back guarantee applies to service fees only. Advertising budgets are not covered." },
  { title: "Privacy Information", body: "Privacy\n\nPersonal details and passwords in this demonstration stay in this browser page, are not submitted, and clear when the page is refreshed." },
];

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="block space-y-2 text-sm font-medium text-foreground"><span>{label}</span>{children}</label>;
}

function Signup() {
  const [step, setStep] = useState(0);
  const [selectedPlan, setSelectedPlan] = useState<Plan>(plans[0]);
  const documents = baseDocuments.map((doc, index) => index === 1 ? { ...doc, body: `FP Subscription Agreement\n\n${planTerms(selectedPlan)}` } : doc);
  const [personal, setPersonal] = useState<PersonalDetails>({ firstName: "", lastName: "", company: "", country: "", phone: "" });
  const [phoneCountry, setPhoneCountry] = useState<string>("");
  const [account, setAccount] = useState({ email: "", password: "", confirmPassword: "" });
  const [showPassword, setShowPassword] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [code, setCode] = useState("");
  const [entered, setEntered] = useState("");
  const [documentIndex, setDocumentIndex] = useState<number | null>(null);
  const [signature, setSignature] = useState<{ name: string; at: string; code: string } | null>(null);
  const usedCodes = useRef(new Set<string>());
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
          setPersonal((p) => ({ ...p, phone: `${detected.dial} ` }));
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
    const oldDial = countries.find((c) => c.code === phoneCountry)?.dial;
    const nextDial = countries.find((c) => c.code === country)?.dial;
    setPhoneCountry(country);
    setPersonal((p) => ({ ...p, phone: `${nextDial ?? ""} ${oldDial && p.phone.startsWith(oldDial) ? p.phone.slice(oldDial.length).trim() : p.phone.replace(/^\+\d+\s*/, "")}` }));
  };
  const advance = (event: FormEvent) => {
    event.preventDefault();
    const result = step === 1 ? personalSchema.safeParse(personal) : step === 2 ? accountSchema.safeParse(account) : null;
    if (result && !result.success) {
      popup({ type: "error", title: "Let's check your details", description: result.error.issues[0]?.message ?? "Please check your information.", primaryLabel: "Try again", secondaryLabel: null });
      return;
    }
    setStep((s) => s + 1);
  };
  const newCode = () => { const next = createSignatureCode(usedCodes.current); usedCodes.current.add(next); setCode(next); setEntered(""); };
  const openConfirmation = () => { newCode(); setConfirmOpen(true); };
  const accept = () => {
    if (!isSignatureMatch(code, entered)) {
      setConfirmOpen(false);
      popup({ type: "error", title: "The code doesn't match", description: "Please try again with a new confirmation code.", primaryLabel: "Try again", onPrimary: openConfirmation, secondaryLabel: "Cancel" });
      return;
    }
    setSignature({ name: `${personal.firstName} ${personal.lastName}`, at: new Date().toISOString(), code });
    setConfirmOpen(false); setStep(5);
  };
  const downloadDocument = (index: number) => {
    const doc = documents[index]; if (!doc) return;
    const url = URL.createObjectURL(new Blob([doc.body], { type: "text/plain" }));
    const link = document.createElement("a"); link.href = url; link.download = `${doc.title.toLowerCase().replaceAll(/[^a-z0-9]+/g, "-")}.txt`; link.click(); URL.revokeObjectURL(url);
  };
  const selectedDoc = documentIndex === null ? null : documents[documentIndex];

  return <main className="min-h-dvh bg-background text-foreground md:flex md:items-start md:justify-center md:bg-secondary md:p-5 lg:items-center lg:p-8">
    <div className="relative mx-auto w-full max-w-2xl md:rounded-[2rem] md:bg-card md:p-4 md:shadow-2xl lg:p-6">
      <section className="min-w-0 md:px-3 lg:px-6">
    <header className="border-b bg-background md:border-none">
      <div className="mx-auto flex h-16 items-center justify-between px-5 sm:h-20 md:px-2">
        <Link to="/" aria-label="FP home"><img src={logo.url} alt="FP" className="size-9 object-contain sm:size-11" /></Link>
        <span className="text-sm font-semibold">{step < 5 ? steps[step] : step === 5 ? "Almost there…" : "Application complete"}</span>
        {step < 5 ? <Button variant="ghost" size="icon" aria-label="Close signup" onClick={() => popup({ type: "info", title: "Leave your application?", description: "Your details won't be saved.", primaryLabel: "Leave application", onPrimary: () => { navigate({ to: "/" }); }, secondaryLabel: "Keep going" })}><X /></Button> : <div className="size-9" />}
      </div>
    </header>

    {step < 5 ? <>
      <nav aria-label="Application progress" className="mx-auto px-5 pt-4 md:px-2">
        <ol className="flex gap-2 sm:gap-4">{steps.map((name, index) => <li key={name} className="min-w-0 flex-1"><div className={`h-1 rounded-full ${index <= step ? "bg-primary" : "bg-secondary"}`} /><span className={`mt-2 hidden text-xs xl:block ${index === step ? "font-semibold text-foreground" : "text-muted-foreground"}`}>{index + 1}. {name}</span></li>)}</ol>
        <p className="mt-2 text-xs text-muted-foreground xl:hidden">Step {step + 1} of 5</p>
      </nav>
      <div className="mx-auto max-w-lg px-5 pb-8 pt-6 md:px-2 md:pt-8">
        <div className="mb-6 text-center"><h1 className="text-2xl font-extrabold leading-tight lg:text-3xl">{titles[step]}</h1><p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground">{subtitles[step]}</p></div>
        {step === 0 && <div>
          <div className="grid gap-5 pt-2" role="group" aria-label="Subscription plans">{plans.map((plan) => <div key={plan.id} className={`rounded-[1.75rem] border bg-card p-6 sm:p-8 ${selectedPlan.id === plan.id ? "border-foreground/40" : "border-border"}`}>
            <div className="flex items-start justify-between gap-3">
              <h2 className="text-2xl font-semibold tracking-tight">{plan.name} Plan</h2>
              {plan.id === "growth" && <span className="rounded-full bg-foreground px-4 py-1.5 text-sm font-medium text-background shadow-lg">Popular</span>}
            </div>
            <p className="mt-3 flex items-baseline gap-1.5"><span className="text-4xl font-bold tracking-tight">${plan.monthlyFee}</span><span className="text-base text-muted-foreground">/month</span></p>
            <p className="mt-3 text-sm text-muted-foreground">{plan.description}</p>
            <div className="my-5 h-px bg-border" />
            <ul className="space-y-5">{[
              { icon: Clock, title: `${plan.monthlyHours} Service Hours`, text: "Assigned every month." },
              { icon: Megaphone, title: "Marketing", text: "Campaigns, content and strategy." },
              { icon: Palette, title: "Design", text: "Brand, social and web visuals." },
              { icon: Code2, title: "Development", text: "Websites, landing pages and fixes." },
            ].map(({ icon: Icon, title, text }) => <li key={title} className="flex items-center gap-4"><span className="grid size-11 shrink-0 place-items-center rounded-xl bg-secondary"><Icon className="size-5" strokeWidth={1.5} /></span><span><span className="block text-[15px] font-medium">{title}</span><span className="block text-sm text-muted-foreground">{text}</span></span></li>)}</ul>
            <Button className="mt-7 h-14 w-full rounded-2xl bg-foreground text-base font-semibold text-background hover:bg-foreground/90" onClick={() => { setSelectedPlan(plan); setStep(1); }}>Choose {plan.name}</Button>
            <p className="mt-4 text-center text-xs text-muted-foreground">90 days money-back guarantee ! Ads budget excluded</p>
          </div>)}</div>
          <p className="mt-4 text-xs leading-relaxed text-muted-foreground">Your hours are shared across all services. Service delivery is not unlimited.</p>
          <div className="mt-4 flex items-start justify-center gap-2 text-center text-xs leading-relaxed text-muted-foreground"><ShieldCheck className="size-4 shrink-0 text-primary" /><p>90-day money-back guarantee if no sales are received.<br />Service fees only.</p></div>
          <p className="mt-5 text-center text-sm text-muted-foreground">Already have an account? <Button asChild variant="link" className="h-auto p-0 font-semibold text-foreground"><Link to="/">Log in</Link></Button></p>
        </div>}
        {(step === 1 || step === 2) && <form onSubmit={advance} noValidate className="space-y-5">
          {step === 1 ? <>
            <div className="grid gap-5 lg:grid-cols-2"><Field label="First name"><input className="signup-input" autoComplete="given-name" value={personal.firstName} onChange={(e) => setPersonal({ ...personal, firstName: e.target.value })} maxLength={80} /></Field><Field label="Last name"><input className="signup-input" autoComplete="family-name" value={personal.lastName} onChange={(e) => setPersonal({ ...personal, lastName: e.target.value })} maxLength={80} /></Field></div>
            <Field label="Business name"><input className="signup-input" autoComplete="organization" value={personal.company} onChange={(e) => setPersonal({ ...personal, company: e.target.value })} maxLength={160} /></Field>
            <div className="space-y-2"><span className="text-sm font-medium">Country</span><CountryField value={personal.country} onChange={setCountry} /></div>
            <div className="space-y-2"><label htmlFor="mobile" className="text-sm font-medium">Mobile number</label><div className="signup-group"><CountryField phone value={phoneCountry} onChange={(v) => { phoneTouched.current = true; changePhoneCountry(v); }} /><input id="mobile" aria-label="Mobile number" autoComplete="tel" type="tel" inputMode="tel" placeholder="+31 6 1234 5678" value={personal.phone} maxLength={30} onChange={(e) => { phoneTouched.current = true; setPersonal({ ...personal, phone: e.target.value.replace(/[^\d+\s()-]/g, "") }); }} className="h-full min-w-0 flex-1 bg-transparent px-4 text-base outline-none" /></div></div>
          </> : <>
            <Field label="Email Address"><input className="signup-input" type="email" inputMode="email" autoComplete="email" value={account.email} maxLength={254} onChange={(e) => setAccount({ ...account, email: e.target.value })} /></Field>
            <Field label="Password"><div className="relative"><input className="signup-input pr-12" type={showPassword ? "text" : "password"} autoComplete="new-password" maxLength={128} value={account.password} onChange={(e) => setAccount({ ...account, password: e.target.value })} /><Button variant="ghost" size="icon" type="button" aria-label={showPassword ? "Hide password" : "Show password"} className="absolute right-1 top-1/2 -translate-y-1/2" onClick={() => setShowPassword((s) => !s)}>{showPassword ? <EyeOff /> : <Eye />}</Button></div></Field>
            <p className="text-xs text-muted-foreground">At least 8 characters.</p>
            <Field label="Confirm password"><input className="signup-input" type={showPassword ? "text" : "password"} autoComplete="new-password" maxLength={128} value={account.confirmPassword} onChange={(e) => setAccount({ ...account, confirmPassword: e.target.value })} /></Field>
            <div className="flex gap-3 border-t pt-5 text-sm text-muted-foreground"><LockKeyhole className="size-5 shrink-0" /><p>These login details are for this preview only. No account is created.</p></div>
          </>}
          <div className="flex items-center gap-3 pt-4"><Button type="button" variant="secondary" aria-label="Back" className="size-14 shrink-0 rounded-[14px]" onClick={() => setStep(step - 1)}><ArrowLeft /></Button><Button type="submit" className="signup-primary flex-1">{step === 1 ? "Continue" : "Review application"}<ArrowRight /></Button></div>
        </form>}
        {step === 3 && <div>
          <ReviewSection title="Your application" onEdit={() => setStep(0)}><ReviewRow label="Plan" value={selectedPlan.name} /><ReviewRow label="Service fee" value={`$${selectedPlan.monthlyFee} / month`} /><ReviewRow label="Assigned monthly hours" value={`${selectedPlan.monthlyHours} hours shared across all services; not unlimited`} /><ReviewRow label="Included services" value="Marketing, design & development" /><ReviewRow label="Money-back guarantee" value="90 days if no sales are received. Service fees only; advertising budgets excluded." /></ReviewSection>
          <ReviewSection title="Personal information" onEdit={() => setStep(1)}><ReviewRow label="Full name" value={`${personal.firstName} ${personal.lastName}`} /><ReviewRow label="Business" value={personal.company} /><ReviewRow label="Country" value={countries.find((c) => c.code === personal.country)?.name ?? ""} country={personal.country} /><ReviewRow label="Mobile number" value={personal.phone} /></ReviewSection>
          <ReviewSection title="Account details" onEdit={() => setStep(2)}><ReviewRow label="Email Address" value={account.email} /></ReviewSection>
          <Button className="signup-primary mt-6" onClick={() => setStep(4)}>To your agreements <ArrowRight /></Button>
        </div>}
        {step === 4 && <div>
          <div className="-mx-5 bg-secondary px-5 py-4 sm:mx-0 sm:px-6"><h2 className="text-xl font-medium">Agreements</h2></div>
          {documents.slice(0, 2).map((doc, index) => <DocumentRow key={doc.title} title={doc.title} onRead={() => setDocumentIndex(index)} onDownload={() => downloadDocument(index)} />)}
          <div className="-mx-5 mt-6 bg-secondary px-5 py-4 sm:mx-0 sm:px-6"><h2 className="text-xl font-medium">Conditions & information</h2></div>
          {documents.slice(2).map((doc, index) => <DocumentRow key={doc.title} title={doc.title} onRead={() => setDocumentIndex(index + 2)} onDownload={() => downloadDocument(index + 2)} />)}
          <p className="mt-6 text-xs leading-relaxed text-muted-foreground">The documents summarise the supplied subscription terms; they are not final legal contracts. By continuing, you can confirm this demonstration application.</p>
          <div className="mt-6 flex gap-3"><Button variant="secondary" aria-label="Back to review" className="size-14 shrink-0 rounded-[14px]" onClick={() => setStep(3)}><ArrowLeft /></Button><Button className="signup-primary flex-1" onClick={openConfirmation}>Accept & continue <PenLine /></Button></div>
        </div>}
      </div>
    </> : step === 5 ? <ProcessingScreen hours={selectedPlan.monthlyHours} onDone={() => { setAccount((a) => ({ ...a, password: "", confirmPassword: "" })); setStep(6); }} /> : <SuccessScreen name={personal.firstName} plan={selectedPlan} signedAt={signature?.at ?? new Date().toISOString()} email={account.email} />}

      </section>
    </div>
    <Dialog.Root open={confirmOpen} onOpenChange={setConfirmOpen}>
      <Dialog.Portal><Dialog.Overlay className="fixed inset-0 z-30 bg-foreground/40 backdrop-blur-sm" /><Dialog.Content className="signature-dialog">
                <Dialog.Close asChild><Button variant="ghost" size="icon" aria-label="Close confirmation" className="absolute right-4 top-4"><X /></Button></Dialog.Close>
        <div className="flex flex-1 flex-col justify-center"><span className="mb-6 grid size-14 place-items-center rounded-full bg-secondary"><PenLine className="size-6" /></span><Dialog.Title className="max-w-sm text-2xl font-bold leading-tight sm:text-3xl">Confirm your application</Dialog.Title><Dialog.Description className="mt-4 text-sm leading-relaxed text-muted-foreground">Enter the code below to accept the subscription terms and confirm your application as {personal.firstName} {personal.lastName}.</Dialog.Description>
          <div className="mt-7 rounded-2xl border bg-secondary/60 px-4 py-5">
            <p className="text-center text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">Your signature code</p>
            <div data-testid="signature-code" aria-label={`Confirmation code ${code}`} className="mt-3 flex items-center justify-center gap-2 font-mono text-3xl font-semibold tabular-nums tracking-[0.15em] sm:text-4xl"><span>{code.slice(0, 3)}</span><span className="text-muted-foreground">–</span><span>{code.slice(3)}</span></div>
          </div>
          <div className="mt-6"><InputOTP maxLength={6} value={entered} onChange={setEntered} aria-label="Enter six-digit confirmation code" inputMode="numeric" pattern="[0-9]*" containerClassName="w-full justify-center"><InputOTPGroup className="grid w-full grid-cols-6 gap-2">{Array.from({ length: 6 }, (_, index) => <InputOTPSlot key={index} index={index} className="h-14 w-full rounded-[14px] border border-input bg-background text-xl first:rounded-[14px] first:border-l last:rounded-[14px]" />)}</InputOTPGroup></InputOTP></div>
          <div className="relative z-10 mt-5 flex items-center justify-between gap-3 text-sm"><span className="text-muted-foreground">Code not working?</span><Button type="button" variant="outline" size="sm" className="relative z-10 rounded-full" onClick={newCode}><RefreshCw /> Use a new code</Button></div>
          <p className="mt-5 text-xs leading-relaxed text-muted-foreground">Entering this code confirms your acceptance as your digital signature. Every attempt uses a new code.</p>
        </div>
        <div className="mt-8 space-y-3"><Button className="signup-primary relative z-10" disabled={entered.length !== 6} onClick={accept}>Accept & sign</Button><Button variant="secondary" className="h-14 w-full rounded-[14px]" onClick={() => setConfirmOpen(false)}>Cancel</Button></div>
      </Dialog.Content></Dialog.Portal>
    </Dialog.Root>
    <Dialog.Root open={selectedDoc !== null} onOpenChange={(open) => { if (!open) setDocumentIndex(null); }}><Dialog.Portal><Dialog.Overlay className="fixed inset-0 z-30 bg-foreground/40 backdrop-blur-sm" /><Dialog.Content className="signature-dialog"><Dialog.Title className="pr-8 text-2xl font-bold">{selectedDoc?.title}</Dialog.Title><Dialog.Description className="mt-6 whitespace-pre-line text-base leading-relaxed text-muted-foreground">{selectedDoc?.body}</Dialog.Description><p className="mt-6 text-xs text-muted-foreground">Summary for this demonstration; not a final legal contract.</p><div className="mt-auto space-y-3 pt-8"><Button className="signup-primary" onClick={() => { if (documentIndex !== null) downloadDocument(documentIndex); }}><Download /> Save a copy</Button><Dialog.Close asChild><Button variant="secondary" className="h-14 w-full rounded-[14px]">Close</Button></Dialog.Close></div></Dialog.Content></Dialog.Portal></Dialog.Root>
  </main>;
}

function ReviewSection({ title, children, onEdit }: { title: string; children: ReactNode; onEdit: () => void }) {
  return <section className="mb-6"><div className="-mx-5 flex items-center justify-between bg-secondary px-5 py-4 sm:mx-0 sm:px-6"><h2 className="text-xl font-medium">{title}</h2><Button variant="link" onClick={onEdit}>Edit</Button></div><div className="divide-y px-0 sm:px-6">{children}</div></section>;
}
function ReviewRow({ label, value, country }: { label: string; value: string; country?: string }) {
  return <div className="py-4"><p className="text-sm font-semibold text-muted-foreground">{label}</p><p className="mt-1 flex items-center gap-2 break-words text-base leading-relaxed">{country && <CountryFlag code={country} />}{value}</p></div>;
}
function DocumentRow({ title, onRead, onDownload }: { title: string; onRead: () => void; onDownload: () => void }) {
  return <div className="flex items-center justify-between gap-3 border-b py-5 sm:px-6"><Button variant="link" className="h-auto whitespace-normal p-0 text-left text-base font-semibold" onClick={onRead}>{title}</Button><Button variant="ghost" size="icon" aria-label={`Download ${title}`} title={`Download ${title}`} className="shrink-0 text-primary" onClick={onDownload}><Download /></Button></div>;
}
const processingStages = (hours: number) => [
  { label: "Verifying your details", ms: 3600 },
  { label: "Securing your digital signature", ms: 3200 },
  { label: `Reserving your ${hours} monthly service hours`, ms: 4400 },
  { label: "Preparing your agreements", ms: 3800 },
  { label: "Finalising your application", ms: 2600 },
];

function ProcessingScreen({ hours, onDone }: { hours: number; onDone: () => void }) {
  const stages = processingStages(hours);
  const total = stages.reduce((sum, s) => sum + s.ms, 0);
  const [elapsed, setElapsed] = useState(0);
  const done = useRef(onDone); done.current = onDone;
  useEffect(() => {
    const start = performance.now();
    const timer = window.setInterval(() => {
      const t = performance.now() - start;
      setElapsed(t);
      if (t >= total + 500) { window.clearInterval(timer); done.current(); }
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
  return <section className="mx-auto max-w-lg px-5 pb-16 pt-10 md:px-2 md:pt-14" aria-live="polite">
    <div className="text-center"><h1 className="text-2xl font-bold sm:text-3xl">Processing your application</h1><p className="mx-auto mt-3 max-w-sm text-sm leading-relaxed text-muted-foreground">Please keep this page open. This can take up to a minute.</p></div>
    <div className="mt-8"><div className="flex justify-between text-xs text-muted-foreground"><span>{stages[current]?.label ?? "Complete"}…</span><span className="tabular-nums">{Math.floor(progress)}%</span></div>
      <div role="progressbar" aria-label="Processing application" aria-valuenow={Math.floor(progress)} aria-valuemin={0} aria-valuemax={100} className="relative mt-2 h-1.5 overflow-hidden rounded-full bg-secondary"><div className="h-full rounded-full bg-foreground transition-[width] duration-300 ease-out" style={{ width: `${progress}%` }} /><div className="signup-shimmer pointer-events-none absolute inset-0 bg-gradient-to-r from-transparent via-background/40 to-transparent" /></div></div>
    <ol className="mt-8 space-y-1 rounded-2xl border p-2">{stages.map((stage, i) => {
      const state = i < current ? "done" : i === current ? "active" : "todo";
      return <li key={stage.label} className={`flex items-center gap-3 rounded-xl px-3 py-3 text-sm ${state === "active" ? "bg-secondary font-medium" : ""} ${state === "todo" ? "text-muted-foreground" : ""}`}>
        <span className={`grid size-6 shrink-0 place-items-center rounded-full ${state === "done" ? "bg-foreground text-background" : "border"}`}>{state === "done" ? <Check className="size-3.5" /> : state === "active" ? <Loader2 className="size-3.5 animate-spin" /> : null}</span>{stage.label}</li>;
    })}</ol>
  </section>;
}

function SuccessScreen({ name, plan, signedAt, email }: { name: string; plan: Plan; signedAt: string; email: string }) {
  const time = new Date(signedAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
  const timeline = [
    { title: "Application submitted", text: time, state: "done" },
    { title: "Agreement signed digitally", text: "Your confirmation code was accepted.", state: "done" },
    { title: "Account review", text: "We're checking your details. Usually within 1 business day.", state: "current" },
    { title: "Onboarding call", text: `We'll contact you at ${email} to plan your first month.`, state: "todo" },
    { title: "Your accelerator starts", text: `${plan.monthlyHours} service hours assigned every month.`, state: "todo" },
  ] as const;
  return <section className="mx-auto max-w-lg px-5 pb-12 pt-8 md:px-2 md:pt-12">
    <div className="text-center"><span className="mx-auto grid size-16 place-items-center rounded-full bg-foreground text-background"><Check className="size-8" /></span><h1 className="mt-6 text-2xl font-bold leading-tight sm:text-3xl">Your application was successful, {name}!</h1><p className="mx-auto mt-3 max-w-sm text-sm leading-relaxed text-muted-foreground">Here's where things stand and what happens next.</p></div>
    <div className="mt-8 flex items-center justify-between gap-3 rounded-2xl border p-4"><div className="min-w-0"><p className="text-xs text-muted-foreground">Current status</p><p className="mt-0.5 font-semibold">In review</p></div><span className="flex shrink-0 items-center gap-2 rounded-full bg-secondary px-3 py-1.5 text-xs font-medium"><span className="size-2 animate-pulse rounded-full bg-primary" />Step 3 of 5</span></div>
    <ol className="mt-4 rounded-2xl border p-5">{timeline.map((item, i) => <li key={item.title} className="relative flex gap-4 pb-6 last:pb-0">
      {i < timeline.length - 1 && <span className={`absolute left-[11px] top-7 h-[calc(100%-1.5rem)] w-px ${item.state === "done" ? "bg-foreground" : "bg-border"}`} />}
      <span className={`relative grid size-6 shrink-0 place-items-center rounded-full ${item.state === "done" ? "bg-foreground text-background" : item.state === "current" ? "border-2 border-primary bg-background" : "border bg-background"}`}>{item.state === "done" ? <Check className="size-3.5" /> : item.state === "current" ? <span className="size-2 rounded-full bg-primary" /> : null}</span>
      <div className="min-w-0"><p className={`text-sm font-semibold ${item.state === "todo" ? "text-muted-foreground" : ""}`}>{item.title}{item.state === "current" && <span className="ml-2 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">Now</span>}</p><p className="mt-1 text-sm leading-relaxed text-muted-foreground">{item.text}</p></div>
    </li>)}</ol>
    <div className="mt-4 flex items-center justify-between gap-3 rounded-2xl border p-4 text-sm"><span className="min-w-0"><span className="block font-semibold">{plan.name} Plan</span><span className="text-muted-foreground">{plan.monthlyHours} hours / month</span></span><span className="shrink-0 font-semibold">${plan.monthlyFee}<span className="font-normal text-muted-foreground">/month</span></span></div>
    <Button asChild className="signup-primary mt-8"><Link to="/">Close</Link></Button>
  </section>;
}
