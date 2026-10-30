import { describe, expect, it } from "vitest";
import { countryName, placeLabel } from "@/lib/security";
import { auditRows } from "@/lib/admin";

describe("country names", () => {
  it("shows full names for codes and leaves other values alone", () => {
    expect(countryName("NL")).toBe("Netherlands");
    expect(countryName("gb")).toBe("United Kingdom");
    expect(countryName("Netherlands")).toBe("Netherlands");
    expect(countryName("XX")).toBe("XX");
    expect(countryName(null)).toBe("");
    expect(placeLabel({ city: "Amsterdam", region: "North Holland", country: "NL" })).toBe("Amsterdam, North Holland, Netherlands");
  });
});

describe("audit rows", () => {
  it("turns changes into readable before and after rows", () => {
    expect(auditRows("status_changed", { status: { from: "suspended", to: "active" }, reason: "Restored", sessions_ended: false })).toEqual([
      { field: "Status", from: "suspended", to: "active" },
      { field: "Reason", from: null, to: "Restored" },
      { field: "Sessions ended", from: null, to: "No" },
    ]);
    expect(auditRows("update", { status_reason: { from: "Test", to: null } })).toEqual([{ field: "Status reason", from: "Test", to: "—" }]);
    expect(auditRows("update", { country: { from: "NL", to: "GB" } })[0]).toEqual({ field: "Country", from: "Netherlands", to: "United Kingdom" });
    expect(auditRows("insert", { number: "INV-1", status: "open", other: 1 })).toEqual([{ field: "Number", from: null, to: "INV-1" }, { field: "Status", from: null, to: "open" }]);
  });
});
