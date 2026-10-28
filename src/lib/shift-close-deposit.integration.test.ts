import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { Role } from "@/lib/garage-data";
import type { GarageSession } from "@/lib/server-auth";
import { cashCount } from "@/lib/test-helpers/cash-count";
import { seedGarageBasics, setupGarageTestDb, teardownGarageTestDb, type GarageTestDb } from "@/lib/test-helpers/garage-test-db";

// =============================================================================
// Owner 29 Okt 2026 — "kasir catat setoran": tutup shift menutup laci di buku kas
// (selisih → setoran dalam perjalanan → modal ditinggal) tanpa mengubah kas seharusnya,
// dan setoran muncul sebagai baris Setoran yang dikonfirmasi lewat bukti bank.
// =============================================================================

/* eslint-disable @typescript-eslint/no-explicit-any */
let t: GarageTestDb;
let svc: typeof import("@/lib/garage-service");
let ledger: typeof import("@/lib/cash-ledger");
let outletId = "";
const KASIR = "user-setoran-kasir";
const MANAJER = "user-setoran-manajer";
const PIN = "582014";

function as(userId: string, role: Role): GarageSession {
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
const kasir = () => as(KASIR, "Kasir");
const manajer = () => as(MANAJER, "Manajer");

async function openShift() {
  const opened: any = await svc.createCashSession({ openingCash: 100_000, managerPin: PIN } as any, kasir());
  return opened.id as string;
}

async function rowsFor(sessionId: string) {
  const { eq } = await import("drizzle-orm");
  return t.getDb().select().from(t.schema.cashLedgerEntries).where(eq(t.schema.cashLedgerEntries.cashSessionId, sessionId));
}

/** Net laci per shift dari SEMUA baris (termasuk penutupan) — harus 0 setelah tutup. */
async function drawerNet(sessionId: string) {
  return (await rowsFor(sessionId)).reduce((sum: number, row: any) => sum + (row.toAccount === "drawer" ? row.amount : row.fromAccount === "drawer" ? -row.amount : 0), 0);
}

async function session(id: string) {
  const { eq } = await import("drizzle-orm");
  const [row] = await t.getDb().select().from(t.schema.cashSessions).where(eq(t.schema.cashSessions.id, id));
  return row;
}

beforeAll(async () => {
  t = await setupGarageTestDb();
  ({ outletId } = await seedGarageBasics(t, { userId: KASIR }));
  svc = await import("@/lib/garage-service");
  ledger = await import("@/lib/cash-ledger");
  const { hashPin } = await import("@/lib/attendance");
  const { eq } = await import("drizzle-orm");
  const d = t.getDb();
  await d.insert(t.schema.user).values({ id: MANAJER, name: "Manajer Setoran", email: `${MANAJER}@garage.id` } as any);
  await d
    .insert(t.schema.staffProfiles)
    .values([
      { userId: KASIR, outletId, role: "Kasir", status: "active" },
      { userId: MANAJER, outletId, role: "Manajer", status: "active", pinHash: hashPin(PIN) },
    ])
    .onConflictDoNothing();
  for (const s of await d.select().from(t.schema.cashSessions).where(eq(t.schema.cashSessions.status, "open"))) {
    await d.update(t.schema.cashSessions).set({ status: "closed", closedAt: new Date() }).where(eq(t.schema.cashSessions.id, s.id));
  }
}, 90_000);

afterAll(async () => {
  if (t) await teardownGarageTestDb(t);
});

describe("tutup shift + setoran tercatat", () => {
  it("ada uang disetor tanpa rekening → ditolak, shift tetap buka", async () => {
    const id = await openShift();
    await expect(
      svc.closeCashSession(id, { actualCash: 100_000, denominations: cashCount(100_000), recountDenominations: cashCount(100_000), floatLeft: 50_000 }, kasir()),
    ).rejects.toThrow(/rekening tujuan setoran/);
    expect((await session(id)).status).toBe("open");
    // Tutup tanpa setoran (semua ditinggal) tetap boleh.
    await svc.closeCashSession(id, { actualCash: 100_000, denominations: cashCount(100_000), recountDenominations: cashCount(100_000), floatLeft: 100_000 }, kasir());
    const rows = await rowsFor(id);
    expect(rows.filter((r: any) => r.sourceType === "close_deposit")).toHaveLength(0);
    expect(rows.filter((r: any) => r.sourceType === "close_float").map((r: any) => r.amount)).toEqual([100_000]);
    expect(await drawerNet(id)).toBe(0);
  });

  it("pas: setoran → dalam perjalanan + baris Setoran; modal ditinggal; laci shift = 0; kas seharusnya tidak berubah", async () => {
    const id = await openShift();
    const closed: any = await svc.closeCashSession(
      id,
      { actualCash: 100_000, denominations: cashCount(100_000), recountDenominations: cashCount(100_000), floatLeft: 40_000, depositAccount: "bank_bni" },
      kasir(),
    );
    expect(closed.deposit).toMatchObject({ amount: 60_000, account: "bank_bni" });
    expect(closed.deposit.refNo).toMatch(/^KAS-\d{6}-\d{4}$/);

    const s = await session(id);
    expect(s).toMatchObject({ expectedCash: 100_000, actualCash: 100_000, discrepancy: 0, floatLeft: 40_000, depositAmount: 60_000 });
    expect(await ledger.drawerBalance(id)).toBe(100_000); // kas seharusnya beku
    expect((await ledger.checkDrawerCache(id))?.difference).toBe(0); // tidak memicu alert cache≠buku kas
    expect(await drawerNet(id)).toBe(0);

    const rows = await rowsFor(id);
    const deposit = rows.find((r: any) => r.sourceType === "close_deposit") as any;
    expect(deposit).toMatchObject({ fromAccount: "drawer", toAccount: "deposit_transit", amount: 60_000 });
    expect(rows.find((r: any) => r.sourceType === "close_variance")).toBeUndefined();

    const { eq } = await import("drizzle-orm");
    const [movement] = await t.getDb().select().from(t.schema.cashMovements).where(eq(t.schema.cashMovements.id, closed.deposit.id));
    expect(movement).toMatchObject({ status: "recorded", categoryKey: "setoran", depositAccount: "bank_bni", amount: 60_000, cashSessionId: id, ledgerEntryId: deposit.id, createdBy: KASIR });

    // Konfirmasi bank oleh Manajer (≠ penyetor) → rekening BNI bertambah, dalam perjalanan habis.
    const transitBefore = await ledger.accountBalance("deposit_transit", outletId);
    const bniBefore = await ledger.accountBalance("bank_bni", null);
    await svc.confirmCashDeposit(movement.id, { bankRef: "BNI-TRX-001" }, manajer());
    expect(await ledger.accountBalance("deposit_transit", outletId)).toBe(transitBefore - 60_000);
    expect(await ledger.accountBalance("bank_bni", null)).toBe(bniBefore + 60_000);
    // Setoran shift yang sudah tutup tidak bisa dibatalkan.
    await expect(svc.voidCashMovement(movement.id, "coba batal", manajer())).rejects.toBeTruthy();
  });

  it("kurang: selisih tercatat jujur, setoran dari kas fisik, laci shift = 0", async () => {
    const id = await openShift();
    await svc.closeCashSession(
      id,
      { actualCash: 95_000, denominations: cashCount(95_000), recountDenominations: cashCount(95_000), floatLeft: 50_000, depositAccount: "bank_jago" },
      kasir(),
    );
    const s = await session(id);
    expect(s).toMatchObject({ expectedCash: 100_000, actualCash: 95_000, discrepancy: -5_000, depositAmount: 45_000 });
    const rows = await rowsFor(id);
    expect(rows.find((r: any) => r.sourceType === "close_variance")).toMatchObject({ fromAccount: "drawer", toAccount: "external", amount: 5_000 });
    expect(rows.find((r: any) => r.sourceType === "close_deposit")).toMatchObject({ amount: 45_000 });
    expect(rows.find((r: any) => r.sourceType === "close_float")).toMatchObject({ amount: 50_000 });
    expect(await drawerNet(id)).toBe(0);
    expect(await ledger.drawerBalance(id)).toBe(100_000);
  });

  it("laporan shift: kas seharusnya & buku kas laci tidak berubah, penutupan tampil terpisah; akun laci outlet hanya shift buka", async () => {
    const id = await openShift();
    await svc.closeCashSession(
      id,
      { actualCash: 102_000, denominations: cashCount(102_000), recountDenominations: cashCount(102_000), floatLeft: 100_000, depositAccount: "bank_bni" },
      kasir(),
    );
    const { getShiftAccountability } = await import("@/lib/shift-accountability-report");
    const report: any = await getShiftAccountability(id);
    expect(report.cash.expected).toBe(100_000);
    expect(report.cash.variance).toBe(2_000);
    expect(report.cash.ledgerLines.map((l: any) => l.sourceType)).toEqual(["opening"]);
    expect(report.cash.ledgerLines.at(-1).running).toBe(100_000);
    expect(report.cash.closingLines.map((l: any) => l.sourceType).sort()).toEqual(["close_deposit", "close_float", "close_variance"]);
    const { renderShiftAccountabilityPdf } = await import("@/lib/shift-accountability-pdf");
    expect((await renderShiftAccountabilityPdf(report)).subarray(0, 5).toString()).toBe("%PDF-");

    // Semua shift tes sudah tutup → saldo akun laci outlet = 0 (tidak menumpuk lagi).
    const { eq, and } = await import("drizzle-orm");
    const open = await t.getDb().select().from(t.schema.cashSessions).where(and(eq(t.schema.cashSessions.outletId, outletId), eq(t.schema.cashSessions.status, "open")));
    expect(open).toHaveLength(0);
    const testSessions = (await t.getDb().select({ id: t.schema.cashSessions.id, ledgerMode: t.schema.cashSessions.ledgerMode }).from(t.schema.cashSessions)).filter((s: any) => s.ledgerMode);
    for (const s of testSessions) {
      if ((await rowsFor(s.id)).some((r: any) => r.sourceType.startsWith("close_"))) expect(await drawerNet(s.id)).toBe(0);
    }
  });
});
