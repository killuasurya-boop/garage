import { describe, it, expect, beforeAll, afterAll } from "vitest";

import type { GarageSession } from "@/lib/server-auth";
import type { Role } from "@/lib/garage-data";
import {
  setupGarageTestDb,
  teardownGarageTestDb,
  seedGarageBasics,
  type GarageTestDb,
} from "@/lib/test-helpers/garage-test-db";

// =============================================================================
// Buka/tutup shift kasir: hak tutup, sign-off Manajer via PIN, anti tutup ganda,
// guard 1 sesi terbuka per pengguna, dan kas keluar yang tidak di-clamp ke 0.
// =============================================================================

/* eslint-disable @typescript-eslint/no-explicit-any */
let t: GarageTestDb;
let svc: typeof import("@/lib/garage-service");
let outletId = "";
const KASIR = "user-cash-kasir";
const KASIR_LAIN = "user-cash-kasir-2";
const MANAJER = "user-cash-manajer";
const MANAGER_PIN = "482916";

function sessionFor(userId: string, role: Role): GarageSession {
  return {
    user: { id: userId, name: `Nama ${userId}`, email: `${userId}@garage.id` },
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

async function openSessionFor(userId: string, expectedCash = 100_000) {
  const [row] = await t
    .getDb()
    .insert(t.schema.cashSessions)
    .values({
      code: `CS-${userId}-${Math.random().toString(36).slice(2, 8)}`,
      openingCash: 100_000,
      expectedCash,
      outletId,
      openedBy: userId,
      status: "open",
    })
    .returning();
  return row;
}

async function sessionRow(id: string) {
  const { eq } = await import("drizzle-orm");
  const [row] = await t
    .getDb()
    .select()
    .from(t.schema.cashSessions)
    .where(eq(t.schema.cashSessions.id, id));
  return row;
}

beforeAll(async () => {
  t = await setupGarageTestDb();
  const seeded = await seedGarageBasics(t, { userId: KASIR });
  outletId = seeded.outletId;
  svc = await import("@/lib/garage-service");
  const { hashPin } = await import("@/lib/attendance");

  const d = t.getDb();
  await d.insert(t.schema.user).values([
    { id: KASIR_LAIN, name: "Kasir Lain", email: `${KASIR_LAIN}@garage.id` },
    { id: MANAJER, name: "Manajer Test", email: `${MANAJER}@garage.id` },
  ]);
  await d.insert(t.schema.staffProfiles).values([
    { userId: KASIR, outletId, role: "Kasir", status: "active" },
    { userId: KASIR_LAIN, outletId, role: "Kasir", status: "active" },
    { userId: MANAJER, outletId, role: "Manajer", status: "active", pinHash: hashPin(MANAGER_PIN) },
  ]);
}, 60_000);

afterAll(async () => {
  await teardownGarageTestDb(t);
});

async function seededKasirSession() {
  const { and, eq } = await import("drizzle-orm");
  const [row] = await t
    .getDb()
    .select()
    .from(t.schema.cashSessions)
    .where(
      and(eq(t.schema.cashSessions.openedBy, KASIR), eq(t.schema.cashSessions.status, "open")),
    );
  return row;
}

describe("Tutup shift — hak akses & sign-off", () => {
  it("kasir lain tidak boleh menutup shift yang bukan miliknya", async () => {
    const own = await seededKasirSession();
    await expect(
      svc.closeCashSession(own.id, { actualCash: 100_000 }, sessionFor(KASIR_LAIN, "Kasir")),
    ).rejects.toBeInstanceOf(svc.CashSessionForbiddenError);
    expect((await sessionRow(own.id)).status).toBe("open");
  });

  it("checkbox sign-off dari kasir tanpa PIN ditolak", async () => {
    const own = await seededKasirSession();
    await expect(
      svc.closeCashSession(
        own.id,
        { actualCash: 100_000, managerSignOff: true },
        sessionFor(KASIR, "Kasir"),
      ),
    ).rejects.toBeInstanceOf(svc.CashSessionSignOffRequiredError);
  });

  it("selisih critical tanpa sign-off ditolak, shift tetap open", async () => {
    const own = await seededKasirSession();
    await expect(
      svc.closeCashSession(own.id, { actualCash: 0 }, sessionFor(KASIR, "Kasir")),
    ).rejects.toBeInstanceOf(svc.CashSessionSignOffRequiredError);
    expect((await sessionRow(own.id)).status).toBe("open");
  });

  it("PIN salah tidak menutup shift", async () => {
    const own = await seededKasirSession();
    await expect(
      svc.closeCashSession(
        own.id,
        { actualCash: 0, managerPin: "000000" },
        sessionFor(KASIR, "Kasir"),
      ),
    ).rejects.toThrow(/PIN salah/);
    expect((await sessionRow(own.id)).status).toBe("open");
  });

  it("PIN Manajer benar → shift ditutup, sign-off atas nama Manajer, selisih masuk approval", async () => {
    const own = await seededKasirSession();
    const closed: any = await svc.closeCashSession(
      own.id,
      { actualCash: 0, managerPin: MANAGER_PIN },
      sessionFor(KASIR, "Kasir"),
    );
    expect(closed).toMatchObject({
      status: "closed",
      discrepancy: -100_000,
      discrepancyStatus: "critical",
      closedBy: KASIR,
      managerSignOffBy: MANAJER,
    });

    const { eq } = await import("drizzle-orm");
    const [approval] = await t
      .getDb()
      .select()
      .from(t.schema.approvals)
      .where(eq(t.schema.approvals.id, `APP-CASH-${own.id}`));
    expect(approval?.status).toBe("pending");
  });

  it("menutup shift yang sudah closed ditolak (anti tutup ganda)", async () => {
    const { desc } = await import("drizzle-orm");
    const [last] = await t
      .getDb()
      .select()
      .from(t.schema.cashSessions)
      .orderBy(desc(t.schema.cashSessions.closedAt))
      .limit(1);
    await expect(
      svc.closeCashSession(last.id, { actualCash: 0 }, sessionFor(KASIR, "Kasir")),
    ).rejects.toBeInstanceOf(svc.CashSessionAlreadyClosedError);
  });

  it("Manajer outlet yang sama boleh menutup shift kasir lain", async () => {
    const other = await openSessionFor(KASIR_LAIN);
    const closed: any = await svc.closeCashSession(
      other.id,
      { actualCash: 100_000 },
      sessionFor(MANAJER, "Manajer"),
    );
    expect(closed).toMatchObject({ status: "closed", discrepancy: 0, closedBy: MANAJER });
  });
});

describe("Buka shift — guard sesi terbuka", () => {
  // Kuota 2 shift Kasir/hari sudah terpakai test di atas; Manajer tidak kena
  // kuota outlet tapi tetap kena guard 1 sesi terbuka per pengguna.
  it("buka shift memakai modal awal sebagai kas seharusnya; buka kedua ditolak", async () => {
    const opened = await svc.createCashSession({ openingCash: 150_000 }, sessionFor(MANAJER, "Manajer"));
    expect(opened).toMatchObject({ status: "open", openingCash: 150_000, expectedCash: 150_000 });

    await expect(
      svc.createCashSession({ openingCash: 50_000 }, sessionFor(MANAJER, "Manajer")),
    ).rejects.toBeInstanceOf(svc.CashSessionAlreadyOpenError);
  });

  it("database menolak sesi open kedua untuk pengguna yang sama", async () => {
    // MANAJER sudah punya sesi open dari test sebelumnya.
    await expect(openSessionFor(MANAJER)).rejects.toThrow();
  });
});

describe("Kas keluar — atomik dan tidak di-clamp", () => {
  it("pengeluaran tunai melebihi kas membuat expectedCash minus (selisih tetap terlihat)", async () => {
    const { and, eq } = await import("drizzle-orm");
    const d = t.getDb();
    const [own] = await d
      .select()
      .from(t.schema.cashSessions)
      .where(
        and(eq(t.schema.cashSessions.openedBy, MANAJER), eq(t.schema.cashSessions.status, "open")),
      );
    await d
      .update(t.schema.cashSessions)
      .set({ expectedCash: 10_000 })
      .where(eq(t.schema.cashSessions.id, own.id));

    await svc.createExpense(
      { category: "Operasional", description: "Beli es batu", amount: 30_000, paymentMethod: "cash" },
      sessionFor(MANAJER, "Manajer"),
    );
    expect((await sessionRow(own.id)).expectedCash).toBe(-20_000);
  });
});
