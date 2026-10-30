/** Reasons and wording for plan changes, cancellations and account closures, shared by the client flows, the server and the admin. */
export const changeReasons = {
  upgrade: ["Need more hours", "Business is growing", "New project or campaign", "Want faster delivery", "Other"],
  downgrade: ["Need fewer hours", "Budget", "Project finished", "Seasonal slowdown", "Other"],
  cancel: ["Budget", "Not seeing the results I expected", "Project finished", "Switching to another provider", "Bringing the work in-house", "Service or communication issues", "Business closing or paused", "Other"],
  close_account: ["No longer need the services", "Budget", "Not happy with the service", "Business closing", "Privacy reasons", "Other"],
} as const;
export type ChangeKind = keyof typeof changeReasons;
export const changeKindLabel: Record<ChangeKind, string> = { upgrade: "Upgrade", downgrade: "Downgrade", cancel: "Cancellation", close_account: "Account closure" };

/** Optional feedback questions asked before a cancellation or closure. */
export const exitQuestions = [
  { id: "improve", label: "What could we have done better?" },
  { id: "return", label: "Is there anything that would make you stay or come back?" },
] as const;

export const isReason = (kind: ChangeKind, r: string) => (changeReasons[kind] as readonly string[]).includes(r);
