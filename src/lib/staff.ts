/** Staff permission levels. The database enforces the same rules in public.level_grants (migration 0011). */
export const staffLevels = ["owner", "manager", "support", "billing", "viewer"] as const;
export type StaffLevel = (typeof staffLevels)[number];

/** accounts: client profiles, account status and application decisions. billing: invoices, payments, plans, refunds and billing rules.
 * work: projects, tasks, time, deliverables, reports, documents, support, activities and privacy requests. staff: manage staff and security. */
export const staffPerms = ["accounts", "billing", "work", "staff"] as const;
export type StaffPerm = (typeof staffPerms)[number];

export const staffLevelGrants: Record<StaffLevel, readonly StaffPerm[]> = {
  owner: ["accounts", "billing", "work", "staff"],
  manager: ["accounts", "billing", "work"],
  support: ["work"],
  billing: ["billing"],
  viewer: [],
};

export const levelLabel: Record<StaffLevel, string> = { owner: "Owner", manager: "Manager", support: "Support", billing: "Billing", viewer: "Viewer" };
export const levelDescription: Record<StaffLevel, string> = {
  owner: "Everything, including staff access and security settings.",
  manager: "Accounts, billing and client work. Can't manage staff.",
  support: "Client work: projects, tasks, deliverables, reports, files, support and privacy requests.",
  billing: "Invoices, payments, plans, refunds, collections and billing rules.",
  viewer: "Can see everything but change nothing.",
};

export const isStaffLevel = (v: string): v is StaffLevel => (staffLevels as readonly string[]).includes(v);
export const levelGrants = (level: string | null | undefined, perm: StaffPerm) => !!level && isStaffLevel(level) && staffLevelGrants[level].includes(perm);

/** At least one owner must remain so staff access can always be managed. */
export function leavesAnOwner(staff: { user_id: string; level: string }[], change: { userId: string; level: StaffLevel | null }) {
  return staff.some((s) => (s.user_id === change.userId ? change.level : s.level) === "owner");
}
