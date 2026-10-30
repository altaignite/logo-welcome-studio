import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSession } from "@/lib/session.middleware";
import { leavesAnOwner, staffLevels } from "@/lib/staff";

const uuid = z.string().uuid();
const label = (c: { claims: any }) => String(c.claims?.email ?? "Staff");

async function staffList(context: any) {
  const { data, error } = await context.supabase.rpc("staff_directory");
  if (error) throw new Error("Couldn't load staff.");
  return (data ?? []) as { user_id: string; email: string; level: string; mfa_enabled: boolean }[];
}

/** Owners set another staff member's level. At least one owner always remains. */
export const setStaffLevel = createServerFn({ method: "POST" })
  .middleware([requireSession])
  .inputValidator((d: unknown) => z.object({ userId: uuid, level: z.enum(staffLevels) }).parse(d))
  .handler(async ({ data, context }) => {
    const { requirePerm } = await import("@/lib/access.server");
    await requirePerm(context, "staff");
    const { getAdmin, must } = await import("@/lib/billing.server");
    const { audit } = await import("@/lib/stripe.server");
    const staff = await staffList(context);
    const target = staff.find((s) => s.user_id === data.userId);
    if (!target) throw new Error("Staff member not found.");
    if (!leavesAnOwner(staff, { userId: data.userId, level: data.level })) throw new Error("Keep at least one owner.");
    const admin = await getAdmin();
    must(await admin.from("staff_members").upsert({ user_id: data.userId, level: data.level, updated_at: new Date().toISOString() }, { onConflict: "user_id" }));
    await audit(admin, data.userId, "staff_members", data.userId, "level_changed", { level: { from: target.level, to: data.level } }, context.userId, label(context));
    return { ok: true };
  });

/** Owners remove someone's staff access. They keep their sign-in but lose the admin. */
export const revokeStaff = createServerFn({ method: "POST" })
  .middleware([requireSession])
  .inputValidator((d: unknown) => z.object({ userId: uuid, reason: z.string().trim().min(3).max(500) }).parse(d))
  .handler(async ({ data, context }) => {
    const { requirePerm } = await import("@/lib/access.server");
    await requirePerm(context, "staff");
    if (data.userId === context.userId) throw new Error("You can't remove your own access.");
    const { getAdmin, must } = await import("@/lib/billing.server");
    const { audit } = await import("@/lib/stripe.server");
    const staff = await staffList(context);
    if (!staff.some((s) => s.user_id === data.userId)) throw new Error("Staff member not found.");
    if (!leavesAnOwner(staff, { userId: data.userId, level: null })) throw new Error("Keep at least one owner.");
    const admin = await getAdmin();
    must(await admin.from("user_roles").delete().eq("user_id", data.userId).eq("role", "admin"));
    must(await admin.from("staff_members").delete().eq("user_id", data.userId));
    await audit(admin, data.userId, "staff_members", data.userId, "access_removed", { reason: data.reason }, context.userId, label(context));
    return { ok: true };
  });

/** Require two-factor sign-in for every staff member. The owner turning it on must already use it, so they aren't locked out. */
export const setStaffMfaRequired = createServerFn({ method: "POST" })
  .middleware([requireSession])
  .inputValidator((d: unknown) => z.object({ required: z.boolean() }).parse(d))
  .handler(async ({ data, context }) => {
    const { requirePerm } = await import("@/lib/access.server");
    await requirePerm(context, "staff");
    if (data.required && context.claims?.aal !== "aal2") throw new Error("Turn on two-factor authentication for your own account and sign in with it first.");
    const { getAdmin, must } = await import("@/lib/billing.server");
    const { audit } = await import("@/lib/stripe.server");
    const admin = await getAdmin();
    must(await admin.from("security_settings").update({ require_staff_mfa: data.required, updated_at: new Date().toISOString() }).eq("id", 1));
    await audit(admin, context.userId, "security_settings", context.userId, "staff_mfa", { require_staff_mfa: data.required }, context.userId, label(context));
    return { ok: true };
  });

/** Email clients from a template or a one-off message. Shows in their inbox, is emailed, and is logged as an activity. */
export const sendClientMessage = createServerFn({ method: "POST" })
  .middleware([requireSession])
  .inputValidator((d: unknown) => z.object({
    userIds: z.array(uuid).min(1).max(200), subject: z.string().trim().min(2).max(200), body: z.string().trim().min(2).max(2000), purpose: z.enum(["service", "marketing"]),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { requirePerm } = await import("@/lib/access.server");
    await requirePerm(context, "work");
    const { getAdmin, must } = await import("@/lib/billing.server");
    const { messageRecipient, renderTemplate, templateVars, unknownPlaceholders } = await import("@/lib/templates");
    const bad = unknownPlaceholders(`${data.subject} ${data.body}`);
    if (bad.length) throw new Error(`Unknown placeholder: ${bad.map((b) => `{{${b}}}`).join(", ")}`);
    const admin = await getAdmin();
    const staffIds = new Set(((must(await admin.from("user_roles").select("user_id").eq("role", "admin").in("user_id", data.userIds)) ?? []) as { user_id: string }[]).map((r) => r.user_id));
    const profiles = must(await admin.from("profiles").select("id, first_name, last_name, company, account_number, status, marketing_opt_in, email").in("id", data.userIds)) ?? [];
    const subs = must(await admin.from("subscriptions").select("user_id, plan_name, status").in("user_id", data.userIds).in("status", ["active", "past_due", "paused", "pending"])) ?? [];
    const me = must(await admin.from("profiles").select("first_name, last_name").eq("id", context.userId).maybeSingle());
    const staffName = `${me?.first_name ?? ""} ${me?.last_name ?? ""}`.trim() || label(context);
    let sent = 0;
    const skipped: string[] = [];
    for (const p of profiles) {
      const why = staffIds.has(p.id) ? "Staff account" : messageRecipient(p, data.purpose);
      if (why) { skipped.push(`${p.company || p.first_name || p.account_number}: ${why}`); continue; }
      const vars = templateVars(p, subs.find((s: { user_id: string }) => s.user_id === p.id)?.plan_name ?? null, staffName);
      const subject = renderTemplate(data.subject, vars), body = renderTemplate(data.body, vars);
      must(await admin.rpc("notify", { _user: p.id, _kind: "message", _title: subject, _body: body, _link: "/dashboard", _email: true, _dedupe: null }));
      must(await admin.from("crm_activities").insert({ user_id: p.id, kind: "email", direction: "outbound", subject, body, outcome: "completed", actor_id: context.userId, actor_label: label(context) }));
      sent++;
    }
    return { sent, skipped };
  });

/** Signed agreements for an application, stored on first view (staff). */
export const applicationAgreements = createServerFn({ method: "POST" })
  .middleware([requireSession])
  .inputValidator((d: unknown) => z.object({ applicationId: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    const { isStaff } = await import("@/lib/access.server");
    if (!(await isStaff(context))) throw new Error("Forbidden");
    const { getAdmin } = await import("@/lib/billing.server");
    const { ensureAgreements } = await import("@/lib/documents.server");
    return (await ensureAgreements(await getAdmin(), data.applicationId)) as { id: string; title: string; body: string; version: string; sha256: string; signed_at: string }[];
  });

/** Fulfils an access request: exports the client's data to a file they can download, then completes the request. */
export const fulfilAccessRequest = createServerFn({ method: "POST" })
  .middleware([requireSession])
  .inputValidator((d: unknown) => z.object({ requestId: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    const { requirePerm } = await import("@/lib/access.server");
    await requirePerm(context, "work");
    const { getAdmin, must } = await import("@/lib/billing.server");
    const { buildExport } = await import("@/lib/documents.server");
    const { FILE_BUCKET, storagePath } = await import("@/lib/files");
    const admin = await getAdmin();
    const req = must(await admin.from("compliance_requests").select("*").eq("id", data.requestId).maybeSingle());
    if (!req || req.kind !== "access" || req.status !== "open") throw new Error("Only open access requests can be fulfilled this way.");
    const json = JSON.stringify(await buildExport(admin, req.user_id), null, 2);
    const id = crypto.randomUUID();
    const path = storagePath(req.user_id, "exports", id, `data-export-${new Date().toISOString().slice(0, 10)}.json`);
    const { ensureBucket } = await import("@/lib/documents.server");
    await ensureBucket(admin);
    const up = await admin.storage.from(FILE_BUCKET).upload(path, new Blob([json], { type: "application/json" }), { contentType: "application/json", upsert: false });
    if (up.error) throw new Error("Couldn't save the export.");
    must(await admin.from("documents").insert({ id, user_id: req.user_id, kind: "export", title: "Your data export", storage_path: path, size_bytes: json.length, mime_type: "application/json",
      status: "ready", related_table: "compliance_requests", related_id: req.id, visible_to_client: true, uploaded_by: context.userId, uploaded_by_label: label(context) }));
    must(await admin.from("compliance_requests").update({ status: "completed", completed_at: new Date().toISOString(), outcome_note: "Your data export is ready to download under Documents." }).eq("id", req.id).eq("status", "open"));
    return { documentId: id };
  });

/** Fulfils a closure request: cancels nothing itself, refuses while money or plans are open, then anonymises and blocks sign-in. */
export const fulfilDeletionRequest = createServerFn({ method: "POST" })
  .middleware([requireSession])
  .inputValidator((d: unknown) => z.object({ requestId: uuid, note: z.string().trim().min(3).max(1000) }).parse(d))
  .handler(async ({ data, context }) => {
    const { requirePerm } = await import("@/lib/access.server");
    await requirePerm(context, "accounts");
    const { getAdmin, must } = await import("@/lib/billing.server");
    const { audit } = await import("@/lib/stripe.server");
    const { anonymisedProfile, deletionBlockers, deletedEmail } = await import("@/lib/privacy");
    const { FILE_BUCKET } = await import("@/lib/files");
    const admin = await getAdmin();
    const req = must(await admin.from("compliance_requests").select("*").eq("id", data.requestId).maybeSingle());
    if (!req || req.kind !== "deletion" || req.status !== "open") throw new Error("Only open closure requests can be fulfilled this way.");
    const uid = req.user_id as string;
    const { data: isStaffTarget } = await context.supabase.rpc("has_role", { _user_id: uid, _role: "admin" });
    if (isStaffTarget) throw new Error("Staff accounts can't be closed this way.");
    const p = must(await admin.from("profiles").select("*").eq("id", uid).maybeSingle());
    if (!p) throw new Error("Client not found.");
    const blockers = deletionBlockers({ legal_hold: p.legal_hold, invoices: must(await admin.from("invoices").select("status").eq("user_id", uid)) ?? [], subs: must(await admin.from("subscriptions").select("status").eq("user_id", uid)) ?? [] });
    if (blockers.length) throw new Error(blockers.join(" "));
    // Sign-in goes first so the client can't act while their details are removed.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const ban = await supabaseAdmin.auth.admin.updateUserById(uid, { ban_duration: "876000h", email: deletedEmail(p.account_number), email_confirm: true, user_metadata: {} });
    if (ban.error) throw new Error("Couldn't block sign-in for this account.");
    const uploads = must(await admin.from("documents").select("id, storage_path").eq("user_id", uid).eq("uploaded_by", uid)) ?? [];
    if (uploads.length) await admin.storage.from(FILE_BUCKET).remove(uploads.map((d: { storage_path: string }) => d.storage_path));
    if (uploads.length) must(await admin.from("documents").update({ title: "Removed at the client's request", archived_at: new Date().toISOString(), visible_to_client: false }).in("id", uploads.map((d: { id: string }) => d.id)));
    must(await admin.from("profiles").update(anonymisedProfile(p.account_number)).eq("id", uid));
    for (const t of ["contacts", "crm_activities", "notifications", "onboarding_briefs"]) must(await admin.from(t).delete().eq("user_id", uid));
    must(await admin.from("compliance_requests").update({ status: "completed", completed_at: new Date().toISOString(), outcome_note: data.note, details: null }).eq("id", req.id));
    await audit(admin, uid, "profiles", uid, "anonymised", { reason: data.note }, context.userId, label(context));
    return { ok: true };
  });
