import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { seedGarageBasics, setupGarageTestDb, teardownGarageTestDb, type GarageTestDb } from "@/lib/test-helpers/garage-test-db";

// Hapus staf permanen meng-cascade riwayat gaji/absen/kasbon. Staf dengan riwayat
// harus ditolak (StaffHasHistoryError) supaya data keuangan tidak hilang;
// staf tanpa riwayat tetap bisa dihapus.

let t: GarageTestDb;
let outletId = "";
const OWNER = "user-del-owner";
const BARU = "user-del-baru";
const LAMA = "user-del-lama";
const ctx = { actorUserId: OWNER, actorName: "Owner", actorRole: "Owner" as const, deviceLabel: "Laptop" };

beforeAll(async () => {
  t = await setupGarageTestDb();
  ({ outletId } = await seedGarageBasics(t, { userId: OWNER }));
  const d = t.getDb();
  await d.insert(t.schema.user).values([
    { id: BARU, name: "Staf Baru", email: `${BARU}@garage.id` },
    { id: LAMA, name: "Staf Lama", email: `${LAMA}@garage.id` },
  ]);
  await d.insert(t.schema.staffProfiles).values([
    { userId: OWNER, outletId, role: "Owner", status: "active" },
    { userId: BARU, outletId, role: "Kasir", status: "active" },
    { userId: LAMA, outletId, role: "Kasir", status: "active" },
  ]).onConflictDoNothing();
  await d.update(t.schema.staffProfiles).set({ role: "Owner" }).where(eq(t.schema.staffProfiles.userId, OWNER));
  await d.insert(t.schema.staffCashAdvances).values({ staffUserId: LAMA, date: "2026-10-01", amount: 50_000 });
}, 90_000);

afterAll(async () => {
  if (t) await teardownGarageTestDb(t);
});

describe("hapus staf menjaga riwayat", () => {
  it("staf dengan kasbon tidak dihapus; kasbon tetap ada", async () => {
    const svc = await import("@/lib/admin-user-service");
    await expect(svc.deleteAdminUser(LAMA, ctx)).rejects.toMatchObject({ code: "STAFF_HAS_HISTORY" });
    const advances = await t.getDb().select().from(t.schema.staffCashAdvances).where(eq(t.schema.staffCashAdvances.staffUserId, LAMA));
    expect(advances).toHaveLength(1);
    const bulk = await svc.bulkAction({ userIds: [BARU, LAMA], action: "delete" }, ctx);
    expect(bulk.affected).toBe(0);
    expect(bulk.error).toMatch(/riwayat/);
  });

  it("staf tanpa riwayat tetap bisa dihapus", async () => {
    const svc = await import("@/lib/admin-user-service");
    await svc.deleteAdminUser(BARU, ctx);
    const rows = await t.getDb().select().from(t.schema.user).where(eq(t.schema.user.id, BARU));
    expect(rows).toHaveLength(0);
  });

  it("daftar staf memakai foto profil karyawan bila ada", async () => {
    const d = t.getDb();
    const [profile] = await d.select().from(t.schema.staffProfiles).where(eq(t.schema.staffProfiles.userId, LAMA));
    await d.insert(t.schema.staffPersonal).values({ staffProfileId: profile.id, photoUrl: "/api/hr/staff/x/files/staff-foto.jpg" } as never);
    const svc = await import("@/lib/admin-user-service");
    const list = await svc.listAdminUsers({});
    expect(list.rows.find((row) => row.userId === LAMA)?.image).toBe("/api/hr/staff/x/files/staff-foto.jpg");
  });
});
