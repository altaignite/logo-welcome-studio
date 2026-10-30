/** Message template placeholders. Rendering is plain text; emails escape it when building HTML. */
export const placeholders = ["first_name", "last_name", "company", "account_number", "plan", "staff_name"] as const;
export type Placeholder = (typeof placeholders)[number];
export type TemplateVars = Partial<Record<Placeholder, string | null>>;

/** Replaces {{placeholder}} with the client's value. Unknown placeholders are left as typed so mistakes are visible in the preview. */
export function renderTemplate(text: string, vars: TemplateVars) {
  return text.replace(/\{\{\s*([a-z_]+)\s*\}\}/g, (m, key: string) =>
    (placeholders as readonly string[]).includes(key) ? (vars[key as Placeholder] ?? "").trim() : m);
}
export const unknownPlaceholders = (text: string) =>
  [...new Set([...text.matchAll(/\{\{\s*([a-z_]+)\s*\}\}/g)].map((m) => m[1]!).filter((k) => !(placeholders as readonly string[]).includes(k)))];

export function templateVars(p: { first_name: string | null; last_name: string | null; company: string | null; account_number: string }, plan: string | null, staffName: string | null): TemplateVars {
  return { first_name: p.first_name, last_name: p.last_name, company: p.company ?? `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim(), account_number: p.account_number, plan, staff_name: staffName };
}

/** Marketing emails only go to clients who opted in; service emails go to every open account. */
export function messageRecipient(p: { status: string; marketing_opt_in: boolean; email: string | null }, purpose: "service" | "marketing") {
  if (!p.email) return "No email address";
  if (p.status === "closed") return "Account closed";
  if (purpose === "marketing" && !p.marketing_opt_in) return "Not opted in to marketing";
  return null;
}
