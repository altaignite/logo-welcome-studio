import { useQuery, useQueryClient } from "@tanstack/react-query";
import { friendlyError } from "@/lib/errors";
import { Link, useNavigate, useRouteContext } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState, type ReactNode } from "react";
import { Eye } from "lucide-react";
import { db } from "@/components/admin/record-bits";
import { FormModal, type FieldDef } from "@/components/admin/form-modal";
import { usePopup } from "@/components/popup";
import { pauseVoidsGuarantee } from "@/lib/billing";
import { approveOverage, billingPortal, subscriptionAction } from "@/lib/billing.functions";
import { changePlan, undoCancel } from "@/lib/client.functions";
import { claimGuarantee, replyToTicket, respondToInfoRequest, reviewDeliverable } from "@/lib/portal.functions";
import { TicketDialog } from "@/components/client/ticket-dialog";
import type { DepartmentId } from "@/lib/support";
import { plans } from "@/lib/signup";
import { money } from "@/lib/admin";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type R = any;
export type ClientData = Awaited<ReturnType<typeof loadClient>>;
export type RecordKind = "subscription" | "project" | "task" | "invoice" | "payment" | "application" | "ticket" | "deliverable" | "report";

async function loadClient(userId: string) {
  const own = async (t: string, order = "created_at") => ((await db.from(t).select("*").eq("user_id", userId).order(order, { ascending: false })).data ?? []) as R[];
  const [profile, subs, projects, tasks, apps, invoices, payments, tickets, messages, hours, deliverables, reports, documents, privacy, brief, events] = await Promise.all([
    db.from("profiles").select("*").eq("id", userId).maybeSingle().then((r: R) => r.data as R | null),
    own("subscriptions"), own("projects"), own("tasks"), own("applications"), own("invoices", "issued_at"), own("transactions"), own("support_tickets", "updated_at"),
    db.from("ticket_messages").select("*").eq("user_id", userId).eq("internal", false).order("created_at").then((r: R) => (r.data ?? []) as R[]),
    own("time_entries", "worked_on"), own("deliverables", "updated_at"), own("client_reports", "period_start"), own("documents"), own("compliance_requests"),
    db.from("onboarding_briefs").select("*").eq("user_id", userId).maybeSingle().then((r: R) => r.data as R | null),
    // Row level security returns only the events shared with the client.
    db.from("application_events").select("*").order("created_at").then((r: R) => (r.data ?? []) as R[]),
  ]);
  return { profile, subs, projects, tasks, apps, invoices, payments, tickets, messages, hours, deliverables, reports, documents, privacy, brief, events };
}

export function useClient() {
  const { userId, email } = useRouteContext({ from: "/dashboard" });
  const q = useQuery({ queryKey: ["client", userId], queryFn: () => loadClient(userId) });
  return { userId, email, ...q };
}

export const invoiceTotal = (i: R) => Number(i.amount) + Number(i.interest_accrued) + Number(i.fees_accrued);

/** Actions column: View link plus any context buttons. Clicks never trigger the row. */
export function Actions({ kind, id, children }: { kind: RecordKind; id: string; children?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
      {children}
      <Link to="/dashboard/$kind/$id" params={{ kind, id }} aria-label="View details" className="inline-flex h-8 items-center gap-1 rounded-full border px-3 text-xs font-semibold hover:bg-secondary"><Eye className="size-3.5" />View</Link>
    </div>
  );
}
export const ActBtn = ({ onClick, children, dark, danger }: { onClick: () => void; children: ReactNode; dark?: boolean; danger?: boolean }) => (
  <button type="button" onClick={onClick} className={`h-8 rounded-full px-3 text-xs font-semibold ${dark ? "bg-foreground text-background" : "bg-secondary"} ${danger ? "text-destructive" : ""}`}>{children}</button>
);

type Modal = { title: string; description?: string; fields: FieldDef[]; submitLabel: string; onSubmit: (v: R) => Promise<string | null> };

/** Shared client actions (subscriptions, tickets, extra hours, billing) with their modal. */
export function useClientActions() {
  const { userId, data } = useClient();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [ticket, setTicket] = useState<{ subscriptionId?: string; department?: DepartmentId; subject?: string } | null>(null);
  const popup = usePopup();
  const [modal, setModal] = useState<Modal | null>(null);
  const fnSub = useServerFn(subscriptionAction), fnPortal = useServerFn(billingPortal), fnApprove = useServerFn(approveOverage);
  const fnChange = useServerFn(changePlan), fnUndo = useServerFn(undoCancel);
  const fnReply = useServerFn(replyToTicket);
  const fnRespond = useServerFn(respondToInfoRequest), fnClaim = useServerFn(claimGuarantee), fnReview = useServerFn(reviewDeliverable);
  const refresh = () => qc.invalidateQueries({ queryKey: ["client"] });
  const fail = (e: unknown) => popup({ type: "error", title: "Something went wrong", description: friendlyError(e), primaryLabel: "Close", secondaryLabel: null });
  const err = (e: unknown) => friendlyError(e) || "Something went wrong.";

  const subAct = (s: R, action: "pause" | "resume" | "cancel_end") => action === "cancel_end" ? void navigate({ to: "/dashboard/change/$id", params: { id: s.id }, search: { action: "cancel" } }) : setModal({
    title: { pause: "Pause your plan", resume: "Resume your plan", cancel_end: "Cancel your plan" }[action], submitLabel: "Confirm",
    description: action === "pause" && s.guarantee_status === "running" && pauseVoidsGuarantee(s.started_at)
      ? "Pausing within your first 90 days ends your money-back guarantee. Work and billing stop while paused."
      : action === "pause" ? "Work and billing stop while paused." : "Work and billing restart today.",
    fields: [{ name: "reason", label: "Reason", type: "textarea", required: true }],
    onSubmit: async (v) => { try { await fnSub({ data: { subscriptionId: s.id, action, reason: v.reason } }); await refresh(); return null; } catch (e) { return err(e); } },
  });
  const undo = (s: R) => popup({ type: "info", title: "Keep your plan?", description: `Your ${s.plan_name} plan will keep renewing as normal.`, primaryLabel: "Keep plan", secondaryLabel: "Cancel",
    onPrimary: async () => { try { await fnUndo({ data: { subscriptionId: s.id } }); await refresh(); } catch (e) { fail(e); } } });
  const change = (s: R) => navigate({ to: "/dashboard/change/$id", params: { id: s.id } });

  const order = () => navigate({ to: "/dashboard/order" });

  const approve = (t: R) => popup({ type: "info", title: "Approve extra hours?", description: "This task needs more hours than your plan has left this month. Extra hours are billed at your plan's hourly rate.", primaryLabel: "Approve", secondaryLabel: "Not now",
    onPrimary: async () => { try { await fnApprove({ data: { taskId: t.id } }); await refresh(); } catch (e) { fail(e); } } });
  const portal = async () => { try { const r = await fnPortal(); window.location.href = r.url; } catch (e) { fail(e); } };
  const newTicket = (subscriptionId?: string, department?: DepartmentId, subject?: string) => setTicket({ ...(subscriptionId ? { subscriptionId } : {}), ...(department ? { department } : {}), ...(subject ? { subject } : {}) });
  const reply = (t: R) => setModal({
    title: "Reply", submitLabel: "Send", fields: [{ name: "body", label: "Message", type: "textarea", required: true, max: 5000 }],
    onSubmit: async (v) => { try { await fnReply({ data: { ticketId: t.id, body: v.body } }); await refresh(); return null; } catch (e) { return err(e); } },
  });
  const respond = (app: R) => setModal({
    title: "Send the information we asked for", submitLabel: "Send to the FP team",
    description: "Your reply is added to your application and our team picks it back up. To share files, upload them on this page first.",
    fields: [{ name: "message", label: "Your reply", type: "textarea", required: true, max: 4000 }],
    onSubmit: async (v) => { try { await fnRespond({ data: { applicationId: app.id, message: v.message } }); await refresh(); return null; } catch (e) { return err(e); } },
  });
  const claim = (s: R) => setModal({
    title: "Request your money-back refund", submitLabel: "Send request",
    description: "Your plan has run for 90 days and every invoice was paid on time. If you received no sales, we refund your service fees (advertising budgets aren't covered). We'll review your request and reply in a support ticket.",
    fields: [{ name: "statement", label: "What happened in your first 90 days?", type: "textarea", required: true, max: 4000 },
      { name: "confirm", label: "I confirm I received no sales in this period", type: "select", options: ["no", "yes"] }],
    onSubmit: async (v) => {
      if (v.confirm !== "yes") return "Confirm that you received no sales.";
      try { await fnClaim({ data: { subscriptionId: s.id, statement: v.statement, confirmNoSales: true } }); await refresh();
        popup({ type: "success", title: "Request sent", description: "We've opened a billing ticket for your refund request and will reply there.", primaryLabel: "Got it", secondaryLabel: null }); return null; }
      catch (e) { return err(e); }
    },
  });
  const review = (d: R, decision: "approved" | "changes_requested") => setModal(decision === "approved"
    ? { title: `Approve ${d.title}?`, submitLabel: "Approve", description: "Let the team know this is ready to go. You can add a note.", fields: [{ name: "feedback", label: "Note (optional)", type: "textarea", max: 4000 }],
      onSubmit: async (v) => { try { await fnReview({ data: { deliverableId: d.id, decision, ...(v.feedback ? { feedback: v.feedback } : {}) } }); await refresh(); return null; } catch (e) { return err(e); } } }
    : { title: "Request changes", submitLabel: "Send feedback", description: "Tell us what to change. The team will update it and send it back for review.", fields: [{ name: "feedback", label: "What should change?", type: "textarea", required: true, max: 4000 }],
      onSubmit: async (v) => { try { await fnReview({ data: { deliverableId: d.id, decision, feedback: v.feedback } }); await refresh(); return null; } catch (e) { return err(e); } } });
  const modalEl = <>
    {modal && <FormModal title={modal.title} description={modal.description} fields={modal.fields} submitLabel={modal.submitLabel} onClose={() => setModal(null)} onSubmit={modal.onSubmit} />}
    {ticket && <TicketDialog defaults={ticket} onClose={() => setTicket(null)} onCreated={refresh}
      plans={(data?.subs ?? []).filter((x: R) => x.status !== "cancelled").map((x: R) => ({ id: x.id, name: `${x.plan_name} plan` }))}
      projects={(data?.projects ?? []).filter((x: R) => x.status !== "cancelled").map((x: R) => ({ id: x.id, name: x.name }))} />}
  </>;
  return { subAct, undo, change, order, approve, portal, newTicket, reply, respond, claim, review, refresh, fail, modalEl, setModal };
}

/** Context buttons for a subscription, used in tables and on its details page. */
export function SubButtons({ s, a }: { s: R; a: ReturnType<typeof useClientActions> }) {
  return <>
    {s.status === "active" && <ActBtn onClick={() => a.change(s)}>Change plan</ActBtn>}
    {(s.status === "active" || s.status === "past_due") && <ActBtn onClick={() => a.subAct(s, "pause")}>Pause</ActBtn>}
    {s.status === "paused" && <ActBtn dark onClick={() => a.subAct(s, "resume")}>Resume</ActBtn>}
    {s.cancel_at_period_end ? <ActBtn dark onClick={() => a.undo(s)}>Keep plan</ActBtn>
      : ["active", "paused", "past_due"].includes(s.status) && <ActBtn danger onClick={() => a.subAct(s, "cancel_end")}>Cancel</ActBtn>}
  </>;
}
