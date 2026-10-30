/** Minimal Stripe REST client (fetch-based, Worker compatible). Server only. */

/** The Stripe secret key, under Lovable's standard name or the older restricted-key name. */
export const stripeKey = () => process.env["STRIPE_SECRET_KEY"] ?? process.env["STRIPE_RESTRICTED_API_KEY"] ?? process.env["STRIPE_API_KEY"] ?? null;
type Params = Record<string, string | number | boolean | undefined | null>;

export async function stripe<T = any>(method: "GET" | "POST" | "DELETE", path: string, params: Params = {}, idempotencyKey?: string): Promise<T> {
  const key = stripeKey();
  if (!key) throw new Error("Stripe isn't connected. Add your Stripe secret key as STRIPE_SECRET_KEY in Lovable's secrets.");
  const body = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null) body.append(k, String(v));
  const url = `https://api.stripe.com/v1/${path}${method === "GET" && body.size ? `?${body}` : ""}`;
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/x-www-form-urlencoded",
      ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
    },
    ...(method === "GET" ? {} : { body }),
  });
  const json = (await res.json()) as any;
  if (!res.ok) {
    console.error("Stripe error", path, json?.error?.message);
    // Stripe's own reason (never contains the key), so staff can fix the setup or the data.
    throw new Error(`Stripe couldn't complete this: ${String(json?.error?.message ?? res.statusText).slice(0, 240)}`);
  }
  return json as T;
}

const cents = (n: number) => Math.round(n * 100);
export { cents };

/** Returns the Stripe customer for a client, creating and saving it on first use. */
export async function ensureCustomer(admin: any, userId: string): Promise<string> {
  const { data: p } = await admin.from("profiles").select("id, stripe_customer_id, email, first_name, last_name, company, account_number").eq("id", userId).single();
  if (!p) throw new Error("Client not found.");
  if (p.stripe_customer_id) return p.stripe_customer_id;
  const c = await stripe("POST", "customers", {
    email: p.email, name: p.company || `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim(),
    "metadata[user_id]": userId, "metadata[account_number]": p.account_number,
  }, `cust-${userId}`);
  await admin.from("profiles").update({ stripe_customer_id: c.id }).eq("id", userId);
  return c.id;
}

/** Monthly recurring price for a plan, found by lookup key or created once. */
export async function planPrice(plan: string, monthlyFee: number): Promise<string> {
  const lookup = `fp_${plan.toLowerCase()}_${cents(monthlyFee)}_monthly`;
  const found = await stripe("GET", "prices", { "lookup_keys[]": lookup, limit: 1 });
  if (found.data?.[0]) return found.data[0].id;
  const product = await stripe("POST", "products", { name: `${plan} plan`, "metadata[plan]": plan }, `prod-${lookup}`);
  const price = await stripe("POST", "prices", {
    product: product.id, currency: "usd", unit_amount: cents(monthlyFee), "recurring[interval]": "month", lookup_key: lookup,
  }, `price-${lookup}`);
  return price.id;
}

/** Verifies a Stripe-Signature header with Web Crypto (HMAC SHA-256, 5 minute tolerance). */
export async function verifyStripeSignature(payload: string, header: string | null, secret: string) {
  if (!header) return false;
  const parts = Object.fromEntries(header.split(",").map((p) => p.split("=") as [string, string]));
  const t = parts["t"]; const sigs = header.split(",").filter((p) => p.startsWith("v1=")).map((p) => p.slice(3));
  if (!t || !sigs.length || Math.abs(Date.now() / 1000 - Number(t)) > 300) return false;
  const k = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(`${t}.${payload}`)));
  const hex = [...mac].map((b) => b.toString(16).padStart(2, "0")).join("");
  return sigs.some((s) => s.length === hex.length && [...s].reduce((acc, ch, i) => acc | (ch.charCodeAt(0) ^ hex.charCodeAt(i)), 0) === 0);
}

/** Writes an audit entry from server code (service role has no auth.uid, so record the actor explicitly). */
export async function audit(admin: any, accountId: string, table: string, recordId: string, action: string, changes: Record<string, unknown>, actorId: string | null, actorLabel: string) {
  const { error } = await admin.from("audit_log").insert({ account_id: accountId, table_name: table, record_id: recordId, action, changes, actor_id: actorId, actor_label: actorLabel });
  if (error) console.error("Audit log write failed", table, recordId, action, error.message);
}
