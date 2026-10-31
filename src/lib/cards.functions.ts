import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { limited } from "@/lib/session.middleware";

/** Payment cards: clients manage their own; staff with the billing permission manage a client's and charge them.
 * The logic lives in src/lib/cards.server.ts; these only check who is asking. */
const uuid = z.string().uuid();
const pmId = z.string().regex(/^pm_[A-Za-z0-9]+$/);
type Ctx = { supabase: any; userId: string; claims: any };
const label = (c: Ctx, fallback: string) => String(c.claims?.email ?? fallback);
const staffFor = async (ctx: Ctx) => { const { requirePerm } = await import("@/lib/access.server"); await requirePerm(ctx, "billing"); };
const deps = async () => ({ ...(await import("@/lib/cards.server")), admin: await (await import("@/lib/billing.server")).getAdmin() });

// Client: their own cards.
export const myCards = createServerFn({ method: "POST" })
  .middleware([limited("cards")])
  .handler(async ({ context }) => { const { listCards, admin } = await deps(); return listCards(admin, context.userId); });

export const addMyCard = createServerFn({ method: "POST" })
  .middleware([limited("cardChange")])
  .handler(async ({ context }) => { const { startCardSetup, admin } = await deps(); return startCardSetup(admin, context.userId); });

export const setMyDefaultCard = createServerFn({ method: "POST" })
  .middleware([limited("cardChange")])
  .inputValidator((d: unknown) => z.object({ paymentMethodId: pmId }).parse(d))
  .handler(async ({ data, context }) => { const { setDefaultCard, admin } = await deps(); return setDefaultCard(admin, context.userId, data.paymentMethodId, { id: context.userId, label: label(context, "Client") }); });

export const removeMyCard = createServerFn({ method: "POST" })
  .middleware([limited("cardChange")])
  .inputValidator((d: unknown) => z.object({ paymentMethodId: pmId }).parse(d))
  .handler(async ({ data, context }) => { const { removeCard, admin } = await deps(); return removeCard(admin, context.userId, data.paymentMethodId, { id: context.userId, label: label(context, "Client") }); });

// Staff: a client's cards. Staff never enter card numbers; they ask the client to add one (requestClientCard).
export const clientCards = createServerFn({ method: "POST" })
  .middleware([limited("cards")])
  .inputValidator((d: unknown) => z.object({ userId: uuid }).parse(d))
  .handler(async ({ data, context }) => { await staffFor(context); const { listCards, admin } = await deps(); return listCards(admin, data.userId); });

export const setClientDefaultCard = createServerFn({ method: "POST" })
  .middleware([limited("cardChange")])
  .inputValidator((d: unknown) => z.object({ userId: uuid, paymentMethodId: pmId }).parse(d))
  .handler(async ({ data, context }) => { await staffFor(context); const { setDefaultCard, admin } = await deps(); return setDefaultCard(admin, data.userId, data.paymentMethodId, { id: context.userId, label: label(context, "Staff") }); });

export const removeClientCard = createServerFn({ method: "POST" })
  .middleware([limited("cardChange")])
  .inputValidator((d: unknown) => z.object({ userId: uuid, paymentMethodId: pmId }).parse(d))
  .handler(async ({ data, context }) => { await staffFor(context); const { removeCard, admin } = await deps(); return removeCard(admin, data.userId, data.paymentMethodId, { id: context.userId, label: label(context, "Staff") }); });

export const chargeClientCard = createServerFn({ method: "POST" })
  .middleware([limited("cardCharge")])
  .inputValidator((d: unknown) => z.object({ userId: uuid, invoiceId: uuid, paymentMethodId: pmId }).parse(d))
  .handler(async ({ data, context }) => { await staffFor(context); const { chargeInvoice, admin } = await deps(); return chargeInvoice(admin, data.userId, data.invoiceId, data.paymentMethodId, { id: context.userId, label: label(context, "Staff") }); });

export const requestClientCard = createServerFn({ method: "POST" })
  .middleware([limited("cardChange")])
  .inputValidator((d: unknown) => z.object({ userId: uuid, note: z.string().trim().max(500).optional() }).parse(d))
  .handler(async ({ data, context }) => { await staffFor(context); const { requestNewCard, admin } = await deps(); await requestNewCard(admin, data.userId, data.note || null, { id: context.userId, label: label(context, "Staff") }); return { ok: true }; });
