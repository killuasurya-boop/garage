import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { cashCount } from "@/lib/test-helpers/cash-count";

import type { GarageSession } from "@/lib/server-auth";
import type { Role } from "@/lib/garage-data";
import {
  seedGarageBasics,
  setupGarageTestDb,
  teardownGarageTestDb,
  type GarageTestDb,
} from "@/lib/test-helpers/garage-test-db";

// =============================================================================
// Shift 1/2 kasir: status "siapa pakai shift apa", pesan error yang menyebut
// pemegang laci, shift tambahan dengan PIN Manajer/Owner, dan POS Owner yang
// memakai shift miliknya sendiri (bukan shift terbaru kasir lain).
// =============================================================================

/* eslint-disable @typescript-eslint/no-explicit-any */
let t: GarageTestDb;
let svc: typeof import("@/lib/garage-service");
let outletId = "";
const KASIR_A = "user-shift-kasir-a";
const KASIR_B = "user-shift-kasir-b";
const MANAJER = "user-shift-manajer";
const MANAGER_PIN = "731905";

function sessionFor(userId: string, name: string, role: Role): GarageSession {
  return {
    user: { id: userId, name, email: `${userId}@garage.id` },
    profile: {
      id: `sp-${userId}`,
      role,
      shiftLabel: "Pagi",
      deviceLabel: "Kasir-1",
      passwordResetRequired: false,
      outlet: { id: outletId, code: "TST", name: "Outlet Test", timezone: "Asia/Jakarta" },
    },
  } as unknown as GarageSession;
}

const kasirA = () => sessionFor(KASIR_A, "Andi", "Kasir");
const kasirB = () => sessionFor(KASIR_B, "Budi", "Kasir");
const manajer = () => sessionFor(MANAJER, "Mira", "Manajer");

beforeAll(async () => {
  t = await setupGarageTestDb();
  const seeded = await seedGarageBasics(t, { userId: KASIR_A });
  outletId = seeded.outletId;
  svc = await import("@/lib/garage-service");
  const { hashPin } = await import("@/lib/attendance");
  const { eq } = await import("drizzle-orm");
  const d = t.getDb();
  // Seed dasar membuat shift terbuka CS-ITEST; mulai dari laci kosong.
  await d.delete(t.schema.cashSessions);
  await d.update(t.schema.user).set({ name: "Andi" }).where(eq(t.schema.user.id, KASIR_A));
  await d.insert(t.schema.user).values([
    { id: KASIR_B, name: "Budi", email: `${KASIR_B}@garage.id` },
    { id: MANAJER, name: "Mira", email: `${MANAJER}@garage.id` },
  ]);
  await d.insert(t.schema.staffProfiles).values([
    { userId: KASIR_A, outletId, role: "Kasir", status: "active" },
    { userId: KASIR_B, outletId, role: "Kasir", status: "active" },
    { userId: MANAJER, outletId, role: "Manajer", status: "active", pinHash: hashPin(MANAGER_PIN) },
  ]);
}, 60_000);

afterAll(async () => {
  await teardownGarageTestDb(t);
});

describe("Shift 1 & 2 kasir", () => {
  it("status menyebut siapa memakai shift & pemegang laci; error menyebut nama", async () => {
    const first: any = await svc.createCashSession({ openingCash: 100_000, shiftNumber: 1 }, kasirA());

    const statusB = await svc.getTodayCashShiftStatus(kasirB());
    expect(statusB.shifts).toHaveLength(1);
    expect(statusB.shifts[0]).toMatchObject({ shiftNumber: 1, cashierName: "Andi", status: "open", mine: false });
    expect(statusB.openByOther?.cashierName).toBe("Andi");
    expect(statusB.nextShiftNumber).toBe(2);

    await expect(
      svc.createCashSession({ openingCash: 100_000, shiftNumber: 2 }, kasirB()),
    ).rejects.toThrow(/dibuka oleh Andi/);

    const statusA = await svc.getTodayCashShiftStatus(kasirA());
    expect(statusA.myOpenSession).toMatchObject({ code: first.code, sameOutlet: true });
    await expect(
      svc.createCashSession({ openingCash: 100_000 }, kasirA()),
    ).rejects.toThrow(/Lanjutkan shift saya/);

    await svc.closeCashSession(first.id, { actualCash: 100_000, denominations: cashCount(100_000), recountDenominations: cashCount(100_000) }, kasirA());
    const second: any = await svc.createCashSession({ openingCash: 100_000, shiftNumber: 2 }, kasirB());
    await svc.closeCashSession(second.id, { actualCash: 100_000, denominations: cashCount(100_000), recountDenominations: cashCount(100_000) }, kasirB());
  });

  it("Shift 1 & 2 terpakai: pesan menyebut pemakainya, PIN Manajer membuka shift tambahan", async () => {
    await expect(
      svc.createCashSession({ openingCash: 100_000, shiftNumber: 1 }, kasirA()),
    ).rejects.toThrow(/Shift 1: Andi .*Shift 2: Budi/);

    const status = await svc.getTodayCashShiftStatus(kasirA());
    expect(status.limitReached).toBe(true);
    expect(status.nextShiftNumber).toBe(3);

    await expect(
      svc.createCashSession({ openingCash: 100_000, managerPin: "000000" }, kasirA()),
    ).rejects.toThrow(/PIN salah/);

    const extra: any = await svc.createCashSession(
      { openingCash: 100_000, shiftNumber: 3, managerPin: MANAGER_PIN },
      kasirA(),
    );
    expect(extra.status).toBe("open");

    const { desc, eq } = await import("drizzle-orm");
    const [log] = await t
      .getDb()
      .select()
      .from(t.schema.auditLogs)
      .where(eq(t.schema.auditLogs.action, "Shift kasir tambahan disetujui"))
      .orderBy(desc(t.schema.auditLogs.id))
      .limit(1);
    expect(log?.object).toBe(extra.code);
    expect(log?.actor).toContain("Mira");

    // Manajer menutup shift yang tertinggal agar kasir lain bisa lanjut.
    const closed: any = await svc.closeCashSession(
      extra.id,
      { actualCash: 100_000, denominations: cashCount(100_000), recountDenominations: cashCount(100_000), managerSignOff: true, closingNote: "Ditutup Manajer/Owner: tes" },
      manajer(),
    );
    expect(closed).toMatchObject({ status: "closed", closedBy: MANAJER });
  });

  it("tutup shift mencatat uang ditinggal & disetor; ditinggal > dihitung ditolak", async () => {
    const shift: any = await svc.createCashSession(
      { openingCash: 100_000, managerPin: MANAGER_PIN },
      kasirB(),
    );
    await expect(
      svc.closeCashSession(shift.id, { actualCash: 150_000, denominations: cashCount(150_000), recountDenominations: cashCount(150_000), floatLeft: 200_000 }, kasirB()),
    ).rejects.toThrow(/tidak boleh lebih besar/);
    const closed: any = await svc.closeCashSession(
      shift.id,
      { actualCash: 150_000, denominations: cashCount(150_000), recountDenominations: cashCount(150_000), floatLeft: 100_000 },
      kasirB(),
    );
    expect(closed).toMatchObject({ floatLeft: 100_000, depositAmount: 50_000 });
    const status = await svc.getTodayCashShiftStatus(kasirA());
    expect(status.previousFloat).toMatchObject({ amount: 100_000, code: shift.code });
  });

  it("POS Manajer memakai shift miliknya sendiri, bukan shift terbaru kasir", async () => {
    const own: any = await svc.createCashSession({ openingCash: 50_000 }, manajer());
    // Shift kasir lain dibuka setelahnya → jadi shift "terbaru" outlet.
    await t.getDb().insert(t.schema.cashSessions).values({
      code: `CS-LATER-${Date.now()}`,
      openingCash: 100_000,
      expectedCash: 100_000,
      outletId,
      openedBy: KASIR_B,
      status: "closed",
      openedAt: new Date(Date.now() + 60_000),
    });
    const boot: any = await svc.getBootstrapData(manajer());
    expect(boot.posCashSession.id).toBe(own.id);
    expect(boot.posCashSession.status).toBe("open");
  });
});
