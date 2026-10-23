import { eq, inArray, or } from "drizzle-orm";
import { getDatabaseDriver, getDb } from "@/db";
import { staffProfiles, wmsClosingAccess, wmsClosingLocation, wmsClosingSettings, wmsWarehouse } from "@/db/schema";
import type { ClosingActor } from "@/lib/wms-replenishment-types";

export type ReadinessSnapshot = {
  outletId: string;
  configuredSchedule: boolean;
  locations: Array<{ warehouseId: string; kind: string; area: string; warehouseExists: boolean }>;
  access: Array<{ userId: string; warehouseId: string; capability: string }>;
  staff: Array<{ userId: string; outletId: string; role: string; workstation: string | null; status: string }>;
};
export type ReadinessIssue = { code: string; severity: "blocking" | "warning"; message: string; division?: string; warehouseId?: string; userId?: string };

/** Evaluates actual mappings only. No setup defaults, inventory writes or guessed staff assignments. */
export function assessClosingReadiness(snapshot: ReadinessSnapshot) {
  const issues: ReadinessIssue[] = [];
  const add = (code: string, message: string, scope: Partial<ReadinessIssue> = {}) => issues.push({ code, severity: "blocking", message, ...scope });
  const locations = snapshot.locations.filter(location => location.warehouseExists);
  if (!snapshot.configuredSchedule) add("SCHEDULE_DEFAULTS", "Jadwal closing memakai nilai bawaan; verifikasi jam operasional dan batas permintaan.", { severity: "warning" });
  for (const location of snapshot.locations) {
    if (!location.warehouseExists) add("LOCATION_MISSING", "Pemetaan menunjuk gudang yang tidak tersedia.", { warehouseId: location.warehouseId });
    if (!["main", "bar", "dapur", "transit", "damaged"].includes(location.kind) || !["bar", "dapur", "umum"].includes(location.area)) add("LOCATION_INVALID", "Jenis atau area lokasi belum valid.", { warehouseId: location.warehouseId });
    if (["bar", "dapur"].includes(location.kind) && ![location.kind, "umum"].includes(location.area)) add("DIVISION_AREA_MISMATCH", "Area lokasi tidak cocok dengan divisi.", { warehouseId: location.warehouseId });
  }
  const validAccess = snapshot.access.filter(assignment => {
    const location = locations.find(row => row.warehouseId === assignment.warehouseId);
    const staff = snapshot.staff.find(row => row.userId === assignment.userId);
    const scope = { userId: assignment.userId, warehouseId: assignment.warehouseId };
    if (!location) { add("ACCESS_LOCATION_UNMAPPED", "Penugasan staf menunjuk lokasi yang belum dipetakan ke outlet ini.", scope); return false; }
    if (!staff || staff.outletId !== snapshot.outletId || staff.status !== "active") { add("ACCESS_STAFF_UNAVAILABLE", "Penugasan memerlukan staf aktif pada outlet yang sama.", scope); return false; }
    if (staff.role !== "Kasir") { add("ACCESS_ROLE_INCOMPATIBLE", "Penugasan operasional memerlukan peran Kasir; Owner/Manajer memakai akses manajemen.", scope); return false; }
    const compatible = assignment.capability === "warehouse" ? location.kind === "main" : ["bar", "dapur"].includes(assignment.capability) && location.kind === assignment.capability && [assignment.capability, "all", `helper_${assignment.capability}`, "helper_all"].includes(staff.workstation ?? "");
    if (!compatible) { add("ACCESS_CAPABILITY_MISMATCH", "Kapabilitas, workstation, dan jenis lokasi penugasan tidak sesuai.", scope); return false; }
    return true;
  });
  for (const division of ["bar", "dapur"]) {
    const compatible = (kind: string) => locations.filter(row => row.kind === kind && [division, "umum"].includes(row.area));
    const destinations = locations.filter(row => row.kind === division && [division, "umum"].includes(row.area));
    if (!destinations.length) add("DIVISION_LOCATION_REQUIRED", "Lokasi stok divisi belum dipetakan.", { division });
    for (const destination of destinations) if (!validAccess.some(access => access.warehouseId === destination.warehouseId && access.capability === division)) add("DIVISION_STAFF_REQUIRED", "Lokasi divisi belum memiliki staf aktif dengan workstation dan penugasan yang sesuai.", { division, warehouseId: destination.warehouseId });
    for (const kind of ["main", "transit", "damaged"]) {
      const matches = compatible(kind);
      if (!matches.length) add(`${kind.toUpperCase()}_LOCATION_REQUIRED`, `Lokasi ${kind === "main" ? "gudang sumber" : kind === "transit" ? "barang dalam perjalanan" : "barang rusak"} untuk divisi belum dipetakan.`, { division });
      if (kind === "main") for (const source of matches) if (!validAccess.some(access => access.warehouseId === source.warehouseId && access.capability === "warehouse")) add("WAREHOUSE_STAFF_REQUIRED", "Gudang sumber belum memiliki petugas aktif yang ditugaskan.", { division, warehouseId: source.warehouseId });
    }
  }
  return { ready: !issues.some(issue => issue.severity === "blocking"), issues, summary: { mappedLocations: locations.length, validAssignments: validAccess.length, blockers: issues.filter(issue => issue.severity === "blocking").length, warnings: issues.filter(issue => issue.severity === "warning").length } };
}

export async function getClosingReadiness(actor: ClosingActor) {
  if (!["Owner", "Manajer"].includes(actor.role)) throw Object.assign(new Error("Diagnostik konfigurasi hanya untuk Owner/Manajer."), { status: 403, code: "FORBIDDEN" });
  const db = getDb();
  // A consistent read-only snapshot: diagnostics cannot create locations, assignments or stock rows.
  return db.transaction(async tx => {
    await tx.execute("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY");
    const locations = await tx.select({ warehouseId: wmsClosingLocation.warehouseId, kind: wmsClosingLocation.kind, area: wmsClosingLocation.area, existingId: wmsWarehouse.id }).from(wmsClosingLocation).leftJoin(wmsWarehouse, eq(wmsWarehouse.id, wmsClosingLocation.warehouseId)).where(eq(wmsClosingLocation.outletId, actor.outletId));
    const access = await tx.select({ userId: wmsClosingAccess.userId, warehouseId: wmsClosingAccess.warehouseId, capability: wmsClosingAccess.capability }).from(wmsClosingAccess).where(eq(wmsClosingAccess.outletId, actor.outletId));
    const staff = await tx.select({ userId: staffProfiles.userId, outletId: staffProfiles.outletId, role: staffProfiles.role, workstation: staffProfiles.workstation, status: staffProfiles.status }).from(staffProfiles).where(or(eq(staffProfiles.outletId, actor.outletId), access.length ? inArray(staffProfiles.userId, access.map(row => row.userId)) : undefined));
    const settings = await tx.select({ outletId: wmsClosingSettings.outletId }).from(wmsClosingSettings).where(eq(wmsClosingSettings.outletId, actor.outletId));
    return { outletId: actor.outletId, checkedAt: new Date().toISOString(), driver: getDatabaseDriver(), ...assessClosingReadiness({ outletId: actor.outletId, configuredSchedule: settings.length > 0, locations: locations.map(row => ({ ...row, warehouseExists: row.existingId !== null })), access, staff }), scope: "configuration_only" as const };
  });
}
