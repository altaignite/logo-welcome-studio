/** Card expiry, shared by the server card list and its tests. Cards are valid through the last day of their expiry month;
 * "expires soon" means this month or next, so clients see the warning before a renewal fails. */
export function cardExpiry(expMonth: number, expYear: number, now = new Date()): { expired: boolean; expiresSoon: boolean } {
  const end = new Date(expYear, expMonth, 0, 23, 59, 59);
  const soon = new Date(now.getFullYear(), now.getMonth() + 2, 0, 23, 59, 59);
  return { expired: end < now, expiresSoon: end >= now && end <= soon };
}
