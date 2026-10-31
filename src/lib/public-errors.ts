/** What an error may say to the person who hit it. Messages written for people (our own "Choose a plan.", Stripe's card messages,
 * validation messages) pass through; anything that could reveal how the system works inside (database tables, constraints and
 * SQL, Stripe or internal ids, URLs, stack traces, code errors) is replaced by a generic message with a short reference, and the
 * full error is logged on the server under that reference. Used by every server function (session middleware) and by
 * friendlyError in the browser, so internal details never reach the screen. */
const INTERNAL = [
  /violates|constraint|relation "|column "|syntax error|duplicate key|foreign key|null value in|invalid input syntax|does not exist/i,
  /\bPGRST\d+|\bpostgres|supabase|row-level security|permission denied for|\bSQLSTATE\b|\bpg_/i,
  /\b(?:cus|sub|in|ii|pi|pm|price|prod|seti|si|we|evt|ch|re|txn|bpc|acct)_[A-Za-z0-9]{8,}/,
  /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i,
  /https?:\/\/|\b(?:localhost|127\.0\.0\.1)\b/i,
  /\b(?:TypeError|ReferenceError|SyntaxError|RangeError)\b|cannot read propert|is not a function|is not defined|undefined is not|unexpected token/i,
  /\n\s+at\s|\bat\s+\S+\s\(|\.(?:ts|tsx|js|mjs):\d+/,
  /\bECONN\w+|ETIMEDOUT|ENOTFOUND|fetch failed|socket hang up/i,
  /api[_ -]?key|secret|bearer\s|service[_ ]role|whsec_|sk_(?:live|test)_|rk_(?:live|test)_/i,
];
const STRIPE_PREFIX = /^Stripe couldn't complete this:\s*/;
const CARD_MESSAGE = /card|declined|insufficient funds|expired|incorrect|cvc|security code|zip|postal|authenticat|limit|processing error/i;

export const GENERIC_ERROR = "Something went wrong on our side. Please try again, or contact support";

export function isInternalMessage(message: string): boolean {
  return message.length > 300 || INTERNAL.some((r) => r.test(message));
}

/** The message to show, or null when it must be replaced (the caller adds a reference). */
export function publicMessage(raw: string): string | null {
  const m = raw.trim();
  if (!m) return null;
  if (STRIPE_PREFIX.test(m)) {
    // Stripe's reason is shown only when it's about the card; account, setup and id details stay internal.
    const reason = m.replace(STRIPE_PREFIX, "");
    return CARD_MESSAGE.test(reason) && !isInternalMessage(reason) ? reason : null;
  }
  return isInternalMessage(m) ? null : m;
}
