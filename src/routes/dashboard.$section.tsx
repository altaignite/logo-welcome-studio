import { CountryField } from "@/components/country-field";
import { createFileRoute, Link, notFound, useNavigate } from "@tanstack/react-router";
import { ErrorState, PageSkeleton, SectionSkeleton } from "@/components/loading";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { DataTable, StatusBadge, type Column } from "@/components/admin/data-table";
import { Section } from "@/components/admin/record-bits";
import { usePopup } from "@/components/popup";
import { SwitchField } from "@/components/switch-field";
import { ActBtn, Actions, SubButtons, invoiceTotal, useClient, useClientActions, type R, type RecordKind } from "@/components/client/portal";
import { supabase } from "@/integrations/supabase/client";
import { formatAccount, formatDate, formatDay, humanize, money, statusLabel, type AppStatus } from "@/lib/admin";
import { stageLabel, type CollectionStage } from "@/lib/billing";
import { profileUpdateSchema } from "@/lib/client";
import { passwordProblem } from "@/lib/passwords";
import { requestPrivacy, updateMyProfile } from "@/lib/client.functions";
import { myAgreements, saveOnboardingBrief } from "@/lib/portal.functions";
import { AgreementList, DocumentList, UploadButton } from "@/components/files";
import { MyPaymentCards, PayInvoiceButton } from "@/components/payment-cards";
import { MfaSettings } from "@/components/mfa";
import { isBlockedDomain } from "@/lib/disposable-domains";
import { departmentLabel } from "@/lib/support";
import { briefQuestions, missingAnswers, type BriefAnswers } from "@/lib/onboarding";
import { deliverableLabel, hoursByMonth } from "@/lib/work";

const sections = ["subscriptions", "onboarding", "projects", "deliverables", "tasks", "reports", "documents", "invoices", "payments", "applications", "support", "profile", "security"] as const;
type S = (typeof sections)[number];

export const Route = createFileRoute("/dashboard/$section")({
  beforeLoad: ({ params }) => { if (!(sections as readonly string[]).includes(params.section)) throw notFound(); },
  component: SectionPage,
});

function SectionPage() {
  const { section } = Route.useParams();
  const { data, isLoading, error } = useClient();
  const a = useClientActions();
  const navigate = useNavigate();
  const popup = usePopup();
  // Back from Stripe's card update: renewals use the new card once Stripe confirms it (customer.updated webhook).
  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.get("card") !== "updated") return;
    url.searchParams.delete("card"); window.history.replaceState(null, "", url);
    popup({ type: "success", title: "Payment card updated", description: "Your plans renew on your new card from now on. Open invoices can be paid with it too.", primaryLabel: "Got it", secondaryLabel: null });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  if (error) return <ErrorState error={error} retry={() => location.reload()} />;
  if (isLoading || !data) return <PageSkeleton />;
  const open = (kind: RecordKind) => (r: R) => navigate({ to: "/dashboard/$kind/$id", params: { kind, id: r.id } });
  const subName = (id: string | null) => data.subs.find((s) => s.id === id)?.plan_name ?? "—";
  const s = section as S;
  const table = (title: string, kind: RecordKind, rows: R[], columns: Column<R>[], toolbar?: React.ReactNode) =>
    <DataTable<R> title={title} rows={rows} onRowClick={open(kind)} toolbar={toolbar} empty={`No ${title.toLowerCase()} yet.`} columns={columns} />;

  return <>
    {s === "subscriptions" && table("Subscriptions", "subscription", data.subs, [
      { key: "p", label: "Plan", value: (r) => r.plan_name },
      { key: "s", label: "Status", value: (r) => r.status, render: (r) => <StatusBadge status={r.status} /> },
      { key: "f", label: "Monthly fee", value: (r) => r.monthly_fee, render: (r) => money(r.monthly_fee) },
      { key: "h", label: "Hours used", value: (r) => r.hours_used, render: (r) => `${r.hours_used} of ${r.monthly_hours}` },
      { key: "r", label: "Renews", value: (r) => r.renews_at ?? "", render: (r) => r.cancel_at_period_end ? `Ends ${formatDay(r.renews_at)}` : formatDay(r.renews_at) },
      { key: "a", label: "Actions", value: () => "", render: (r) => <Actions kind="subscription" id={r.id}><SubButtons s={r} a={a} /></Actions> },
    ], <ActBtn dark onClick={a.order}>Add a plan</ActBtn>)}

    {s === "onboarding" && <BriefForm brief={data.brief} refresh={a.refresh} />}

    {s === "deliverables" && table("Deliverables", "deliverable", data.deliverables, [
      { key: "t", label: "Deliverable", value: (r) => r.title },
      { key: "p", label: "Project", value: (r) => data.projects.find((x) => x.id === r.project_id)?.name ?? "—" },
      { key: "s", label: "Status", value: (r) => r.status, render: (r) => <StatusBadge status={r.status} label={deliverableLabel[r.status]} /> },
      { key: "d", label: "Sent", value: (r) => r.submitted_at ?? "", render: (r) => formatDate(r.submitted_at) },
      { key: "a", label: "Actions", value: () => "", render: (r) => <Actions kind="deliverable" id={r.id}>{r.status === "in_review" && <><ActBtn dark onClick={() => a.review(r, "approved")}>Approve</ActBtn><ActBtn onClick={() => a.review(r, "changes_requested")}>Request changes</ActBtn></>}</Actions> },
    ])}

    {s === "reports" && <>
      {table("Reports", "report", data.reports, [
        { key: "t", label: "Report", value: (r) => r.title },
        { key: "p", label: "Period", value: (r) => r.period_start, render: (r) => new Date(`${r.period_start}T00:00:00Z`).toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" }) },
        { key: "d", label: "Published", value: (r) => r.published_at ?? "", render: (r) => formatDate(r.published_at) },
        { key: "a", label: "Actions", value: () => "", render: (r) => <Actions kind="report" id={r.id} /> },
      ])}
      <Section title="Hours by month">
        <ul className="divide-y text-sm">{hoursByMonth(data.hours).map((h) => <li key={h.month} className="flex justify-between px-5 py-3"><span>{h.label}</span><span className="font-semibold">{h.hours} h</span></li>)}
          {data.hours.length === 0 && <li className="px-5 py-6 text-muted-foreground">No hours logged yet.</li>}</ul>
      </Section>
    </>}

    {s === "documents" && <DocumentsPanel docs={data.documents} refresh={a.refresh} />}

    {s === "projects" && table("Projects", "project", data.projects, [
      { key: "n", label: "Project", value: (r) => r.name },
      { key: "p", label: "Plan", value: (r) => subName(r.subscription_id) },
      { key: "s", label: "Status", value: (r) => r.status, render: (r) => <StatusBadge status={r.status} /> },
      { key: "h", label: "Hours logged", value: (r) => r.hours },
      { key: "d", label: "Due", value: (r) => r.due_at ?? "", render: (r) => formatDay(r.due_at) },
      { key: "a", label: "Actions", value: () => "", render: (r) => <Actions kind="project" id={r.id} /> },
    ])}

    {s === "tasks" && table("Tasks", "task", data.tasks, [
      { key: "t", label: "Task", value: (r) => r.title },
      { key: "s", label: "Status", value: (r) => r.status, render: (r) => <StatusBadge status={r.status} /> },
      { key: "p", label: "Priority", value: (r) => r.priority },
      { key: "d", label: "Due", value: (r) => r.due_at ?? "", render: (r) => formatDay(r.due_at) },
      { key: "o", label: "Extra hours", value: (r) => (r.over_allowance ? (r.overage_approved ? "Approved" : "Needs approval") : "—") },
      { key: "a", label: "Actions", value: () => "", render: (r) => <Actions kind="task" id={r.id}>{r.over_allowance && !r.overage_approved && <ActBtn dark onClick={() => a.approve(r)}>Approve hours</ActBtn>}</Actions> },
    ])}

    {s === "invoices" && <MyPaymentCards />}
    {s === "invoices" && table("Invoices", "invoice", data.invoices, [
      { key: "n", label: "Invoice", value: (r) => r.number },
      { key: "a", label: "Total", value: (r) => invoiceTotal(r), render: (r) => money(invoiceTotal(r)) },
      { key: "s", label: "Status", value: (r) => r.status, render: (r) => <StatusBadge status={r.status} /> },
      { key: "c", label: "Stage", value: (r) => r.collection_stage, render: (r) => r.collection_stage === "none" ? "—" : stageLabel[r.collection_stage as CollectionStage] },
      { key: "d", label: "Due", value: (r) => r.due_at ?? "", render: (r) => formatDay(r.due_at) },
      { key: "x", label: "Actions", value: () => "", render: (r) => <Actions kind="invoice" id={r.id}>
        {r.status !== "paid" && r.status !== "void" && (r.stripe_invoice_id || r.hosted_url) && <PayInvoiceButton invoice={r as { id: string; number: string; hosted_url?: string | null }} />}
        {r.pdf_url && <a href={r.pdf_url} target="_blank" rel="noopener noreferrer" className="h-8 rounded-full bg-secondary px-3 text-xs font-semibold leading-8">PDF</a>}
      </Actions> },
    ])}

    {s === "payments" && table("Payments", "payment", data.payments, [
      { key: "r", label: "Reference", value: (r) => r.reference },
      { key: "d", label: "Description", value: (r) => r.description },
      { key: "a", label: "Amount", value: (r) => r.amount, render: (r) => money(r.amount) },
      { key: "s", label: "Status", value: (r) => r.status, render: (r) => <StatusBadge status={r.status} /> },
      { key: "c", label: "Date", value: (r) => r.created_at, render: (r) => formatDate(r.created_at) },
      { key: "x", label: "Actions", value: () => "", render: (r) => <Actions kind="payment" id={r.id} /> },
    ])}

    {s === "applications" && table("Applications", "application", data.apps, [
      { key: "p", label: "Plan", value: (r) => r.plan_name },
      { key: "s", label: "Status", value: (r) => r.status, render: (r) => <StatusBadge status={r.status} label={statusLabel[r.status as AppStatus]} /> },
      { key: "c", label: "Submitted", value: (r) => r.created_at, render: (r) => formatDate(r.created_at) },
      { key: "d", label: "Decided", value: (r) => r.decided_at ?? "", render: (r) => formatDate(r.decided_at) },
      { key: "x", label: "Actions", value: () => "", render: (r) => <Actions kind="application" id={r.id} /> },
    ])}

    {s === "support" && table("Support tickets", "ticket", data.tickets, [
      { key: "s", label: "Subject", value: (r) => r.subject },
      { key: "st", label: "Status", value: (r) => r.status, render: (r) => <StatusBadge status={r.status} /> },
      { key: "c", label: "Department", value: (r) => departmentLabel(r.department ?? r.category) },
      { key: "u", label: "Updated", value: (r) => r.updated_at, render: (r) => formatDate(r.updated_at) },
      { key: "x", label: "Actions", value: () => "", render: (r) => <Actions kind="ticket" id={r.id}>{r.status !== "closed" && <ActBtn onClick={() => a.reply(r)}>Reply</ActBtn>}</Actions> },
    ], <ActBtn dark onClick={() => a.newTicket()}>New request</ActBtn>)}

    {s === "profile" && data.profile && <ProfileForm p={data.profile} privacyRows={data.privacy} refresh={a.refresh} />}
    {s === "security" && <SecurityPanel />}
    {a.modalEl}
  </>;
}

const fieldCls = "mt-1 h-10 w-full rounded-lg border bg-background px-2.5 text-sm outline-none focus:ring-2 focus:ring-ring";
/** Country picker for the profile form; saves the two-letter code like signup does. */
function ProfileCountry({ initial }: { initial: string }) {
  const [value, setValue] = useState(initial);
  return <><input type="hidden" name="country" value={value} /><CountryField value={value} onChange={setValue} /></>;
}
const profileFields: [string, string, number][] = [["first_name", "First name", 80], ["last_name", "Last name", 80], ["company", "Business name", 160], ["phone", "Phone", 40], ["website", "Website", 200], ["industry", "Industry", 100], ["company_size", "Company size", 40], ["address_line", "Address", 200], ["city", "City", 100], ["state", "State or region", 100], ["postal_code", "Postal code", 20], ["country", "Country", 80], ["timezone", "Time zone", 60]];

function ProfileForm({ p, privacyRows, refresh }: { p: R; privacyRows: R[]; refresh: () => Promise<void> }) {
  const popup = usePopup();
  const save = useServerFn(updateMyProfile), privacy = useServerFn(requestPrivacy);
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const v: Record<string, unknown> = Object.fromEntries(profileFields.map(([k]) => [k, String(f.get(k) ?? "").trim() || null]));
    v["first_name"] = v["first_name"] ?? undefined; v["last_name"] = v["last_name"] ?? undefined;
    v["marketing_opt_in"] = f.get("marketing_opt_in") === "on"; v["sms_opt_in"] = f.get("sms_opt_in") === "on"; v["email_notifications"] = f.get("email_notifications") === "on";
    const parsed = profileUpdateSchema.safeParse(v);
    if (!parsed.success) { popup({ type: "error", title: "Please check your details", description: parsed.error.issues[0]?.message ?? "Some fields are too long." }); return; }
    setBusy(true);
    try { await save({ data: parsed.data }); await refresh(); popup({ type: "success", title: "Details saved", description: "Your profile is up to date.", primaryLabel: "Done", secondaryLabel: null }); }
    catch (err) { popup({ type: "error", title: "Couldn't save", description: (err as Error).message }); }
    setBusy(false);
  };
  const ask = (kind: "access" | "deletion") => popup({
    type: "info", title: kind === "access" ? "Request a copy of your data?" : "Request account closure?",
    description: kind === "access" ? "We'll prepare a copy of your personal data within 30 days." : "We'll close your account within 30 days. Billing records we must keep by law are retained.",
    primaryLabel: "Send request", secondaryLabel: "Cancel",
    onPrimary: async () => { try { await privacy({ data: { kind } }); popup({ type: "success", title: "Request sent", description: "Our team will be in touch.", primaryLabel: "Got it", secondaryLabel: null }); } catch (err) { popup({ type: "error", title: "Couldn't send request", description: (err as Error).message }); } },
  });
  return <>
    <Section title="Your details">
      <form onSubmit={submit} className="p-5">
        <p className="mb-4 text-sm text-muted-foreground">Account number {formatAccount(p.account_number)}. Email {p.email}. To change your email, use Security.</p>
        <div className="grid gap-4 sm:grid-cols-2">
          {profileFields.map(([k, l, max]) => k === "country" ? <div key={k} className="block"><span className="text-[13px] font-medium">{l}</span><ProfileCountry initial={p.country ?? ""} /></div>
            : <label key={k} className="block"><span className="text-[13px] font-medium">{l}{(k === "first_name" || k === "last_name") && <span className="text-primary"> *</span>}</span>
            <input name={k} defaultValue={p[k] ?? ""} maxLength={max} className={fieldCls} /></label>)}
        </div>
        <div className="mt-4 max-w-md space-y-3">
          <SwitchField name="marketing_opt_in" defaultChecked={!!p.marketing_opt_in} label="Send me marketing emails" />
          <SwitchField name="sms_opt_in" defaultChecked={!!p.sms_opt_in} label="Send me text messages" />
          <SwitchField name="email_notifications" defaultChecked={p.email_notifications !== false} label="Email me about replies, reviews, invoices and account updates" />
        </div>
        <button type="submit" disabled={busy} className="mt-5 h-10 rounded-full bg-foreground px-6 text-sm font-semibold text-background">{busy ? "Saving…" : "Save changes"}</button>
      </form>
    </Section>
    <Section title="Your privacy">
      <div className="flex flex-wrap gap-2 p-5"><ActBtn onClick={() => ask("access")}>Request my data</ActBtn><ActBtn danger onClick={() => ask("deletion")}>Close my account</ActBtn></div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t px-5 py-4 text-sm"><span><span className="block font-medium">Close my account</span><span className="text-muted-foreground">Plans end at the end of their paid period; invoices stay payable.</span></span>
        <Link to="/dashboard/close" className="inline-flex h-9 items-center rounded-full border border-destructive/40 px-4 text-xs font-semibold text-destructive">Close account</Link></div>
      {privacyRows.length > 0 && <ul className="divide-y border-t text-sm">{privacyRows.map((r) => <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3">
        <span><span className="block font-medium capitalize">{humanize(r.kind)} request</span><span className="text-xs text-muted-foreground">Sent {formatDate(r.created_at)}{r.status === "open" ? `, due by ${formatDay(r.due_at)}` : ""}{r.outcome_note ? `. ${r.outcome_note}` : ""}</span></span>
        <StatusBadge status={r.status} /></li>)}</ul>}
    </Section>
  </>;
}

function SecurityPanel() {
  const popup = usePopup();
  const navigate = useNavigate();
  const [busy, setBusy] = useState<string | null>(null);
  const changePw = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget); const form = e.currentTarget;
    const current = String(f.get("current") ?? ""), pw = String(f.get("password") ?? ""), confirm = String(f.get("confirm") ?? "");
    if (!current) return popup({ type: "error", title: "Enter your current password", description: "We need it to confirm it's you." });
    if (pw !== confirm) return popup({ type: "error", title: "Passwords don't match", description: "Type the same new password twice." });
    if (pw === current) return popup({ type: "error", title: "Choose a new password", description: "Your new password must be different from the current one." });
    setBusy("pw");
    const issue = await passwordProblem(pw, (await supabase.auth.getUser()).data.user?.email);
    if (issue) { setBusy(null); return popup({ type: "error", title: "Choose a different password", description: issue }); }
    const { error } = await supabase.auth.updateUser({ password: pw, current_password: current } as never);
    setBusy(null);
    if (error) return popup({ type: "error", title: "Couldn't change password", description: error.message });
    form.reset();
    popup({ type: "success", title: "Password changed", description: "Use your new password next time you log in.", primaryLabel: "Done", secondaryLabel: null });
  };
  const changeEmail = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const email = String(new FormData(e.currentTarget).get("email") ?? "").trim();
    if (!/^\S+@\S+\.\S+$/.test(email)) return popup({ type: "error", title: "Enter a valid email", description: "We'll send a confirmation link there." });
    if (isBlockedDomain(email)) return popup({ type: "error", title: "Use a permanent email address", description: "Disposable email addresses can't be used." });
    setBusy("email");
    const { error } = await supabase.auth.updateUser({ email }, { emailRedirectTo: `${window.location.origin}/dashboard` });
    setBusy(null);
    if (error) return popup({ type: "error", title: "Couldn't change email", description: error.message });
    popup({ type: "success", title: "Confirm your new email", description: "Open the links we sent to confirm the change.", primaryLabel: "Got it", secondaryLabel: null });
  };
  const signOutAll = () => popup({ type: "info", title: "Sign out everywhere?", description: "You'll be signed out on all devices, including this one.", primaryLabel: "Sign out", secondaryLabel: "Cancel",
    onPrimary: async () => { await supabase.auth.signOut({ scope: "global" }); navigate({ to: "/", replace: true }); } });
  return <div className="space-y-6">
    <Section title="Change password">
      <form onSubmit={changePw} className="space-y-3 p-5">
        {[["current", "Current password", "current-password"], ["password", "New password", "new-password"], ["confirm", "Confirm new password", "new-password"]].map(([n, l, ac]) =>
          <label key={n} className="block"><span className="text-[13px] font-medium">{l}<span className="text-primary"> *</span></span><input name={n} type="password" autoComplete={ac} className={fieldCls} /></label>)}
        <p className="text-xs text-muted-foreground">At least 10 characters with upper and lower case letters and a number.</p>
        <button type="submit" disabled={busy === "pw"} className="h-10 rounded-full bg-foreground px-6 text-sm font-semibold text-background">{busy === "pw" ? "Saving…" : "Change password"}</button>
      </form>
    </Section>
    <div className="space-y-6">
      <Section title="Change email">
        <form onSubmit={changeEmail} className="space-y-3 p-5">
          <label className="block"><span className="text-[13px] font-medium">New email<span className="text-primary"> *</span></span><input name="email" type="email" autoComplete="email" className={fieldCls} /></label>
          <button type="submit" disabled={busy === "email"} className="h-10 rounded-full bg-foreground px-6 text-sm font-semibold text-background">{busy === "email" ? "Sending…" : "Send confirmation"}</button>
        </form>
      </Section>
      <Section title="Two-factor authentication (optional)"><MfaSettings /></Section>
      <Section title="Sessions"><div className="p-5"><ActBtn danger onClick={signOutAll}>Sign out of all devices</ActBtn></div></Section>
    </div>
  </div>;
}

function DocumentsPanel({ docs, refresh }: { docs: R[]; refresh: () => Promise<void> }) {
  const load = useServerFn(myAgreements);
  const agreements = useQuery({ queryKey: ["client", "agreements"], queryFn: () => load() });
  const mine = docs.filter((d) => d.kind === "file" || d.kind === "export");
  return <div className="space-y-6">
    <Section title="Your files" actions={<UploadButton onDone={refresh} label="Upload a file" />}>
      <p className="border-b px-5 py-3 text-xs text-muted-foreground">Share logos, brand guides, photos and documents with the FP team. Up to 25 MB per file. Never upload passwords.</p>
      <DocumentList docs={mine} empty="No files yet. Upload your logo or brand guide to get started." />
    </Section>
    <Section title="Signed agreements">
      {agreements.isLoading ? <SectionSkeleton /> : <AgreementList agreements={agreements.data ?? []} empty="Agreements you sign appear here." />}
    </Section>
    {docs.some((d) => d.kind === "deliverable" || d.kind === "report") && <Section title="Files from deliverables and reports"><DocumentList docs={docs.filter((d) => d.kind === "deliverable" || d.kind === "report")} /></Section>}
  </div>;
}

function BriefForm({ brief, refresh }: { brief: R | null; refresh: () => Promise<void> }) {
  const popup = usePopup();
  const save = useServerFn(saveOnboardingBrief);
  const [answers, setAnswers] = useState<BriefAnswers>(() => (brief?.answers ?? {}) as BriefAnswers);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (brief?.answers) setAnswers(brief.answers as BriefAnswers); }, [brief?.updated_at]); // eslint-disable-line react-hooks/exhaustive-deps
  const submit = async (send: boolean) => {
    if (send) { const missing = missingAnswers(answers); if (missing.length) return popup({ type: "error", title: "A few answers are missing", description: missing.join("; "), primaryLabel: "Got it", secondaryLabel: null }); }
    setBusy(true);
    try {
      await save({ data: { answers, submit: send } }); await refresh();
      popup({ type: "success", title: send ? "Brief sent" : "Draft saved", description: send ? "Thank you. Your team will use this to plan your first month." : "You can come back and finish it any time.", primaryLabel: "Done", secondaryLabel: null });
    } catch (e) { popup({ type: "error", title: "Couldn't save", description: (e as Error).message, primaryLabel: "Close", secondaryLabel: null }); }
    setBusy(false);
  };
  return <Section title="Onboarding brief">
    <div className="space-y-4 p-5">
      <p className="text-sm text-muted-foreground">{brief?.submitted_at ? `Sent ${formatDate(brief.submitted_at)}. You can still update your answers.` : "Tell us about your business so we can plan your first month. Save a draft any time."}</p>
      {briefQuestions.map((q) => <label key={q.id} className="block">
        <span className="text-[13px] font-medium">{q.label}{q.required && <span className="text-primary"> *</span>}</span>
        {q.help && <span className="block text-xs text-muted-foreground">{q.help}</span>}
        {q.type === "textarea" ? <textarea value={answers[q.id] ?? ""} maxLength={q.max} rows={3} onChange={(e) => setAnswers({ ...answers, [q.id]: e.target.value })} className="mt-1 w-full rounded-lg border bg-background p-2.5 text-sm outline-none focus:ring-2 focus:ring-ring" />
          : q.type === "select" ? <select value={answers[q.id] ?? ""} onChange={(e) => setAnswers({ ...answers, [q.id]: e.target.value })} className={fieldCls}><option value="">Choose…</option>{q.options!.map((o) => <option key={o}>{o}</option>)}</select>
          : <input type={q.type === "url" ? "url" : "text"} value={answers[q.id] ?? ""} maxLength={q.max} placeholder={q.type === "url" ? "https://" : undefined} onChange={(e) => setAnswers({ ...answers, [q.id]: e.target.value })} className={fieldCls} />}
      </label>)}
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={busy} onClick={() => submit(true)} className="h-10 rounded-full bg-foreground px-6 text-sm font-semibold text-background">{brief?.submitted_at ? "Save changes" : "Send brief"}</button>
        {!brief?.submitted_at && <button type="button" disabled={busy} onClick={() => submit(false)} className="h-10 rounded-full border px-6 text-sm font-semibold">Save draft</button>}
      </div>
    </div>
  </Section>;
}
