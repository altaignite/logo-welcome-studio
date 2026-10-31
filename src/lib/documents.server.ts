/** Server-only document, agreement and privacy export workflows (service role). */
import { allowedMimeTypes, FILE_BUCKET, MAX_FILE_BYTES, storagePath, uploadIssue } from "@/lib/files";
import { plans } from "@/lib/signup";
import { defaultRules, type BillingRules } from "@/lib/billing";
import { agreementDocuments, AGREEMENT_VERSION, signedAgreementText } from "@/lib/agreements";
import { exportTables, omit, profileExportOmit } from "@/lib/privacy";
import { must } from "@/lib/billing.server";

type Admin = any;
const RELATED = ["applications", "projects", "tasks", "support_tickets", "deliverables", "client_reports", "compliance_requests"] as const;
export type RelatedTable = (typeof RELATED)[number];
/** Records a client may attach their own files to. Staff may attach to any of RELATED. */
export const clientRelated: RelatedTable[] = ["applications", "support_tickets", "deliverables"];
export const isRelated = (t: string): t is RelatedTable => (RELATED as readonly string[]).includes(t);

const sha256 = async (s: string) => [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)))].map((b) => b.toString(16).padStart(2, "0")).join("");

/** Stores the signed copy of a signup application's agreements once, rendered from the plan the client signed. */
export async function ensureAgreements(admin: Admin, applicationId: string) {
  const app = must(await admin.from("applications").select("id, user_id, plan_id, plan_name, signed_at, account_number").eq("id", applicationId).maybeSingle());
  if (!app?.signed_at) return [];
  const existing = must(await admin.from("signed_agreements").select("*").eq("application_id", app.id).order("title")) ?? [];
  if (existing.length) return existing;
  // The plan signed at signup is recorded on the signup event; staff may have changed the plan before approval.
  const ev = must(await admin.from("application_events").select("note").eq("application_id", app.id).eq("to_status", "submitted").order("created_at").limit(1).maybeSingle());
  const signedName = /^Plan: (.+)$/.exec(ev?.note ?? "")?.[1];
  const plan = plans.find((p) => p.name === signedName) ?? plans.find((p) => p.id === app.plan_id);
  if (!plan) return [];
  const prof = must(await admin.from("profiles").select("first_name, last_name, company, email, phone, country, address_line, city, state, postal_code").eq("id", app.user_id).maybeSingle());
  const signer = { name: `${prof?.first_name ?? ""} ${prof?.last_name ?? ""}`.trim() || "Client", accountNumber: app.account_number, signedAt: app.signed_at };
  const address = [prof?.address_line, [prof?.city, prof?.state, prof?.postal_code].filter(Boolean).join(" ")].filter(Boolean).join(", ") || null;
  const client = { name: signer.name, company: prof?.company, email: prof?.email, phone: prof?.phone, country: prof?.country, address, accountNumber: app.account_number };
  // Signed copies state the rates in effect when they were signed.
  const settings = (await admin.from("billing_settings").select("*").eq("id", 1).maybeSingle()).data;
  const rules = settings ? { ...defaultRules, ...Object.fromEntries(Object.entries(settings).filter(([k, v]) => k in defaultRules && v != null)) } as BillingRules : defaultRules;
  const rows = await Promise.all(agreementDocuments(plan, client, app.signed_at, rules).map(async (d) => {
    const body = signedAgreementText(d, signer);
    return { user_id: app.user_id, application_id: app.id, title: d.title, body, version: AGREEMENT_VERSION, sha256: await sha256(body), signed_at: app.signed_at };
  }));
  must(await admin.from("signed_agreements").upsert(rows, { onConflict: "application_id,title", ignoreDuplicates: true }));
  return must(await admin.from("signed_agreements").select("*").eq("application_id", app.id).order("title")) ?? [];
}

/** Checks the related record belongs to the client before a file is attached to it. */
export async function assertRelated(admin: Admin, clientId: string, table: string | undefined, id: string | undefined) {
  if (!table && !id) return;
  if (!table || !id || !isRelated(table)) throw new Error("Unknown record.");
  const row = must(await admin.from(table).select("id, user_id").eq("id", id).maybeSingle());
  if (!row || row.user_id !== clientId) throw new Error("Record not found.");
}

let bucketReady = false;
/** Creates the private client-files bucket if it doesn't exist yet (migrations can't create storage buckets on Lovable Cloud). */
export async function ensureBucket(admin: Admin) {
  if (bucketReady) return;
  const found = await admin.storage.getBucket(FILE_BUCKET);
  if (found.error) {
    const made = await admin.storage.createBucket(FILE_BUCKET, { public: false, fileSizeLimit: MAX_FILE_BYTES, allowedMimeTypes: [...allowedMimeTypes] });
    if (made.error && !/exists/i.test(made.error.message)) throw new Error("File storage isn't available right now.");
  } else if (found.data?.public || Number(found.data?.file_size_limit) !== MAX_FILE_BYTES || (found.data?.allowed_mime_types ?? []).length !== allowedMimeTypes.length) {
    // Never serve client files publicly, and keep the size and type limits on the bucket itself (it refuses anything else).
    await admin.storage.updateBucket(FILE_BUCKET, { public: false, fileSizeLimit: MAX_FILE_BYTES, allowedMimeTypes: [...allowedMimeTypes] });
  }
  bucketReady = true;
}

/** Creates a pending document row and a one-time signed upload URL under the client's folder. */
export async function startUpload(admin: Admin, o: {
  clientId: string; uploaderId: string; uploaderLabel: string; title: string; file: { name: string; size: number; type: string };
  folder: "uploads" | "shared"; kind: "file" | "deliverable" | "report"; relatedTable?: string | undefined; relatedId?: string | undefined; visibleToClient: boolean;
}) {
  const issue = uploadIssue(o.file);
  if (issue) throw new Error(issue);
  await assertRelated(admin, o.clientId, o.relatedTable, o.relatedId);
  await ensureBucket(admin);
  const id = crypto.randomUUID();
  const path = storagePath(o.clientId, o.folder, id, o.file.name);
  must(await admin.from("documents").insert({
    id, user_id: o.clientId, kind: o.kind, title: o.title.trim().slice(0, 200) || o.file.name.slice(0, 200), storage_path: path, size_bytes: o.file.size, mime_type: o.file.type,
    related_table: o.relatedTable ?? null, related_id: o.relatedId ?? null, visible_to_client: o.visibleToClient, uploaded_by: o.uploaderId, uploaded_by_label: o.uploaderLabel,
  }));
  const { data, error } = await admin.storage.from(FILE_BUCKET).createSignedUploadUrl(path);
  if (error || !data) throw new Error("Couldn't prepare the upload.");
  return { documentId: id, path, token: data.token as string };
}

/** Marks an upload ready once the object exists, using the size and type storage recorded. */
export async function finishUpload(admin: Admin, doc: { id: string; storage_path: string }) {
  const slash = doc.storage_path.lastIndexOf("/");
  const { data, error } = await admin.storage.from(FILE_BUCKET).list(doc.storage_path.slice(0, slash), { search: doc.storage_path.slice(slash + 1), limit: 1 });
  const obj = data?.find((o: { name: string }) => o.name === doc.storage_path.slice(slash + 1));
  if (error || !obj) throw new Error("The upload didn't finish. Please try again.");
  const size = Number(obj.metadata?.size ?? 0), type = String(obj.metadata?.mimetype ?? "");
  const issue = uploadIssue({ name: doc.storage_path, size, type });
  if (issue) {
    await admin.storage.from(FILE_BUCKET).remove([doc.storage_path]);
    throw new Error(issue);
  }
  must(await admin.from("documents").update({ status: "ready", size_bytes: size, mime_type: type }).eq("id", doc.id).eq("status", "pending"));
}

export async function signedDownload(admin: Admin, doc: { storage_path: string; title: string }) {
  const ext = /\.[a-z0-9]{1,5}$/i.exec(doc.storage_path)?.[0] ?? "";
  const name = doc.title.toLowerCase().endsWith(ext.toLowerCase()) ? doc.title : `${doc.title}${ext}`;
  const { data, error } = await admin.storage.from(FILE_BUCKET).createSignedUrl(doc.storage_path, 60, { download: name });
  if (error || !data) throw new Error("Couldn't open the file.");
  return data.signedUrl as string;
}

/** Everything held about a client, without staff-only fields, as JSON. */
export async function buildExport(admin: Admin, userId: string) {
  const profile = must(await admin.from("profiles").select("*").eq("id", userId).maybeSingle());
  const out: Record<string, unknown> = { exported_at: new Date().toISOString(), profile: profile ? omit(profile, profileExportOmit) : null };
  for (const t of exportTables) {
    let q = admin.from(t.table).select("*").eq("user_id", userId);
    for (const [k, v] of Object.entries(t.filter ?? {})) q = q.eq(k, v);
    out[t.table] = (must(await q) ?? []).map((r: Record<string, unknown>) => omit(r, t.omit));
  }
  const apps = (out["applications"] as { id: string }[]).map((a) => a.id);
  out["application_events"] = apps.length ? (must(await admin.from("application_events").select("*").in("application_id", apps).eq("visible_to_client", true)) ?? []) : [];
  out["onboarding_brief"] = must(await admin.from("onboarding_briefs").select("answers, submitted_at").eq("user_id", userId).maybeSingle());
  return out;
}
