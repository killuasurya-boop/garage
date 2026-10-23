import { describe, expect, it } from "vitest";
import { assessClosingReadiness, type ReadinessSnapshot } from "@/lib/wms-replenishment-readiness";

function complete(): ReadinessSnapshot {
  return { outletId: "outlet", configuredSchedule: true,
    locations: ["main", "bar", "dapur", "transit", "damaged"].map(kind => ({ warehouseId: kind, kind, area: "umum", warehouseExists: true })),
    access: [{ userId: "b", warehouseId: "bar", capability: "bar" }, { userId: "k", warehouseId: "dapur", capability: "dapur" }, { userId: "w", warehouseId: "main", capability: "warehouse" }],
    staff: [{ userId: "b", workstation: "bar" }, { userId: "k", workstation: "dapur" }, { userId: "w", workstation: null }].map(row => ({ ...row, outletId: "outlet", role: "Kasir", status: "active" })) };
}
describe("Closing configuration readiness", () => {
  it("accepts explicitly mapped operational locations and eligible assigned staff", () => {
    expect(assessClosingReadiness(complete())).toMatchObject({ ready: true, issues: [], summary: { validAssignments: 3, mappedLocations: 5 } });
  });
  it.each(["bar", "all", "helper_bar", "helper_all"])("accepts the runtime-supported Bar workstation %s", workstation => {
    const snapshot = complete(); snapshot.staff[0].workstation = workstation;
    expect(assessClosingReadiness(snapshot).ready).toBe(true);
  });
  it.each(["dapur", "all", "helper_dapur", "helper_all"])("accepts the runtime-supported Kitchen workstation %s", workstation => {
    const snapshot = complete(); snapshot.staff[1].workstation = workstation;
    expect(assessClosingReadiness(snapshot).ready).toBe(true);
  });
  it("reports missing division, source, transit and damaged mapping instead of inventing defaults", () => {
    const result = assessClosingReadiness({ ...complete(), locations: [], access: [], configuredSchedule: false });
    expect(result.ready).toBe(false);
    expect(result.issues.map(issue => issue.code)).toEqual(expect.arrayContaining(["DIVISION_LOCATION_REQUIRED", "MAIN_LOCATION_REQUIRED", "TRANSIT_LOCATION_REQUIRED", "DAMAGED_LOCATION_REQUIRED", "SCHEDULE_DEFAULTS"]));
  });
  it.each(["wrong-outlet", "suspended", "wrong-workstation", "wrong-role", "unmapped-location"])("rejects unusable %s staff mapping", variant => {
    const snapshot = complete();
    if (variant === "wrong-outlet") snapshot.staff[0].outletId = "other";
    if (variant === "suspended") snapshot.staff[0].status = "suspended";
    if (variant === "wrong-workstation") snapshot.staff[0].workstation = "dapur";
    if (variant === "wrong-role") snapshot.staff[0].role = "Owner";
    if (variant === "unmapped-location") snapshot.access[0].warehouseId = "foreign-location";
    const result = assessClosingReadiness(snapshot);
    expect(result.ready).toBe(false);
    expect(result.summary.validAssignments).toBe(2);
    expect(result.issues.some(issue => issue.code === "DIVISION_STAFF_REQUIRED" && issue.division === "bar")).toBe(true);
  });
  it("does not treat a Dapur-only transit as usable for Bar or mutate the input", () => {
    const snapshot = complete(); snapshot.locations.find(location => location.kind === "transit")!.area = "dapur";
    const before = structuredClone(snapshot);
    expect(assessClosingReadiness(snapshot).issues).toContainEqual(expect.objectContaining({ code: "TRANSIT_LOCATION_REQUIRED", division: "bar" }));
    expect(snapshot).toEqual(before);
  });
});
