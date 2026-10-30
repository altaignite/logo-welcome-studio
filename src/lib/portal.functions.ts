import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { limited, requireSession } from "@/lib/session.middleware";
import { clientResponse } from "@/lib/admin";
import { guaranteeClaimSchema, infoResponseSchema } from "@/lib/client";
import { briefSchema, missingAnswers } from "@/lib/onboarding";
import { reviewDecision } from "@/lib/work";

const uuid = z.string().uuid();
const label = (c: { claims: any }) => String(c.claims?.email ?? "Client");
const fileInput = z.object({ name: z.string().min(1).max(255), size: z.number().int().positive(), type: z.string().max(120) });

/** Client answers an information request: their reply is shared on the timeline and the application goes back to review. */
export const respondToInfoRequest = createServerFn({ method: "POST" })
  .middleware([limited("infoReply")])
  .inputValidator((d: unknown) => infoResponseSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { getAdmin, must } = await import("@/lib/billing.server");
    const admin = await getAdmin();
    const app = must(await admin.from("applications").select("id, user_id, status").eq("id", data.applicationId).maybeSingle());
    if (!app || app.user_id !== context.userId) throw new Error("Application not found.");
    if (app.status !== clientResponse.from) throw new Error("We aren't waiting for information on this application.");
    const moved = must(await admin.from("applications").update({ status: clientResponse.to, updated_at: new Date().toISOString() }).eq("id", app.id).eq("status", clientResponse.from).select("id"));
    if (!moved?.length) throw new Error("This application just changed. Refresh to see the latest.");
    must(await admin.from("application_events").insert({ application_id: app.id, actor_id: context.userId, actor_label: label(context), action: "Client sent the requested information",
      from_status: clientResponse.from, to_status: clientResponse.to, note: data.message, visible_to_client: true }));
    return { ok: true };
  });

/** Client claims the 90-day money-back guarantee. Staff review it from a high-priority billing ticket and refund through Stripe. */
export const claimGuarantee = createServerFn({ method: "POST" })
  .middleware([limited("guarantee")])
  .inputValidator((d: unknown) => guaranteeClaimSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { getAdmin, must } = await import("@/lib/billing.server");
    const { audit } = await import("@/lib/stripe.server");
    const { guaranteeClaimable } = await import("@/lib/client");
    const admin = await getAdmin();
    const sub = must(await admin.from("subscriptions").select("*").eq("id", data.subscriptionId).maybeSingle());
    if (!sub || sub.user_id !== context.userId) throw new Error("Subscription not found.");
    const invoices = must(await admin.from("invoices").select("status, collection_stage, failed_payment_at").eq("subscription_id", sub.id)) ?? [];
    if (!guaranteeClaimable(sub, invoices)) throw new Error("This plan doesn't meet the money-back guarantee rules yet. See the checklist on the plan page.");
    const claimed = must(await admin.from("subscriptions").update({ guarantee_status: "claimed", guarantee_claimed_at: new Date().toISOString() }).eq("id", sub.id).eq("guarantee_status", "running").select("id"));
    if (!claimed?.length) throw new Error("This guarantee was already claimed.");
    const t = must(await admin.from("support_tickets").insert({ user_id: sub.user_id, subscription_id: sub.id, subject: `Money-back guarantee refund request, ${sub.plan_name} plan`, category: "billing", department: "billing", priority: "high" }).select("id").single());
    must(await admin.from("ticket_messages").insert({ ticket_id: t.id, user_id: sub.user_id, actor_id: context.userId, actor_label: label(context), internal: false,
      body: `I'm requesting a refund under the 90-day money-back guarantee. My plan has run for 90 days, every invoice was paid on time and I confirm I received no sales.\n\n${data.statement}` }));
    await audit(admin, sub.user_id, "subscriptions", sub.id, "guarantee_claimed", { guarantee: { from: "running", to: "claimed" }, statement: data.statement }, context.userId, label(context));
    return { ticketId: t.id as string };
  });

/** Client approves a deliverable or asks for changes. */
export const reviewDeliverable = createServerFn({ method: "POST" })
  .middleware([limited("review")])
  .inputValidator((d: unknown) => reviewDecision.parse(d))
  .handler(async ({ data, context }) => {
    const { getAdmin, must } = await import("@/lib/billing.server");
    const { audit } = await import("@/lib/stripe.server");
    const admin = await getAdmin();
    const d = must(await admin.from("deliverables").select("id, user_id, status, archived_at").eq("id", data.deliverableId).maybeSingle());
    if (!d || d.user_id !== context.userId || d.status === "draft" || d.archived_at) throw new Error("Deliverable not found.");
    const now = new Date().toISOString();
    const up = must(await admin.from("deliverables").update({ status: data.decision, client_feedback: data.feedback || null, decided_at: now, updated_at: now })
      .eq("id", d.id).eq("status", "in_review").is("archived_at", null).select("id"));
    if (!up?.length) throw new Error("This deliverable isn't waiting for your review.");
    await audit(admin, d.user_id, "deliverables", d.id, data.decision, { status: { from: "in_review", to: data.decision }, feedback: data.feedback ?? null }, context.userId, label(context));
    return { ok: true };
  });

/** Saves the onboarding brief as a draft, or submits it once every required answer is there. */
export const saveOnboardingBrief = createServerFn({ method: "POST" })
  .middleware([limited("brief")])
  .inputValidator((d: unknown) => z.object({ answers: briefSchema, submit: z.boolean() }).parse(d))
  .handler(async ({ data, context }) => {
    const { getAdmin, must } = await import("@/lib/billing.server");
    const admin = await getAdmin();
    const answers = Object.fromEntries(Object.entries(data.answers).filter(([, v]) => typeof v === "string" && v.trim()));
    if (data.submit) {
      const missing = missingAnswers(answers);
      if (missing.length) throw new Error(`Please answer: ${missing.join("; ")}`);
    }
    const cur = must(await admin.from("onboarding_briefs").select("submitted_at").eq("user_id", context.userId).maybeSingle());
    must(await admin.from("onboarding_briefs").upsert({ user_id: context.userId, answers, updated_at: new Date().toISOString(),
      submitted_at: cur?.submitted_at ?? (data.submit ? new Date().toISOString() : null) }, { onConflict: "user_id" }));
    return { ok: true };
  });

/** The client's signed agreements, stored on first request. */
export const myAgreements = createServerFn({ method: "POST" })
  .middleware([limited("agreements")])
  .handler(async ({ context }) => {
    const { getAdmin, must } = await import("@/lib/billing.server");
    const { ensureAgreements } = await import("@/lib/documents.server");
    const admin = await getAdmin();
    const apps = must(await admin.from("applications").select("id").eq("user_id", context.userId).not("signed_at", "is", null)) ?? [];
    const out = [];
    for (const a of apps) out.push(...(await ensureAgreements(admin, a.id)));
    return out as { id: string; application_id: string; title: string; body: string; version: string; sha256: string; signed_at: string }[];
  });

/** Staff (work permission) upload for a client, or a client uploading their own file. Returns a one-time upload URL token. */
export const startFileUpload = createServerFn({ method: "POST" })
  .middleware([limited("upload")])
  .inputValidator((d: unknown) => z.object({
    clientId: uuid.optional(), title: z.string().trim().max(200), file: fileInput,
    relatedTable: z.string().max(40).optional(), relatedId: uuid.optional(), visibleToClient: z.boolean().optional(),
    kind: z.enum(["file", "deliverable", "report"]).optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { getAdmin, must } = await import("@/lib/billing.server");
    const { isStaff, requirePerm } = await import("@/lib/access.server");
    const { clientRelated, startUpload } = await import("@/lib/documents.server");
    const admin = await getAdmin();
    const staff = await isStaff(context);
    if (staff) {
      await requirePerm(context, "work");
      if (!data.clientId) throw new Error("Choose the client.");
      return startUpload(admin, { clientId: data.clientId, uploaderId: context.userId, uploaderLabel: label(context), title: data.title, file: data.file, folder: "shared",
        kind: data.kind ?? "file", relatedTable: data.relatedTable, relatedId: data.relatedId, visibleToClient: data.visibleToClient ?? true });
    }
    if (data.clientId && data.clientId !== context.userId) throw new Error("Forbidden");
    if (data.relatedTable && !(clientRelated as string[]).includes(data.relatedTable)) throw new Error("Files can't be attached there.");
    const prof = must(await admin.from("profiles").select("status").eq("id", context.userId).maybeSingle());
    if (!prof || prof.status === "closed") throw new Error("Your account can't upload files.");
    const { count } = await admin.from("documents").select("id", { count: "exact", head: true }).eq("user_id", context.userId).eq("status", "pending");
    if ((count ?? 0) >= 20) throw new Error("Too many unfinished uploads. Please try again later.");
    const { count: today } = await admin.from("documents").select("id", { count: "exact", head: true }).eq("uploaded_by", context.userId).gte("created_at", new Date(Date.now() - 864e5).toISOString());
    if ((today ?? 0) >= 50) throw new Error("You've reached today's upload limit. Please try again tomorrow or contact support.");
    return startUpload(admin, { clientId: context.userId, uploaderId: context.userId, uploaderLabel: label(context), title: data.title, file: data.file, folder: "uploads",
      kind: "file", relatedTable: data.relatedTable, relatedId: data.relatedId, visibleToClient: true });
  });

export const finishFileUpload = createServerFn({ method: "POST" })
  .middleware([limited("upload")])
  .inputValidator((d: unknown) => z.object({ documentId: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    const { getAdmin, must } = await import("@/lib/billing.server");
    const { isStaff, requirePerm } = await import("@/lib/access.server");
    const { finishUpload } = await import("@/lib/documents.server");
    const admin = await getAdmin();
    const doc = must(await admin.from("documents").select("id, user_id, storage_path, status, uploaded_by").eq("id", data.documentId).maybeSingle());
    if (!doc || doc.uploaded_by !== context.userId) throw new Error("File not found.");
    if (await isStaff(context)) await requirePerm(context, "work");
    else if (doc.user_id !== context.userId) throw new Error("File not found.");
    if (doc.status === "ready") return { ok: true };
    await finishUpload(admin, doc);
    return { ok: true };
  });

/** Short-lived download link: staff for any file, clients for their own shared files. */
export const fileLink = createServerFn({ method: "POST" })
  .middleware([limited("download")])
  .inputValidator((d: unknown) => z.object({ documentId: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    const { getAdmin, must } = await import("@/lib/billing.server");
    const { isStaff } = await import("@/lib/access.server");
    const { signedDownload } = await import("@/lib/documents.server");
    const admin = await getAdmin();
    const doc = must(await admin.from("documents").select("*").eq("id", data.documentId).maybeSingle());
    const allowed = doc && doc.status === "ready" && ((await isStaff(context)) || (doc.user_id === context.userId && doc.visible_to_client && !doc.archived_at));
    if (!allowed) throw new Error("File not found.");
    return { url: await signedDownload(admin, doc) };
  });

const ticketInput = z.object({
  department: z.enum(["account", "billing", "technical", "projects", "marketing", "complaints"]),
  priority: z.enum(["low", "normal", "high", "urgent"]),
  subject: z.string().trim().min(3, "Add a short subject.").max(200),
  message: z.string().trim().min(10, "Tell us a little more so we can help.").max(5000),
  subscriptionId: uuid.optional(), projectId: uuid.optional(),
  contactPreference: z.enum(["dashboard", "email", "phone"]),
  contactPhone: z.string().trim().max(40).optional(),
}).refine((v) => v.contactPreference !== "phone" || (v.contactPhone?.replace(/\D/g, "").length ?? 0) >= 7, { message: "Add a phone number so we can call you.", path: ["contactPhone"] });

/** Client opens a support ticket. Every field is checked here; clients can't write tickets directly. */
export const createSupportTicket = createServerFn({ method: "POST" })
  .middleware([limited("ticket")])
  .inputValidator((d: unknown) => ticketInput.parse(d))
  .handler(async ({ data, context }) => {
    const { getAdmin, must } = await import("@/lib/billing.server");
    const { departments } = await import("@/lib/support");
    const admin = await getAdmin();
    if (data.subscriptionId) { const s = must(await admin.from("subscriptions").select("user_id").eq("id", data.subscriptionId).maybeSingle()); if (s?.user_id !== context.userId) throw new Error("Plan not found."); }
    if (data.projectId) { const p = must(await admin.from("projects").select("user_id").eq("id", data.projectId).maybeSingle()); if (p?.user_id !== context.userId) throw new Error("Project not found."); }
    const { count } = await admin.from("support_tickets").select("id", { count: "exact", head: true }).eq("user_id", context.userId).gte("created_at", new Date(Date.now() - 864e5).toISOString());
    if ((count ?? 0) >= 10) throw new Error("You've opened a lot of requests today. Please reply on an existing ticket or try again tomorrow.");
    const t = must(await admin.from("support_tickets").insert({
      user_id: context.userId, subject: data.subject, department: data.department, category: departments.find((d) => d.id === data.department)!.category,
      priority: data.priority, subscription_id: data.subscriptionId ?? null, project_id: data.projectId ?? null, status: "open",
      contact_preference: data.contactPreference, contact_phone: data.contactPreference === "phone" ? data.contactPhone : null,
    }).select("id").single());
    must(await admin.from("ticket_messages").insert({ ticket_id: t.id, user_id: context.userId, body: data.message, internal: false, actor_id: context.userId, actor_label: label(context) }));
    return { ticketId: t.id as string };
  });

/** Client replies on their own open ticket. */
export const replyToTicket = createServerFn({ method: "POST" })
  .middleware([limited("reply")])
  .inputValidator((d: unknown) => z.object({ ticketId: uuid, body: z.string().trim().min(1).max(5000) }).parse(d))
  .handler(async ({ data, context }) => {
    const { getAdmin, must } = await import("@/lib/billing.server");
    const admin = await getAdmin();
    const t = must(await admin.from("support_tickets").select("user_id, status").eq("id", data.ticketId).maybeSingle());
    if (!t || t.user_id !== context.userId) throw new Error("Ticket not found.");
    if (t.status === "closed") throw new Error("This ticket is closed. Open a new request if you need more help.");
    const { count } = await admin.from("ticket_messages").select("id", { count: "exact", head: true }).eq("user_id", context.userId).eq("actor_id", context.userId).gte("created_at", new Date(Date.now() - 36e5).toISOString());
    if ((count ?? 0) >= 30) throw new Error("Too many messages in the last hour. Please wait a little.");
    must(await admin.from("ticket_messages").insert({ ticket_id: data.ticketId, user_id: context.userId, body: data.body, internal: false, actor_id: context.userId, actor_label: label(context) }));
    return { ok: true };
  });
