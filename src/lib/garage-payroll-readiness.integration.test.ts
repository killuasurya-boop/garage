import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  seedGarageBasics,
  setupGarageTestDb,
  teardownGarageTestDb,
  type GarageTestDb,
} from "@/lib/test-helpers/garage-test-db";

// =============================================================================
// INTEGRASI cek kesiapan operasional payroll.
// =============================================================================

let t: GarageTestDb;
let outletId = "";
const NOW = new Date("2026-09-10T10:00:00+07:00");

beforeAll(async () => {
  process.env.PAYROLL_V2_ENABLED = "true";
  t = await setupGarageTestDb();
  outletId = (await seedGarageBasics(t, { userId: "user-seed" })).outletId;
}, 120_000);

afterAll(async () => {
  await teardownGarageTestDb(t);
});

describe("Cek kesiapan", () => {
  it("kondisi awal: belum siap (GPS contoh, aturan & karyawan belum ada)", async () => {
    const { getPayrollReadiness } = await import("@/lib/garage-payroll-readiness");
    const r = await getPayrollReadiness(NOW);
    const status = Object.fromEntries(r.items.map((i) => [i.key, i.status]));
    expect(r.ready).toBe(false);
    expect(status).toMatchObject({ flag: "ok", gps: "todo", rules: "todo", employees: "todo", trial: "todo" });
  });

  it("setelah GPS, aturan, karyawan & satu absen valid → siap", async () => {
    const s = await import("@/lib/garage-payroll-settings");
    const { createAbsenEmployee } = await import("@/lib/garage-absen-employees");
    const { getPayrollReadiness } = await import("@/lib/garage-payroll-readiness");
    await s.setPayrollSetting("gps", { lat: 3.316259, lng: 99.148041, radiusMeters: 20 });
    await s.setPayrollSetting("late.penalty", { mode: "per_minute", perMinute: 1000, cutoffMinutes: 30 });
    await s.setPayrollSetting("fee.pool", { enabled: true, perProduct: 100, splitMode: "per_head", minMinutes: 60, excludePromo: true, excludeRoles: [] });
    await s.setPayrollSetting("bonus.attendance", { enabled: true, amount: 50_000, lateGraceMinutes: 0, allowedOffDays: 2 });
    await createAbsenEmployee({ code: "RDY1", name: "Siap Satu", monthlySalary: 2_000_000 }, { name: "Owner", outletId });
    await t.getDb().insert(t.schema.staffAttendanceV2).values({
      staffUserId: "payroll-rdy1",
      date: "2026-09-09",
      checkinAt: new Date("2026-09-09T09:00:00+07:00"),
      checkoutAt: new Date("2026-09-09T23:00:00+07:00"),
      workedMinutes: 840,
      lateMinutes: 0,
      status: "valid",
    });

    const r = await getPayrollReadiness(NOW);
    const item = (key: string) => r.items.find((i) => i.key === key)!;
    expect(r.ready).toBe(true);
    expect(item("gps").status).toBe("warn"); // radius 20 m terlalu ketat
    expect(item("rules").status).toBe("ok");
    expect(item("employees")).toMatchObject({ status: "ok" });
    expect(item("trial").detail).toContain("1 absen valid");
    // Gaji 2 jt ≥ batas default 1 jt → gajian masuk Approvals.
    expect(item("approval").status).toBe("warn");
  });
});
