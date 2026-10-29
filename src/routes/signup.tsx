import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { ArrowLeft, ArrowRight, Check, ChevronDown, Download, Eye, EyeOff, LockKeyhole, PenLine, Rocket, ShieldCheck, X, Megaphone, Palette, Code2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CountryField } from "@/components/country-field";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { usePopup } from "@/components/popup";
import { accountSchema, countries, createSignatureCode, isSignatureMatch, personalSchema, subscription, type CountryCode, type PersonalDetails } from "@/lib/signup";
import logo from "@/assets/logo.png.asset.json";
import hero from "@/assets/login-hero.jpg";

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
const titles = ["Your next chapter starts here.", "Let's get to know you.", "Make it yours.", "Almost there!", "Your agreements"];
const subtitles = ["One subscription. Your entire creative team.", "The person and business behind the ambition.", "Create your FP login details.", "Please check your details carefully.", "Read your agreements before proceeding. Save a copy for your records."];
const documents = [
  { title: "Client Agreement", body: "FP Marketing Accelerator\n\nYour monthly subscription covers marketing, design and development services. Advertising budgets are excluded and are separate from service fees." },
  { title: "Subscription Agreement", body: "Marketing Accelerator subscription\n\nService fee: $199 per month. Includes marketing, design and development. Does not include advertising budgets." },
  { title: "90-day Money-back Guarantee", body: "90-day money-back guarantee\n\nIf no sales are received within 90 days, the money-back guarantee applies to service fees only. Advertising budgets are not covered." },
  { title: "Country & Privacy Information", body: "Country preselection\n\nWe use ipapi.co to suggest your country based on your IP address. The request shares your IP with that provider. You may change the suggested country. Personal details and passwords in this demonstration stay in this browser page, are not submitted, and clear when the page is refreshed." },
];

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="block space-y-2 text-sm font-medium text-foreground"><span>{label}</span>{children}</label>;
}

function Signup() {
  const [step, setStep] = useState(0);
  const [personal, setPersonal] = useState<PersonalDetails>({ firstName: "", lastName: "", company: "", country: "", phone: "" });
  const [phoneCountry, setPhoneCountry] = useState<string>("");
  const [account, setAccount] = useState({ email: "", password: "", confirmPassword: "" });
  const [showPassword, setShowPassword] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [code, setCode] = useState("");
  const [entered, setEntered] = useState("");
  const [documentIndex, setDocumentIndex] = useState<number | null>(null);
  const [progress, setProgress] = useState(0);
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
    if (step !== 5) return;
    setProgress(0);
    const start = performance.now();
    const timer = window.setInterval(() => {
      const value = Math.min(100, ((performance.now() - start) / 2400) * 100);
      setProgress(value);
      if (value === 100) { window.clearInterval(timer); setAccount((a) => ({ ...a, password: "", confirmPassword: "" })); setStep(6); }
    }, 80);
    return () => window.clearInterval(timer);
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

  return <main className="min-h-dvh bg-background text-foreground">
    <header className="sticky top-0 z-20 border-b bg-background/95 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5 sm:h-20 sm:px-8">
        <Link to="/" aria-label="FP home"><img src={logo.url} alt="FP" className="size-9 object-contain sm:size-11" /></Link>
        <span className="text-sm font-semibold">{step < 5 ? steps[step] : step === 5 ? "Almost there…" : "Application complete"}</span>
        {step < 5 ? <Button variant="ghost" size="icon" aria-label="Close signup" onClick={() => popup({ type: "info", title: "Leave your application?", description: "Your details won't be saved.", primaryLabel: "Leave application", onPrimary: () => { navigate({ to: "/" }); }, secondaryLabel: "Keep going" })}><X /></Button> : <div className="size-9" />}
      </div>
    </header>

    {step < 5 ? <>
      <nav aria-label="Application progress" className="mx-auto max-w-6xl px-5 pt-5 sm:px-8 sm:pt-8">
        <ol className="flex gap-2 sm:gap-4">{steps.map((name, index) => <li key={name} className="min-w-0 flex-1"><div className={`h-1 rounded-full ${index <= step ? "bg-primary" : "bg-secondary"}`} /><span className={`mt-2 hidden text-xs sm:block ${index === step ? "font-semibold text-foreground" : "text-muted-foreground"}`}>{index + 1}. {name}</span></li>)}</ol>
        <p className="mt-2 text-xs text-muted-foreground sm:hidden">Step {step + 1} of 5</p>
      </nav>
      <div className={`mx-auto max-w-6xl px-5 pb-10 pt-7 sm:px-8 sm:pt-12 ${step === 0 ? "" : "lg:max-w-3xl"}`}>
        <div className="mb-7 sm:mb-10"><h1 className="text-[1.75rem] font-semibold leading-tight sm:text-4xl">{titles[step]}</h1><p className="mt-3 max-w-xl text-sm leading-relaxed text-muted-foreground sm:text-base">{subtitles[step]}</p></div>
        {step === 0 && <div className="grid items-stretch gap-7 lg:grid-cols-[1fr_1fr] lg:gap-12">
          <section className="rounded-lg border bg-card p-6 sm:p-8">
            <div className="flex items-start justify-between gap-4"><h2 className="text-xl font-semibold">Marketing Accelerator</h2><span className="shrink-0 rounded-full bg-foreground px-3 py-1 text-xs font-medium text-background">All-in-one</span></div>
            <p className="mt-5"><strong className="text-4xl font-semibold">${subscription.monthlyFee}</strong><span className="ml-1 text-sm text-muted-foreground">/ month</span></p>
            <p className="mt-3 text-sm text-muted-foreground">Your ambition. Our expertise.</p>
            <div className="my-6 border-t" />
            <ul className="space-y-5">{[{ icon: Megaphone, title: "All marketing services", text: "Strategy, campaigns & brand growth" }, { icon: Palette, title: "All design services", text: "Brand identity & creative production" }, { icon: Code2, title: "All development services", text: "Websites & digital experiences" }].map(({ icon: Icon, title, text }) => <li key={title} className="flex gap-3"><span className="grid size-10 shrink-0 place-items-center rounded-md bg-secondary"><Icon className="size-5" /></span><div><p className="text-sm font-semibold">{title}</p><p className="mt-1 text-sm text-muted-foreground">{text}</p></div></li>)}</ul>
            <p className="mt-6 border-t pt-4 text-xs leading-relaxed text-muted-foreground">Advertising budgets are separate and are not included.</p>
            <Button className="signup-primary mt-6" onClick={() => setStep(1)}>Select this plan <ArrowRight /></Button>
            <div className="mt-4 flex items-start justify-center gap-2 text-center text-xs leading-relaxed text-muted-foreground"><ShieldCheck className="size-4 shrink-0 text-primary" /><p>90-day money-back guarantee if no sales are received.<br />Service fees only.</p></div>
          </section>
          <div className="relative hidden min-h-[510px] overflow-hidden rounded-lg lg:block"><img src={hero} alt="Entrepreneur overlooking the city from a marketing studio" className="absolute inset-0 h-full w-full object-cover" /><div className="absolute inset-0 bg-gradient-to-t from-foreground/90 via-transparent to-transparent" /><div className="absolute bottom-9 left-8 right-8 text-background"><p className="text-xs uppercase tracking-widest">FP Marketing Accelerator</p><h2 className="mt-3 text-3xl font-semibold leading-tight">Built for your<br />next big move.</h2></div></div>
        </div>}
        {(step === 1 || step === 2) && <form onSubmit={advance} noValidate className="space-y-5">
          {step === 1 ? <>
            <div className="grid gap-5 sm:grid-cols-2"><Field label="First name"><input className="signup-input" autoComplete="given-name" value={personal.firstName} onChange={(e) => setPersonal({ ...personal, firstName: e.target.value })} maxLength={80} /></Field><Field label="Last name"><input className="signup-input" autoComplete="family-name" value={personal.lastName} onChange={(e) => setPersonal({ ...personal, lastName: e.target.value })} maxLength={80} /></Field></div>
            <Field label="Business name"><input className="signup-input" autoComplete="organization" value={personal.company} onChange={(e) => setPersonal({ ...personal, company: e.target.value })} maxLength={160} /></Field>
            <div className="space-y-2"><span className="text-sm font-medium">Country</span><CountryField value={personal.country} onChange={setCountry} /></div>
            <div className="space-y-2"><label htmlFor="mobile" className="text-sm font-medium">Mobile number</label><div className="flex min-w-0 items-center overflow-hidden rounded-lg border border-input bg-secondary/40 focus-within:border-foreground focus-within:ring-2 focus-within:ring-foreground/5"><CountryField phone value={phoneCountry} onChange={(v) => { phoneTouched.current = true; changePhoneCountry(v); }} /><input id="mobile" aria-label="Mobile number" autoComplete="tel" type="tel" inputMode="tel" placeholder="+31 6 1234 5678" value={personal.phone} maxLength={30} onChange={(e) => { phoneTouched.current = true; setPersonal({ ...personal, phone: e.target.value.replace(/[^\d+\s()-]/g, "") }); }} className="h-11 min-w-0 flex-1 bg-transparent px-3 text-base outline-none sm:h-12" /></div></div>
            <p className="text-xs leading-relaxed text-muted-foreground">Your country may be suggested using ipapi.co. You can change it. <Button variant="link" type="button" className="h-auto p-0 text-xs" onClick={() => setDocumentIndex(3)}>Privacy information</Button></p>
          </> : <>
            <Field label="Email Address"><input className="signup-input" type="email" inputMode="email" autoComplete="email" value={account.email} maxLength={254} onChange={(e) => setAccount({ ...account, email: e.target.value })} /></Field>
            <Field label="Password"><div className="relative"><input className="signup-input pr-12" type={showPassword ? "text" : "password"} autoComplete="new-password" maxLength={128} value={account.password} onChange={(e) => setAccount({ ...account, password: e.target.value })} /><Button variant="ghost" size="icon" type="button" aria-label={showPassword ? "Hide password" : "Show password"} className="absolute right-1 top-1/2 -translate-y-1/2" onClick={() => setShowPassword((s) => !s)}>{showPassword ? <EyeOff /> : <Eye />}</Button></div></Field>
            <p className="text-xs text-muted-foreground">At least 8 characters.</p>
            <Field label="Confirm password"><input className="signup-input" type={showPassword ? "text" : "password"} autoComplete="new-password" maxLength={128} value={account.confirmPassword} onChange={(e) => setAccount({ ...account, confirmPassword: e.target.value })} /></Field>
            <div className="flex gap-3 border-t pt-5 text-sm text-muted-foreground"><LockKeyhole className="size-5 shrink-0" /><p>These login details are for this preview only. No account is created.</p></div>
          </>}
          <div className="flex items-center gap-3 pt-4"><Button type="button" variant="secondary" aria-label="Back" className="size-12 rounded-full" onClick={() => setStep(step - 1)}><ArrowLeft /></Button><Button type="submit" className="signup-primary flex-1">{step === 1 ? "Continue" : "Review application"}<ArrowRight /></Button></div>
        </form>}
        {step === 3 && <div>
          <ReviewSection title="Your application" onEdit={() => setStep(0)}><ReviewRow label="Plan" value={subscription.name} /><ReviewRow label="Service fee" value="$199 / month" /><ReviewRow label="Included services" value="Marketing, design & development" /><ReviewRow label="Money-back guarantee" value="90 days if no sales are received. Service fees only; advertising budgets excluded." /></ReviewSection>
          <ReviewSection title="Personal information" onEdit={() => setStep(1)}><ReviewRow label="Full name" value={`${personal.firstName} ${personal.lastName}`} /><ReviewRow label="Business" value={personal.company} /><ReviewRow label="Country" value={countries.find((c) => c.code === personal.country)?.name ?? ""} /><ReviewRow label="Mobile number" value={personal.phone} /></ReviewSection>
          <ReviewSection title="Account details" onEdit={() => setStep(2)}><ReviewRow label="Email Address" value={account.email} /></ReviewSection>
          <Button className="signup-primary mt-6" onClick={() => setStep(4)}>To your agreements <ArrowRight /></Button>
        </div>}
        {step === 4 && <div>
          <div className="-mx-5 bg-secondary px-5 py-4 sm:mx-0 sm:px-6"><h2 className="text-xl font-medium">Agreements</h2></div>
          {documents.slice(0, 2).map((doc, index) => <DocumentRow key={doc.title} title={doc.title} onRead={() => setDocumentIndex(index)} onDownload={() => downloadDocument(index)} />)}
          <div className="-mx-5 mt-6 bg-secondary px-5 py-4 sm:mx-0 sm:px-6"><h2 className="text-xl font-medium">Conditions & information</h2></div>
          {documents.slice(2).map((doc, index) => <DocumentRow key={doc.title} title={doc.title} onRead={() => setDocumentIndex(index + 2)} onDownload={() => downloadDocument(index + 2)} />)}
          <p className="mt-6 text-xs leading-relaxed text-muted-foreground">The documents summarise the supplied subscription terms; they are not final legal contracts. By continuing, you can confirm this demonstration application.</p>
          <div className="mt-6 flex gap-3"><Button variant="secondary" aria-label="Back to review" className="size-12 rounded-full" onClick={() => setStep(3)}><ArrowLeft /></Button><Button className="signup-primary flex-1" onClick={openConfirmation}>Accept & continue <PenLine /></Button></div>
        </div>}
      </div>
    </> : step === 5 ? <section className="mx-auto flex min-h-[calc(100dvh-5rem)] max-w-lg flex-col justify-center px-6 pb-24 text-center" aria-live="polite"><div role="progressbar" aria-label="Processing application" aria-valuenow={Math.round(progress)} aria-valuemin={0} aria-valuemax={100} className="mb-8 h-2 overflow-hidden rounded-full border bg-secondary"><div className="h-full origin-left bg-primary transition-transform duration-100 motion-reduce:transition-none" style={{ transform: `scaleX(${progress / 100})` }} /></div><h1 className="text-2xl font-semibold sm:text-3xl">Just a moment, please…</h1><p className="mt-4 text-base leading-relaxed text-muted-foreground">Preparing your application summary.</p></section> : <section className="mx-auto flex min-h-[calc(100dvh-5rem)] max-w-lg flex-col items-center justify-center px-6 py-12 text-center"><span className="grid size-20 place-items-center rounded-full bg-primary/10 text-primary"><Check className="size-10" /></span><h1 className="mt-7 text-3xl font-bold leading-tight">You're all set, {personal.firstName}!</h1><p className="mt-3 text-sm leading-relaxed text-muted-foreground">Your demonstration application is complete.<br />No account, payment or application has been submitted.</p><div className="mt-8 w-full space-y-5 text-left"><div className="flex gap-3 border-b pb-5"><Rocket className="size-5 shrink-0 text-primary" /><div><p className="font-semibold">Your marketing accelerator</p><p className="mt-1 text-sm text-muted-foreground">Marketing, design & development · $199/month</p></div></div><div className="flex gap-3"><ShieldCheck className="size-5 shrink-0 text-primary" /><div><p className="font-semibold">Confirmation completed</p><p className="mt-1 text-sm leading-relaxed text-muted-foreground">{signature?.name}<br />{signature ? new Date(signature.at).toLocaleString() : ""}<br />90-day service-fee guarantee if no sales are received.</p></div></div></div><Button asChild className="signup-primary mt-10"><Link to="/">Close</Link></Button></section>}

    <Dialog.Root open={confirmOpen} onOpenChange={setConfirmOpen}>
      <Dialog.Portal><Dialog.Overlay className="fixed inset-0 z-30 bg-foreground/40 backdrop-blur-sm" /><Dialog.Content className="signature-dialog">
        <span className="mx-auto mb-5 flex justify-center text-muted-foreground sm:hidden"><ChevronDown className="size-7" /></span>
        <Dialog.Close asChild><Button variant="ghost" size="icon" aria-label="Close confirmation" className="absolute right-4 top-4"><X /></Button></Dialog.Close>
        <div className="flex flex-1 flex-col justify-center"><span className="mb-6 grid size-14 place-items-center rounded-full bg-secondary"><PenLine className="size-6" /></span><Dialog.Title className="max-w-sm text-2xl font-bold leading-tight sm:text-3xl">Confirm your application</Dialog.Title><Dialog.Description className="mt-4 text-sm leading-relaxed text-muted-foreground">Enter the code below to accept the subscription terms and confirm your application as {personal.firstName} {personal.lastName}.</Dialog.Description>
          <div data-testid="signature-code" aria-label={`Confirmation code ${code}`} className="my-8 grid grid-cols-6 gap-2 text-center text-3xl font-semibold sm:text-4xl">{code.split("").map((digit, index) => <span key={index}>{digit}</span>)}</div>
          <InputOTP maxLength={6} value={entered} onChange={setEntered} aria-label="Enter six-digit confirmation code" inputMode="numeric" pattern="[0-9]*" containerClassName="w-full justify-center"><InputOTPGroup className="grid w-full grid-cols-6 gap-2">{Array.from({ length: 6 }, (_, index) => <InputOTPSlot key={index} index={index} className="h-12 w-full rounded-md border border-input bg-secondary text-xl first:rounded-md last:rounded-md sm:h-14" />)}</InputOTPGroup></InputOTP>
          <Button variant="link" className="mx-auto mt-4 text-xs text-muted-foreground" onClick={newCode}>Use a new code</Button>
          <p className="mt-3 text-xs leading-relaxed text-muted-foreground">This code records confirmation in this preview only. It does not verify your identity or create a legally authenticated signature.</p>
        </div>
        <div className="mt-8 space-y-3"><Button className="signup-primary" disabled={entered.length !== 6} onClick={accept}>Accept</Button><Button variant="secondary" className="h-12 w-full rounded-full" onClick={() => setConfirmOpen(false)}>Cancel</Button></div>
      </Dialog.Content></Dialog.Portal>
    </Dialog.Root>
    <Dialog.Root open={selectedDoc !== null} onOpenChange={(open) => { if (!open) setDocumentIndex(null); }}><Dialog.Portal><Dialog.Overlay className="fixed inset-0 z-30 bg-foreground/40 backdrop-blur-sm" /><Dialog.Content className="signature-dialog"><Dialog.Title className="pr-8 text-2xl font-bold">{selectedDoc?.title}</Dialog.Title><Dialog.Description className="mt-6 whitespace-pre-line text-base leading-relaxed text-muted-foreground">{selectedDoc?.body}</Dialog.Description><p className="mt-6 text-xs text-muted-foreground">Summary for this demonstration; not a final legal contract.</p><div className="mt-auto space-y-3 pt-8"><Button className="signup-primary" onClick={() => { if (documentIndex !== null) downloadDocument(documentIndex); }}><Download /> Save a copy</Button><Dialog.Close asChild><Button variant="secondary" className="h-12 w-full rounded-full">Close</Button></Dialog.Close></div></Dialog.Content></Dialog.Portal></Dialog.Root>
  </main>;
}

function ReviewSection({ title, children, onEdit }: { title: string; children: ReactNode; onEdit: () => void }) {
  return <section className="mb-6"><div className="-mx-5 flex items-center justify-between bg-secondary px-5 py-4 sm:mx-0 sm:px-6"><h2 className="text-xl font-medium">{title}</h2><Button variant="link" onClick={onEdit}>Edit</Button></div><div className="divide-y px-0 sm:px-6">{children}</div></section>;
}
function ReviewRow({ label, value }: { label: string; value: string }) {
  return <div className="py-4"><p className="text-sm font-semibold text-muted-foreground">{label}</p><p className="mt-1 break-words text-base leading-relaxed">{value}</p></div>;
}
function DocumentRow({ title, onRead, onDownload }: { title: string; onRead: () => void; onDownload: () => void }) {
  return <div className="flex items-center justify-between gap-3 border-b py-5 sm:px-6"><Button variant="link" className="h-auto whitespace-normal p-0 text-left text-base font-semibold" onClick={onRead}>{title}</Button><Button variant="ghost" size="icon" aria-label={`Download ${title}`} title={`Download ${title}`} className="shrink-0 text-primary" onClick={onDownload}><Download /></Button></div>;
}