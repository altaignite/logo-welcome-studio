/** Server-side rate limits, counted per user (or per staff member) in the database, so they hold across every server
 * instance and can't be bypassed from the browser. windowSec is a fixed window. */
export const rateLimits = {
  request: { max: 300, windowSec: 60, message: "You're going a little fast. Please wait a moment and try again." },
  profile: { max: 30, windowSec: 3600, message: "Too many profile changes. Please try again later." },
  order: { max: 5, windowSec: 3600, message: "You've placed several orders recently. Please wait before ordering again." },
  planChange: { max: 10, windowSec: 3600, message: "Too many plan changes. Please try again later." },
  subscriptionAction: { max: 20, windowSec: 3600, message: "Too many plan changes. Please try again later." },
  privacy: { max: 3, windowSec: 86400, message: "You've sent several privacy requests today. We'll be in touch about them." },
  guarantee: { max: 3, windowSec: 86400, message: "Please wait for our reply to your refund request." },
  infoReply: { max: 10, windowSec: 3600, message: "Too many replies. Please try again later." },
  review: { max: 30, windowSec: 3600, message: "Too many reviews in a short time. Please try again later." },
  brief: { max: 60, windowSec: 3600, message: "Too many saves. Please try again in a few minutes." },
  ticket: { max: 10, windowSec: 86400, message: "You've opened a lot of requests today. Please reply on an existing ticket." },
  reply: { max: 30, windowSec: 3600, message: "Too many messages in the last hour. Please wait a little." },
  upload: { max: 60, windowSec: 86400, message: "You've reached today's upload limit." },
  download: { max: 300, windowSec: 3600, message: "Too many downloads. Please try again later." },
  billingPortal: { max: 20, windowSec: 3600, message: "Please try again in a few minutes." },
  overageApproval: { max: 30, windowSec: 3600, message: "Too many approvals. Please try again later." },
  agreements: { max: 60, windowSec: 3600, message: "Please try again in a few minutes." },
  // Staff
  invite: { max: 30, windowSec: 3600, message: "Too many invitations in an hour." },
  clientEmail: { max: 20, windowSec: 3600, message: "Too many email sends in an hour (each can reach up to 200 clients)." },
  accountStatus: { max: 60, windowSec: 3600, message: "Too many status changes in an hour." },
  sessionAdmin: { max: 60, windowSec: 3600, message: "Too many security changes in an hour." },
  passwordReset: { max: 10, windowSec: 3600, message: "Too many reset emails in an hour." },
  invoice: { max: 60, windowSec: 3600, message: "Too many invoices in an hour." },
  refund: { max: 10, windowSec: 3600, message: "Too many refunds in an hour." },
  collections: { max: 120, windowSec: 3600, message: "Too many collections actions in an hour." },
  stripeImport: { max: 600, windowSec: 3600, message: "The import is running too often. Try again in an hour." },
  stripeSync: { max: 6, windowSec: 3600, message: "Stripe was synced several times this hour. The daily sync also runs on its own." },
  stripeSetup: { max: 5, windowSec: 3600, message: "The webhook was set up several times this hour. Try again later." },
  staffAdmin: { max: 30, windowSec: 3600, message: "Too many staff changes in an hour." },
  privacyFulfil: { max: 20, windowSec: 3600, message: "Too many privacy actions in an hour." },
  lookup: { max: 600, windowSec: 3600, message: "Too many requests. Please try again later." },
} as const satisfies Record<string, { max: number; windowSec: number; message: string }>;
export type LimitName = keyof typeof rateLimits;

/** Start of the fixed window a moment falls in, matching hit_rate_limit in the database. */
export const windowStart = (now: Date, windowSec: number) => new Date(Math.floor(now.getTime() / 1000 / windowSec) * windowSec * 1000);
