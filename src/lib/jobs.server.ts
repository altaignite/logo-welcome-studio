/** Scheduled work run by /api/public/cron/notifications: the email outbox, reply-time checks and once-a-day reminders. */
import { must } from "@/lib/billing.server";
import { emailConfigured, sendEmail } from "@/lib/email.server";
import { EMAIL_BATCH, EMAIL_MAX_ATTEMPTS, emailDecision, renderEmail } from "@/lib/notifications";
import { slaState } from "@/lib/support";

type Admin = any;
const day = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (d: Date, n: number) => new Date(d.getTime() + n * 864e5);

/** Sends pending notification emails. Without an email provider they wait (and are dropped after a few days). */
export async function runOutbox(admin: Admin, origin: string, now = new Date()) {
  const configured = emailConfigured();
  const rows = must(await admin.from("notifications").select("id, title, body, link, email_to, email_attempts, created_at").eq("email_status", "pending").order("created_at").limit(EMAIL_BATCH)) ?? [];
  let sent = 0, skipped = 0, failed = 0;
  for (const n of rows) {
    const decision = emailDecision(n, configured, now);
    if (decision === "wait") continue;
    if (decision === "skip") { must(await admin.from("notifications").update({ email_status: "skipped", email_to: null }).eq("id", n.id)); skipped++; continue; }
    // Claim the attempt first, so two overlapping runs can't both send it.
    const claimed = must(await admin.from("notifications").update({ email_attempts: n.email_attempts + 1 }).eq("id", n.id).eq("email_attempts", n.email_attempts).eq("email_status", "pending").select("id"));
    if (!claimed?.length) continue;
    try {
      await sendEmail({ to: n.email_to, ...renderEmail(n, origin), idempotencyKey: `notification-${n.id}` });
      must(await admin.from("notifications").update({ email_status: "sent", emailed_at: now.toISOString(), email_to: null }).eq("id", n.id));
      sent++;
    } catch {
      if (n.email_attempts + 1 >= EMAIL_MAX_ATTEMPTS) must(await admin.from("notifications").update({ email_status: "failed", email_to: null }).eq("id", n.id));
      failed++;
    }
  }
  return { configured, sent, skipped, failed };
}

const notifyStaff = async (admin: Admin, perm: string, assigned: string | null, kind: string, title: string, body: string | null, link: string, dedupe: string) =>
  must(await admin.rpc("notify_staff", { _perm: perm, _assigned: assigned, _kind: kind, _title: title, _body: body, _link: link, _dedupe: dedupe }));
const notify = async (admin: Admin, user: string, kind: string, title: string, body: string | null, link: string, dedupe: string) =>
  must(await admin.rpc("notify", { _user: user, _kind: kind, _title: title, _body: body, _link: link, _email: true, _dedupe: dedupe }));

/** Tickets whose reply is overdue. Runs on every job run, since reply targets are hours, not days. */
export async function checkReplyTimes(admin: Admin, now = new Date()) {
  const tickets = must(await admin.from("support_tickets").select("id, subject, status, priority, created_at, first_response_at, last_client_message_at, last_staff_message_at, assigned_to").in("status", ["open", "in_progress"]).is("archived_at", null)) ?? [];
  let n = 0;
  for (const t of tickets) {
    if (slaState(t, now) !== "breached") continue;
    await notifyStaff(admin, "work", t.assigned_to, "ticket", `Reply overdue: ${t.subject}`, `${t.priority} priority`, `/admin/records/support_tickets/${t.id}`, `sla:${t.id}:${t.last_client_message_at ?? t.created_at}`);
    n++;
  }
  return n;
}

/** Follow-ups, due tasks, privacy deadlines and review reminders. Runs once per UTC day, however often the job is called. */
export async function runDailyReminders(admin: Admin, now = new Date()) {
  const today = day(now);
  must(await admin.from("job_runs").upsert({ name: "daily_reminders" }, { onConflict: "name", ignoreDuplicates: true }));
  const claimed = must(await admin.from("job_runs").update({ last_run_on: today, last_run_at: now.toISOString() }).eq("name", "daily_reminders").or(`last_run_on.is.null,last_run_on.lt.${today}`).select("name"));
  if (!claimed?.length) return { ran: false, sent: 0 };
  let sent = 0;
  const follow = must(await admin.from("crm_activities").select("id, subject, follow_up_at, actor_label").lte("follow_up_at", today).is("follow_up_done_at", null)) ?? [];
  for (const a of follow) { await notifyStaff(admin, "work", a.actor_label, "follow_up", `Follow-up due: ${a.subject}`, `Planned for ${a.follow_up_at}`, `/admin/records/crm_activities/${a.id}`, `followup:${a.id}:${a.follow_up_at}`); sent++; }
  const tasks = must(await admin.from("tasks").select("id, title, due_at, assigned_to").lte("due_at", today).not("status", "in", "(completed,cancelled)")) ?? [];
  for (const t of tasks) { await notifyStaff(admin, "work", t.assigned_to, "task", `${t.due_at < today ? "Overdue" : "Due today"}: ${t.title}`, null, `/admin/records/tasks/${t.id}`, `task-due:${t.id}:${t.due_at}`); sent++; }
  const privacy = must(await admin.from("compliance_requests").select("id, kind, due_at").eq("status", "open").lte("due_at", day(addDays(now, 7)))) ?? [];
  for (const r of privacy) {
    const late = r.due_at < today;
    await notifyStaff(admin, "work", null, "privacy", `Privacy request ${late ? "overdue" : `due ${r.due_at}`}: ${String(r.kind).replaceAll("_", " ")}`, "Privacy laws set strict response deadlines.", `/admin/records/compliance_requests/${r.id}`, `privacy-${late ? "overdue" : "due"}:${r.id}`);
    sent++;
  }
  const reviews = must(await admin.from("deliverables").select("id, user_id, title, review_round").eq("status", "in_review").lte("submitted_at", addDays(now, -5).toISOString())) ?? [];
  for (const d of reviews) { await notify(admin, d.user_id, "deliverable", `Reminder: ${d.title} is waiting for your review`, null, `/dashboard/deliverable/${d.id}`, `review-reminder:${d.id}:${d.review_round}`); sent++; }
  return { ran: true, sent };
}
