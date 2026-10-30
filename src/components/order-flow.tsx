import { useEffect, useRef, useState, type ReactNode } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { ArrowLeft, ArrowRight, Check, Clock, Code2, Download, FileText, Loader2, Megaphone, Palette, PenLine, RefreshCw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CountryFlag } from "@/components/country-field";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { usePopup } from "@/components/popup";
import { downloadAgreementPdf } from "@/lib/agreement-pdf";
import { createSignatureCode, isSignatureMatch, plans, type Plan } from "@/lib/signup";
import { LEGAL_URL, agreementDocuments, parseAgreement } from "@/lib/agreements";
import { money } from "@/lib/admin";

/** Shared steps of every order: plan cards, review rows, agreements and the digital signature. Used by signup,
 * by signed-in clients adding a plan and by staff placing an order, so all three show the same plans and documents. */

export const formatAccountNumber = (n: string) => n.replace(/(\d{4})(\d{3})(\d{3})/, "$1 $2 $3");

export function PlanCards({ onChoose, current }: { onChoose: (plan: Plan) => void; current?: string }) {
  return (
          <div className="grid gap-3 sm:grid-cols-3" role="group" aria-label="Subscription plans">{plans.map((plan) => <div key={plan.id} className={`flex flex-col rounded-2xl border p-4 sm:p-5 ${plan.id === "growth" ? "border-foreground/50" : ""}`}>
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-base font-semibold">{plan.name}</h2>
              {plan.id === "growth" && <span className="rounded-full bg-foreground px-2 py-0.5 text-[11px] font-medium text-background">Popular</span>}
            </div>
            <p className="mt-1 flex items-baseline gap-1"><span className="text-2xl font-bold tracking-tight">${plan.monthlyFee}</span><span className="text-xs text-muted-foreground">/month</span></p>
            <p className="mt-1 text-xs text-muted-foreground">{plan.description}</p>
            <ul className="mt-3 space-y-2.5 border-t pt-3">{[
              { icon: Clock, title: `${plan.monthlyHours} Service Hours`, text: "Assigned every month." },
              { icon: Megaphone, title: "Marketing", text: "Campaigns, content and strategy." },
              { icon: Palette, title: "Design", text: "Brand, social and web visuals." },
              { icon: Code2, title: "Development", text: "Websites, landing pages and fixes." },
            ].map(({ icon: Icon, title, text }) => <li key={title} className="flex items-start gap-2.5"><span className="grid size-7 shrink-0 place-items-center rounded-lg bg-secondary"><Icon className="size-3.5" strokeWidth={1.75} /></span><span className="min-w-0 leading-tight"><span className="block text-[13px] font-medium">{title}</span><span className="block text-xs text-muted-foreground">{text}</span></span></li>)}</ul>
            <div className="mt-3 border-t pt-3 sm:mb-4"><p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">A typical month</p>
              <ul className="mt-1.5 space-y-1 text-xs">{plan.typicalMonth.map((t) => <li key={t} className="flex gap-1.5"><Check className="mt-0.5 size-3 shrink-0" />{t}</li>)}</ul></div>
            <Button disabled={current === plan.id} className="mt-4 h-10 w-full rounded-xl bg-foreground text-sm font-semibold text-background hover:bg-foreground/90 sm:mt-auto" onClick={() => onChoose(plan)}>{current === plan.id ? "Current plan" : `Choose ${plan.name}`}</Button>
            <p className="mt-2 flex items-center justify-center gap-1.5 text-[11px] text-muted-foreground"><Check className="size-3.5" />90-day money-back guarantee</p>
          </div>)}</div>
  );
}

export function ReviewSection({ title, children, onEdit }: { title: string; children: ReactNode; onEdit: () => void }) {
  return <section className="mb-8"><div className="flex items-center justify-between border-b pb-2"><h2 className="text-lg font-semibold">{title}</h2><Button variant="link" className="h-auto p-0" onClick={onEdit}>Edit</Button></div><div className="divide-y">{children}</div></section>;
}

export function ReviewRow({ label, value, country }: { label: string; value: string; country?: string }) {
  return <div className="flex flex-col gap-0.5 py-3 sm:flex-row sm:justify-between sm:gap-6"><p className="shrink-0 text-sm text-muted-foreground">{label}</p><p className="flex items-center gap-2 break-words text-sm font-medium sm:text-right">{country && <CountryFlag code={country} />}{value}</p></div>;
}

function DocumentRow({ title, onRead, onDownload }: { title: string; onRead: () => void; onDownload: () => void }) {
  return <li className="flex items-center gap-3 px-4 py-2.5 text-sm"><FileText className="size-4 shrink-0 text-muted-foreground" /><button type="button" className="min-w-0 flex-1 truncate text-left font-medium hover:underline" onClick={onRead}>{title}</button><button type="button" className="text-xs font-medium underline underline-offset-4 hover:text-muted-foreground" onClick={onRead}>Read</button><button type="button" aria-label={`Save ${title} as PDF`} title="Save as PDF" className="grid size-8 place-items-center rounded-full text-muted-foreground hover:bg-secondary hover:text-foreground" onClick={onDownload}><Download className="size-4" /></button></li>;
}

/** Renders agreement markup (headings, paragraphs, tables, notices) for reading on screen. */
export function AgreementText({ body }: { body: string }) {
  return <div className="mt-4 space-y-2.5 text-[13px] leading-relaxed text-muted-foreground">{parseAgreement(body).map((b, i) =>
    b.kind === "heading" ? <h3 key={i} className="pt-2 text-sm font-semibold text-foreground">{b.text}</h3>
    : b.kind === "notice" ? <p key={i} className="rounded-lg border bg-secondary/60 p-3 font-medium text-foreground">{b.text}</p>
    : b.kind === "table" ? <div key={i} className="overflow-x-auto rounded-lg border"><table className="w-full text-left text-xs">
        {b.header && <thead className="bg-secondary/60 text-foreground"><tr>{b.header.map((h, c) => <th key={c} className="px-3 py-2 font-semibold">{h}</th>)}</tr></thead>}
        <tbody className="divide-y">{b.rows.map((r, ri) => <tr key={ri} className="align-top">{r.map((c, ci) => <td key={ci} className={`px-3 py-2 ${ci === 0 ? "font-medium text-foreground" : ""}`}>{c}</td>)}</tr>)}</tbody>
      </table></div>
    : <p key={i} className="whitespace-pre-line">{b.text}</p>)}</div>;
}

/** The agreements with read, save-as-PDF and a reading dialog. */
export function AgreementsList({ documents }: { documents: { title: string; body: string }[] }) {
  const popup = usePopup();
  const [open, setOpen] = useState<number | null>(null);
  const save = (i: number) => { const d = documents[i]; if (d) void downloadAgreementPdf(d).catch((e: Error) => popup({ type: "error", title: "Couldn't create the PDF", description: e.message, primaryLabel: "Close", secondaryLabel: null })); };
  const doc = open === null ? null : documents[open];
  return <>
    <ul className="divide-y rounded-xl border">{documents.map((d, i) => <DocumentRow key={d.title} title={d.title} onRead={() => setOpen(i)} onDownload={() => save(i)} />)}</ul>
    <p className="mt-2 text-xs text-muted-foreground">Full terms and policies: <a href={LEGAL_URL} target="_blank" rel="noopener noreferrer" className="font-medium text-foreground underline underline-offset-4">{LEGAL_URL.replace("https://", "")}</a></p>
    <Dialog.Root open={doc !== null} onOpenChange={(v) => { if (!v) setOpen(null); }}><Dialog.Portal><Dialog.Overlay className="fixed inset-0 z-40 bg-foreground/40 backdrop-blur-sm" /><Dialog.Content className="app-modal max-h-[85dvh] overflow-y-auto sm:max-w-2xl"><Dialog.Title className="pr-8 text-lg font-bold">{doc?.title}</Dialog.Title><Dialog.Description className="sr-only">The full text of {doc?.title}.</Dialog.Description>{doc && <AgreementText body={doc.body} />}<div className="mt-6 space-y-2"><Button className="signup-primary text-sm" onClick={() => { if (open !== null) save(open); }}><Download /> Save as PDF</Button><Dialog.Close asChild><Button variant="secondary" className="app-modal-secondary">Close</Button></Dialog.Close></div></Dialog.Content></Dialog.Portal></Dialog.Root>
  </>;
}

/** Digital signature: a fresh one-time code drawn on a canvas, typed back to sign. Codes are never reused in one session.
 * onSign returns false to keep the dialog open (for example when the order failed). */
export function SignDialog({ open, onOpenChange, title = "Confirm and sign", onSign }: { open: boolean; onOpenChange: (v: boolean) => void; title?: string; onSign: () => Promise<boolean> }) {
  const popup = usePopup();
  const used = useRef(new Set<string>());
  const [code, setCode] = useState("");
  const [entered, setEntered] = useState("");
  const [busy, setBusy] = useState(false);
  const fresh = () => { const next = createSignatureCode(used.current); used.current.add(next); setCode(next); setEntered(""); };
  useEffect(() => { if (open) fresh(); }, [open]);
  const accept = async () => {
    if (!isSignatureMatch(code, entered)) {
      onOpenChange(false);
      popup({ type: "error", title: "The code doesn't match", description: "Please try again with a new confirmation code.", primaryLabel: "Try again", onPrimary: () => onOpenChange(true), secondaryLabel: "Cancel" });
      return;
    }
    setBusy(true);
    try { if (await onSign()) onOpenChange(false); } finally { setBusy(false); }
  };
  return <Dialog.Root open={open} onOpenChange={onOpenChange}>
    <Dialog.Portal><Dialog.Overlay className="fixed inset-0 z-40 bg-foreground/40 backdrop-blur-sm" /><Dialog.Content className="app-modal">
      <Dialog.Close asChild><Button variant="ghost" size="icon" aria-label="Close confirmation" className="absolute right-4 top-4"><X /></Button></Dialog.Close>
      <span className="mx-auto grid size-12 place-items-center rounded-full bg-secondary"><PenLine className="size-5" /></span>
      <Dialog.Title className="mt-4 text-center text-xl font-bold leading-snug">{title}</Dialog.Title>
      <Dialog.Description className="mt-1.5 text-center text-sm text-muted-foreground">Enter the code shown below as your digital signature.</Dialog.Description>
      <SignatureCode code={code} />
      <InputOTP maxLength={6} value={entered} onChange={setEntered} aria-label="Enter six-digit confirmation code" inputMode="numeric" pattern="[0-9]*" autoComplete="off" containerClassName="mt-4 w-full justify-center"><InputOTPGroup className="grid w-full grid-cols-6 gap-2">{Array.from({ length: 6 }, (_, index) => <InputOTPSlot key={index} index={index} className="signup-input h-11 justify-center rounded-lg border p-0 text-base shadow-none first:rounded-lg first:border-l last:rounded-lg data-[active=true]:border-foreground data-[active=true]:ring-[3px] data-[active=true]:ring-foreground/10" />)}</InputOTPGroup></InputOTP>
      <button type="button" onClick={fresh} className="relative z-10 mx-auto mt-3 flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground"><RefreshCw className="size-3.5" /> Use a new code</button>
      <div className="relative z-10 mt-6 space-y-2"><Button className="signup-primary text-sm" disabled={entered.length !== 6 || busy} onClick={accept}>{busy ? "Submitting…" : "Accept & sign"}</Button><button type="button" className="app-modal-secondary" onClick={() => onOpenChange(false)}>Cancel</button></div>
    </Dialog.Content></Dialog.Portal>
  </Dialog.Root>;
}

/** Draws the signature code on a canvas after a short load, so the digits never appear as page text. */
function SignatureCode({ code }: { code: string }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    setReady(false);
    const timer = window.setTimeout(() => setReady(true), 1400 + Math.random() * 1200);
    return () => window.clearTimeout(timer);
  }, [code]);
  useEffect(() => {
    const el = canvas.current; if (!ready || !el) return;
    const ctx = el.getContext("2d"); if (!ctx) return;
    const dpr = window.devicePixelRatio || 1, w = el.clientWidth, h = el.clientHeight;
    el.width = w * dpr; el.height = h * dpr; ctx.scale(dpr, dpr);
    const css = getComputedStyle(el), fg = css.color, muted = css.getPropertyValue("--muted-foreground");
    ctx.clearRect(0, 0, w, h);
    ctx.strokeStyle = muted; ctx.globalAlpha = 0.35;
    for (let i = 0; i < 5; i++) { ctx.beginPath(); ctx.moveTo(Math.random() * w, Math.random() * h); ctx.bezierCurveTo(Math.random() * w, Math.random() * h, Math.random() * w, Math.random() * h, Math.random() * w, Math.random() * h); ctx.stroke(); }
    ctx.globalAlpha = 1; ctx.fillStyle = fg; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    const step = w / 7;
    [...code].forEach((digit, i) => {
      ctx.save(); ctx.translate(step * (i + 1) + (i > 2 ? step * 0.15 : -step * 0.15), h / 2 + (Math.random() - 0.5) * 6); ctx.rotate((Math.random() - 0.5) * 0.35);
      ctx.font = `600 ${26 + Math.random() * 6}px ui-monospace, monospace`; ctx.fillText(digit, 0, 0); ctx.restore();
    });
  }, [ready, code]);
  return <div className="mt-5 grid h-16 place-items-center overflow-hidden rounded-xl border bg-secondary/60" aria-live="polite">
    {ready ? <canvas ref={canvas} role="img" aria-label="Signature code image" className="block h-16 w-full text-foreground" /> : <span className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Generating secure code…</span>}
  </div>;
}

export type OrderClient = { name: string; company?: string | null; email?: string | null; phone?: string | null; country?: string | null; address?: string | null; accountNumber?: string | null };

/** Plan, review, agreements and sign for an existing account. Clients sign the agreements themselves; staff place the
 * order for the client, who accepts the agreements by paying the first invoice. */
export function OrderWizard({ client, mode, onPlace, onDone, doneLabel, initialPlan }: {
  client: OrderClient; mode: "client" | "staff"; initialPlan?: Plan["id"]; onPlace: (plan: Plan) => Promise<void>; onDone: () => void; doneLabel: string;
}) {
  const popup = usePopup();
  // A plan picked before signing in opens straight on the review.
  const picked = plans.find((p) => p.id === initialPlan);
  const [step, setStep] = useState(picked ? 1 : 0);
  const [plan, setPlan] = useState<Plan>(picked ?? plans[1]);
  const [signing, setSigning] = useState(false);
  const [placedAt, setPlacedAt] = useState<string | null>(null);
  const documents = agreementDocuments(plan, client, placedAt ?? undefined);
  const place = async (): Promise<boolean> => {
    try { await onPlace(plan); setPlacedAt(new Date().toISOString()); setStep(3); return true; }
    catch (e) {
      // A security check restricted the account: the client completes verification first.
      if (/KYC_REQUIRED/.test((e as Error).message) && mode === "client") { window.location.assign("/kyc"); return false; }
      popup({ type: "error", title: "The order wasn't placed", description: (e as Error).message, primaryLabel: "Close", secondaryLabel: null }); return false;
    }
  };
  const confirmStaff = () => popup({ type: "info", title: `Place a ${plan.name} order?`, description: `Stripe emails the first invoice of ${money(plan.monthlyFee)} to ${client.email ?? "the client"}. The plan starts when it's paid.`, primaryLabel: "Place order", onPrimary: async () => { await place(); }, secondaryLabel: "Cancel" });
  const titles = ["Choose a plan", "Review the order", "Agreements", "Order placed"];
  const header = <div className="mb-6 text-center"><h1 className="text-2xl font-extrabold leading-tight">{titles[step]}</h1></div>;
  return <div className={`mx-auto pb-10 ${step === 0 ? "max-w-4xl" : "max-w-lg"}`}>
    {header}
    {step === 0 && <PlanCards onChoose={(p) => { setPlan(p); setStep(1); }} />}
    {step === 1 && <div>
      <ReviewSection title="Plan" onEdit={() => setStep(0)}><ReviewRow label="Plan" value={plan.name} /><ReviewRow label="Service fee" value={`${money(plan.monthlyFee)} / month`} /><ReviewRow label="Monthly hours" value={`${plan.monthlyHours} hours shared across all services`} /><ReviewRow label="Money-back guarantee" value="90 days if no sales are received" /></ReviewSection>
      <ReviewSection title={mode === "client" ? "Your details" : "Client"} onEdit={() => popup({ type: "info", title: "Update the details first", description: mode === "client" ? "Change your details on your Profile page, then come back to order." : "Edit the client's profile, then come back to place the order.", primaryLabel: "Got it", secondaryLabel: null })}>
        <ReviewRow label="Name" value={client.name} />{client.company && <ReviewRow label="Business" value={client.company} />}{client.email && <ReviewRow label="Email" value={client.email} />}{client.accountNumber && <ReviewRow label="Account number" value={formatAccountNumber(client.accountNumber)} />}
      </ReviewSection>
      <div className="flex gap-3"><Button variant="secondary" aria-label="Back" className="size-11 shrink-0 rounded-full" onClick={() => setStep(0)}><ArrowLeft /></Button><Button className="signup-primary flex-1" onClick={() => setStep(2)}>To the agreements <ArrowRight /></Button></div>
    </div>}
    {step === 2 && <div>
      <AgreementsList documents={documents} />
      <p className="mt-4 text-xs leading-relaxed text-muted-foreground">{mode === "client" ? "By accepting, you agree to the Service Agreement and the policies it refers to, and sign digitally with a confirmation code. Your signed copy is kept in your Documents." : "The client receives the Service Agreement with the order and accepts it by paying the first invoice."}</p>
      <div className="mt-5 flex gap-3"><Button variant="secondary" aria-label="Back" className="size-11 shrink-0 rounded-full" onClick={() => setStep(1)}><ArrowLeft /></Button>
        {mode === "client" ? <Button className="signup-primary flex-1" onClick={() => setSigning(true)}>Accept & sign <PenLine /></Button> : <Button className="signup-primary flex-1" onClick={confirmStaff}>Place order</Button>}</div>
      <SignDialog open={signing} onOpenChange={setSigning} title="Confirm your order" onSign={place} />
    </div>}
    {step === 3 && <div className="text-center">
      <span className="mx-auto grid size-14 place-items-center rounded-full bg-foreground text-background"><Check className="size-7" /></span>
      <p className="mx-auto mt-4 max-w-sm text-sm leading-relaxed text-muted-foreground">{mode === "client" ? `We emailed your first ${plan.name} invoice to ${client.email ?? "you"}. Your plan starts as soon as it's paid.` : `Stripe emailed the first ${plan.name} invoice to ${client.email ?? "the client"}. The plan starts when it's paid.`}</p>
      <Button className="signup-primary mt-6" onClick={onDone}>{doneLabel}</Button>
    </div>}
  </div>;
}
