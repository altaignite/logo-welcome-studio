import { describe, expect, it } from "vitest";
import { canTransition, workflowActions } from "@/lib/admin";

describe("Application workflow", () => {
  it("must be reviewed before approval", () => expect(canTransition("submitted", "approved")).toBe(false));
  it("allows approve, reject, escalate and info request from review", () => {
    expect(workflowActions.in_review.map((a) => a.to).sort()).toEqual(["approved", "escalated", "info_requested", "rejected"]);
  });
  it("requires a note for rejection and escalation", () => {
    expect(workflowActions.in_review.filter((a) => a.needsNote).map((a) => a.to).sort()).toEqual(["escalated", "info_requested", "rejected"]);
  });
  it("treats approval and rejection as final", () => {
    expect(workflowActions.approved).toHaveLength(0);
    expect(workflowActions.rejected).toHaveLength(0);
  });
});

import { auditSummary } from "@/lib/admin";
describe("audit summary", () => {
  it("shows from → to for updates", () => {
    expect(auditSummary("update", { status: { from: "active", to: "suspended" } })).toBe("status: active → suspended");
  });
});
