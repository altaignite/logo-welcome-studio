import { useState, type ReactNode } from "react";
import { ArrowLeft, ArrowRight, Check, PenLine } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ReviewRow, ReviewSection, SignDialog } from "@/components/order-flow";
import { changeReasons, exitQuestions, type ChangeKind } from "@/lib/changes";

export type Application = { reason: string; details: string; feedback: Record<string, string> };

/** Step shell shared by the change and closure flows: same centred column and headings as signup. */
export function FlowStep({ title, subtitle, children, wide }: { title: string; subtitle?: string; children: ReactNode; wide?: boolean }) {
  return <div className={`mx-auto pb-10 ${wide ? "max-w-4xl" : "max-w-lg"}`}>
    <div className="mb-6 text-center"><h1 className="text-2xl font-extrabold leading-tight">{title}</h1>{subtitle && <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground">{subtitle}</p>}</div>
    {children}
  </div>;
}

export function NavButtons({ onBack, onNext, nextLabel, nextIcon, disabled }: { onBack?: () => void; onNext: () => void; nextLabel: string; nextIcon?: ReactNode; disabled?: boolean }) {
  return <div className="mt-6 flex gap-3">
    {onBack && <Button type="button" variant="secondary" aria-label="Back" className="size-11 shrink-0 rounded-full" onClick={onBack}><ArrowLeft /></Button>}
    <Button type="button" disabled={disabled} className="signup-primary flex-1" onClick={onNext}>{nextLabel}{nextIcon ?? <ArrowRight />}</Button>
  </div>;
}

/** Reason, details and (for cancellations and closures) exit questions. */
export function ReasonForm({ kind, value, onChange }: { kind: ChangeKind; value: Application; onChange: (v: Application) => void }) {
  const exit = kind === "cancel" || kind === "close_account";
  return <div className="space-y-5">
    <fieldset>
      <legend className="text-[13px] font-medium">Main reason<span className="text-primary">*</span></legend>
      <div className="mt-2 divide-y rounded-xl border">{changeReasons[kind].map((r) => <label key={r} className="flex cursor-pointer items-center gap-3 px-4 py-3 text-sm">
        <input type="radio" name="reason" className="size-4 accent-foreground" checked={value.reason === r} onChange={() => onChange({ ...value, reason: r })} />{r}</label>)}</div>
    </fieldset>
    <label className="block"><span className="text-[13px] font-medium">Tell us more{value.reason === "Other" && <span className="text-primary">*</span>}</span>
      <textarea rows={3} maxLength={3000} value={value.details} onChange={(e) => onChange({ ...value, details: e.target.value })} className="signup-input mt-1.5 h-auto py-2.5" placeholder="Anything that helps us understand" /></label>
    {exit && exitQuestions.map((q) => <label key={q.id} className="block"><span className="text-[13px] font-medium">{q.label}</span>
      <textarea rows={2} maxLength={1000} value={value.feedback[q.id] ?? ""} onChange={(e) => onChange({ ...value, feedback: { ...value.feedback, [q.id]: e.target.value } })} className="signup-input mt-1.5 h-auto py-2.5" /></label>)}
  </div>;
}

export const applicationIssue = (a: Application) => (!a.reason ? "Choose the main reason." : a.reason === "Other" && a.details.trim().length < 3 ? "Tell us a little more about your reason." : null);

/** "What happens" summary, then sign. */
export function ReviewAndSign({ rows, notes, children, onBack, signTitle, onSign, confirmLabel }: { rows: [string, string][]; notes: string[]; children?: ReactNode; onBack: () => void; signTitle: string; onSign: () => Promise<boolean>; confirmLabel: string }) {
  const [open, setOpen] = useState(false);
  return <>
    <ReviewSection title="Your application" onEdit={onBack}>{rows.map(([k, v]) => <ReviewRow key={k} label={k} value={v} />)}</ReviewSection>
    <ul className="space-y-2 text-sm text-muted-foreground">{notes.map((n) => <li key={n} className="flex gap-2"><Check className="mt-0.5 size-4 shrink-0 text-foreground" />{n}</li>)}</ul>
    {children}
    <NavButtons onBack={onBack} onNext={() => setOpen(true)} nextLabel={confirmLabel} nextIcon={<PenLine />} />
    <SignDialog open={open} onOpenChange={setOpen} title={signTitle} onSign={onSign} />
  </>;
}

export function DoneStep({ title, text, action }: { title: string; text: string; action: ReactNode }) {
  return <div className="mx-auto max-w-lg pb-10 text-center">
    <span className="mx-auto grid size-14 place-items-center rounded-full bg-foreground text-background"><Check className="size-7" /></span>
    <h1 className="mt-5 text-2xl font-extrabold">{title}</h1>
    <p className="mx-auto mt-3 max-w-sm text-sm leading-relaxed text-muted-foreground">{text}</p>
    <div className="mt-6">{action}</div>
  </div>;
}
