import { createFileRoute, notFound, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState, type FormEvent } from "react";
import { DataTable, StatusBadge, type Column } from "@/components/admin/data-table";
import { Section } from "@/components/admin/record-bits";
import { usePopup } from "@/components/popup";
import { ActBtn, Actions, SubButtons, invoiceTotal, useClient, useClientActions, type R, type RecordKind } from "@/components/client/portal";
import { supabase } from "@/integrations/supabase/client";
import { formatAccount, formatDate, formatDay, money, statusLabel, type AppStatus } from "@/lib/admin";
import { stageLabel, type CollectionStage } from "@/lib/billing";
import { passwordIssue, profileUpdateSchema } from "@/lib/client";
import { requestPrivacy, updateMyProfile } from "@/lib/client.functions";

const sections = ["subscriptions", "projects", "tasks", "invoices", "payments", "applications", "support", "profile", "security"] as const;
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
  if (error) return <p className="text-sm text-destructive">{(error as Error).message}</p>;
  if (isLoading || !data) return <p className="text-sm text-muted-foreground">Loading…</p>;
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

    {s === "invoices" && table("Invoices", "invoice", data.invoices, [
      { key: "n", label: "Invoice", value: (r) => r.number },
      { key: "a", label: "Total", value: (r) => invoiceTotal(r), render: (r) => money(invoiceTotal(r)) },
      { key: "s", label: "Status", value: (r) => r.status, render: (r) => <StatusBadge status={r.status} /> },
      { key: "c", label: "Stage", value: (r) => r.collection_stage, render: (r) => r.collection_stage === "none" ? "—" : stageLabel[r.collection_stage as CollectionStage] },
      { key: "d", label: "Due", value: (r) => r.due_at ?? "", render: (r) => formatDay(r.due_at) },
      { key: "x", label: "Actions", value: () => "", render: (r) => <Actions kind="invoice" id={r.id}>
        {r.hosted_url && r.status !== "paid" && r.status !== "void" && <a href={r.hosted_url} target="_blank" rel="noopener noreferrer" className="h-8 rounded-full bg-foreground px-3 text-xs font-semibold leading-8 text-background">Pay now</a>}
        {r.pdf_url && <a href={r.pdf_url} target="_blank" rel="noopener noreferrer" className="h-8 rounded-full bg-secondary px-3 text-xs font-semibold leading-8">PDF</a>}
      </Actions> },
    ], <ActBtn onClick={a.portal}>Manage card and receipts</ActBtn>)}

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
      { key: "c", label: "Topic", value: (r) => r.category },
      { key: "u", label: "Updated", value: (r) => r.updated_at, render: (r) => formatDate(r.updated_at) },
      { key: "x", label: "Actions", value: () => "", render: (r) => <Actions kind="ticket" id={r.id}>{r.status !== "closed" && <ActBtn onClick={() => a.reply(r)}>Reply</ActBtn>}</Actions> },
    ], <ActBtn dark onClick={() => a.newTicket()}>New request</ActBtn>)}

    {s === "profile" && data.profile && <ProfileForm p={data.profile} refresh={a.refresh} />}
    {s === "security" && <SecurityPanel />}
    {a.modalEl}
  </>;
}

const fieldCls = "mt-1 h-10 w-full rounded-lg border bg-background px-2.5 text-sm outline-none focus:ring-2 focus:ring-ring";
const profileFields: [string, string, number][] = [["first_name", "First name", 80], ["last_name", "Last name", 80], ["company", "Business name", 160], ["phone", "Phone", 40], ["website", "Website", 200], ["industry", "Industry", 100], ["company_size", "Company size", 40], ["address_line", "Address", 200], ["city", "City", 100], ["state", "State or region", 100], ["postal_code", "Postal code", 20], ["country", "Country", 80], ["timezone", "Time zone", 60]];

function ProfileForm({ p, refresh }: { p: R; refresh: () => Promise<void> }) {
  const popup = usePopup();
  const save = useServerFn(updateMyProfile), privacy = useServerFn(requestPrivacy);
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const v: Record<string, unknown> = Object.fromEntries(profileFields.map(([k]) => [k, String(f.get(k) ?? "").trim() || null]));
    v["first_name"] = v["first_name"] ?? undefined; v["last_name"] = v["last_name"] ?? undefined;
    v["marketing_opt_in"] = f.get("marketing_opt_in") === "on"; v["sms_opt_in"] = f.get("sms_opt_in") === "on";
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
          {profileFields.map(([k, l, max]) => <label key={k} className="block"><span className="text-[13px] font-medium">{l}{(k === "first_name" || k === "last_name") && <span className="text-primary"> *</span>}</span>
            <input name={k} defaultValue={p[k] ?? ""} maxLength={max} className={fieldCls} /></label>)}
        </div>
        <div className="mt-4 space-y-2 text-sm">
          <label className="flex items-center gap-2"><input type="checkbox" name="marketing_opt_in" defaultChecked={!!p.marketing_opt_in} className="size-4 accent-primary" />Send me marketing emails</label>
          <label className="flex items-center gap-2"><input type="checkbox" name="sms_opt_in" defaultChecked={!!p.sms_opt_in} className="size-4 accent-primary" />Send me text messages</label>
        </div>
        <button type="submit" disabled={busy} className="mt-5 h-10 rounded-full bg-foreground px-6 text-sm font-semibold text-background">{busy ? "Saving…" : "Save changes"}</button>
      </form>
    </Section>
    <Section title="Your privacy">
      <div className="flex flex-wrap gap-2 p-5"><ActBtn onClick={() => ask("access")}>Request my data</ActBtn><ActBtn danger onClick={() => ask("deletion")}>Close my account</ActBtn></div>
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
    const issue = passwordIssue(pw);
    if (!current) return popup({ type: "error", title: "Enter your current password", description: "We need it to confirm it's you." });
    if (issue) return popup({ type: "error", title: "Choose a stronger password", description: issue });
    if (pw !== confirm) return popup({ type: "error", title: "Passwords don't match", description: "Type the same new password twice." });
    setBusy("pw");
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
    setBusy("email");
    const { error } = await supabase.auth.updateUser({ email }, { emailRedirectTo: `${window.location.origin}/dashboard` });
    setBusy(null);
    if (error) return popup({ type: "error", title: "Couldn't change email", description: error.message });
    popup({ type: "success", title: "Confirm your new email", description: "Open the links we sent to confirm the change.", primaryLabel: "Got it", secondaryLabel: null });
  };
  const signOutAll = () => popup({ type: "info", title: "Sign out everywhere?", description: "You'll be signed out on all devices, including this one.", primaryLabel: "Sign out", secondaryLabel: "Cancel",
    onPrimary: async () => { await supabase.auth.signOut({ scope: "global" }); navigate({ to: "/", replace: true }); } });
  return <div className="grid gap-6 xl:grid-cols-2">
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
      <Section title="Sessions"><div className="p-5"><ActBtn danger onClick={signOutAll}>Sign out of all devices</ActBtn></div></Section>
    </div>
  </div>;
}
