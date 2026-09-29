import { describe, it, expect, beforeAll, afterAll } from "vitest";

import {
  setupGarageTestDb,
  teardownGarageTestDb,
  seedGarageBasics,
  type GarageTestDb,
} from "@/lib/test-helpers/garage-test-db";

// =============================================================================
// PIN PERSETUJUAN MANDIRI — Owner & Manajer mengganti PIN-nya sendiri. PIN wajib
// unik antar staf (absensi & persetujuan mengenali staf BY pin).
// =============================================================================

/* eslint-disable @typescript-eslint/no-explicit-any */
let t: GarageTestDb;
let svc: any;
const OWNER = "user-pin-owner";
const MANAJER = "user-pin-manajer";
const KASIR = "user-pin-kasir";

function audit(userId: string, role: string) {
  return { actorUserId: userId, actorName: `${role} Test`, actorRole: role, deviceLabel: "test" };
}

beforeAll(async () => {
  t = await setupGarageTestDb();
  const { outletId } = await seedGarageBasics(t, { userId: OWNER });
  const d = t.getDb();
  await d.insert(t.schema.user).values([
    { id: MANAJER, name: "Manajer Test", email: `${MANAJER}@garage.id` },
    { id: KASIR, name: "Kasir Test", email: `${KASIR}@garage.id` },
  ]);
  await d.insert(t.schema.staffProfiles).values([
    { userId: OWNER, outletId, role: "Owner" },
    { userId: MANAJER, outletId, role: "Manajer" },
    { userId: KASIR, outletId, role: "Kasir" },
  ]);
  svc = await import("@/lib/admin-user-service");
}, 60_000);

afterAll(async () => {
  if (t) await teardownGarageTestDb(t);
});

describe("PIN persetujuan mandiri", () => {
  it("Manajer tanpa PIN bisa mengatur PIN-nya sendiri", async () => {
    expect((await svc.getOwnPinStatus(MANAJER)).pinConfigured).toBe(false);
    expect(await svc.setOwnApprovalPin(MANAJER, "2580", audit(MANAJER, "Manajer"))).toEqual({ ok: true });
    expect((await svc.getOwnPinStatus(MANAJER)).pinConfigured).toBe(true);
  });

  it("Manajer bisa mengganti PIN-nya lagi (PIN lama miliknya tidak dianggap bentrok)", async () => {
    expect(await svc.setOwnApprovalPin(MANAJER, "2580", audit(MANAJER, "Manajer"))).toEqual({ ok: true });
    expect(await svc.setOwnApprovalPin(MANAJER, "739104", audit(MANAJER, "Manajer"))).toEqual({ ok: true });
  });

  it("PIN yang sudah dipakai staf lain ditolak — baik mandiri maupun lewat admin", async () => {
    const own = await svc.setOwnApprovalPin(OWNER, "739104", audit(OWNER, "Owner"));
    expect(own.error).toMatch(/sudah dipakai/);
    const byAdmin = await svc.setStaffPin(KASIR, "739104", audit(OWNER, "Owner"));
    expect(byAdmin.error).toMatch(/sudah dipakai/);
  });

  it("PIN lemah & format salah ditolak", async () => {
    expect((await svc.setOwnApprovalPin(OWNER, "1234", audit(OWNER, "Owner"))).error).toMatch(/mudah ditebak/);
    expect((await svc.setOwnApprovalPin(OWNER, "12", audit(OWNER, "Owner"))).error).toMatch(/4-8 digit/);
  });

  it("Kasir tidak memakai PIN persetujuan", async () => {
    const result = await svc.setOwnApprovalPin(KASIR, "8642", audit(KASIR, "Kasir"));
    expect(result.error).toMatch(/Hanya Owner dan Manajer/);
    expect((await svc.getOwnPinStatus(KASIR)).pinConfigured).toBe(false);
  });

  it("perubahan PIN tercatat di audit log", async () => {
    const { eq } = await import("drizzle-orm");
    const logs = await t
      .getDb()
      .select()
      .from(t.schema.auditLogs)
      .where(eq(t.schema.auditLogs.action, "user.set_own_pin"));
    expect(logs.length).toBeGreaterThanOrEqual(3);
  });
});
