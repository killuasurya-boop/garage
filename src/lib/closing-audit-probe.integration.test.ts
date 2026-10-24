import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { Role } from "@/lib/garage-data";
import type { GarageSession } from "@/lib/server-auth";
import { seedGarageBasics, setupGarageTestDb, teardownGarageTestDb, type GarageTestDb } from "@/lib/test-helpers/garage-test-db";

// =============================================================================
// AUDIT P0 — Rencana Closing, Petty Cash & Pertanggungjawaban Kasir (Okt 2026).
// Skenario dokumen (T01…T19) dijalankan terhadap kode SAAT INI.
//   it(...)       = perilaku sudah sesuai rencana (baseline yang harus dijaga).
//   it.fails(...) = celah TERBUKTI: asersi = perilaku yang diminta rencana, dan
//                   saat ini gagal. Saat celah diperbaiki, ubah jadi it(...).
// =============================================================================

/* eslint-disable @typescript-eslint/no-explicit-any */
let t: GarageTestDb;
let svc: typeof import("@/lib/garage-service");
let acc: typeof import("@/lib/cashier-accountability");
let report: typeof import("@/lib/shift-accountability-report");
let outletId = "";
const KASIR = "user-p0-kasir";
const KASIR2 = "user-p0-kasir2";
const MANAJER = "user-p0-manajer";
const OWNER = "user-p0-owner";
const PIN = "482913";

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
const kasir2 = () => as(KASIR2, "Kasir");
const manajer = () => as(MANAJER, "Manajer");
const owner = () => as(OWNER, "Owner");

async function session(id: string) {
  const { eq } = await import("drizzle-orm");
  const [row] = await t.getDb().select().from(t.schema.cashSessions).where(eq(t.schema.cashSessions.id, id));
  return row;
}
async function movementsOf(id: string) {
  const { eq } = await import("drizzle-orm");
  return t.getDb().select().from(t.schema.cashMovements).where(eq(t.schema.cashMovements.cashSessionId, id));
}
const orderNoOf = (r: any) => r.orderNo ?? r.order?.orderNo ?? r.receipt?.orderNo;
async function sell(price: number, cashReceived: number, by = kasir(), method = "Cash") {
  const qty = price / 1_000;
  return svc.createOrder(
    { orderType: "takeaway", paymentMethod: method, cashReceived, items: [{ itemId: "itm-p0", variantId: "reg", qty }] } as any,
    by,
  );
}
async function closeAll() {
  const { eq } = await import("drizzle-orm");
  const open = await t.getDb().select().from(t.schema.cashSessions).where(eq(t.schema.cashSessions.status, "open"));
  for (const s of open) await t.getDb().update(t.schema.cashSessions).set({ status: "closed", closedAt: new Date() }).where(eq(t.schema.cashSessions.id, s.id));
}

beforeAll(async () => {
  t = await setupGarageTestDb();
  ({ outletId } = await seedGarageBasics(t, { userId: KASIR }));
  svc = await import("@/lib/garage-service");
  acc = await import("@/lib/cashier-accountability");
  report = await import("@/lib/shift-accountability-report");
  const { hashPin } = await import("@/lib/attendance");
  const d = t.getDb();
  await d.insert(t.schema.user).values([
    { id: KASIR2, name: "Kasir Dua", email: `${KASIR2}@garage.id` },
    { id: MANAJER, name: "Manajer P0", email: `${MANAJER}@garage.id` },
    { id: OWNER, name: "Owner P0", email: `${OWNER}@garage.id` },
  ]);
  await d.insert(t.schema.staffProfiles).values([
    { userId: KASIR, outletId, role: "Kasir", status: "active" },
    { userId: KASIR2, outletId, role: "Kasir", status: "active" },
    { userId: MANAJER, outletId, role: "Manajer", status: "active", pinHash: hashPin(PIN) },
    { userId: OWNER, outletId, role: "Owner", status: "active" },
  ]).onConflictDoNothing();
  // Item Rp1.000 → qty = nominal/1.000 supaya total transaksi tepat.
  await d.insert(t.schema.menuItems).values({ id: "itm-p0", name: "Item P0", category: "Coffee", section: "Coffee", prep: "1m" });
  await d.insert(t.schema.menuVariants).values({ itemId: "itm-p0", variantId: "reg", label: "Regular", price: 1_000 });
  await closeAll(); // sesi bawaan seedGarageBasics
}, 90_000);

afterAll(async () => {
  if (t) await teardownGarageTestDb(t);
});

describe("Kas laci — rumus (T01–T06)", () => {
  let id = "";
  it("T01/T04: modal 300rb + tunai net 1,5jt (kembalian tidak masuk) − belanja laci 100rb − setoran 1jt = 700rb", async () => {
    id = ((await svc.createCashSession({ openingCash: 300_000, managerPin: PIN } as any, kasir())) as any).id;
    await sell(1_475_000, 1_500_000); // bayar 1,5jt, kembalian 25rb → laci +1.475.000
    await sell(25_000, 50_000); // T04: tagihan 25rb, uang 50rb → +25rb
    await svc.recordCashMovement({ type: "out", categoryKey: "belanja_bar", description: "Es batu", amount: 100_000, managerPin: PIN } as any, kasir());
    await svc.recordCashMovement({ type: "out", categoryKey: "setoran", description: "Setor owner", amount: 1_000_000, counterparty: "Owner", managerPin: PIN } as any, kasir());
    expect((await session(id)).expectedCash).toBe(700_000);
  });

  it("T03: QRIS 500rb tidak menambah laci", async () => {
    const before = (await session(id)).expectedCash;
    await sell(500_000, 0, kasir(), "QRIS");
    expect((await session(id)).expectedCash).toBe(before);
  });

  it("T06: split Cash 30rb + QRIS 20rb → laci hanya +30rb", async () => {
    const before = (await session(id)).expectedCash;
    await svc.createOrder(
      { orderType: "takeaway", paymentMethod: "Cash", items: [{ itemId: "itm-p0", variantId: "reg", qty: 50 }], splits: [{ method: "Cash", amount: 30_000 }, { method: "QRIS", amount: 20_000 }] } as any,
      kasir(),
    );
    expect((await session(id)).expectedCash).toBe(before + 30_000);
  });

  it.fails("T02: biaya tunai dicatat Owner di Finance TIDAK diam-diam memotong laci kasir (atau tercatat sebagai kas keluar laci)", async () => {
    const before = (await session(id)).expectedCash;
    const movementsBefore = (await movementsOf(id)).length;
    await svc.createExpense({ category: "Operasional", description: "Beli galon (uang owner)", amount: 200_000, paymentMethod: "Cash" }, owner());
    const after = (await session(id)).expectedCash;
    const movementsAfter = (await movementsOf(id)).length;
    // Yang diminta: laci tidak berubah, ATAU berubah dengan baris kas keluar yang bisa ditelusuri.
    expect(after === before || movementsAfter === movementsBefore + 1).toBe(true);
  });

  it.fails("Satu sumber saldo: laporan shift tidak punya 'penyesuaian lain' tanpa penjelasan", async () => {
    const data: any = await report.getShiftAccountability(id);
    expect(data.cash.otherAdjustments).toBe(0);
  });

  it.fails("T16: selisih Rp1 tidak berlabel balance/ok", async () => {
    const expected = (await session(id)).expectedCash;
    const closed: any = await svc.closeCashSession(id, { actualCash: expected - 1 } as any, kasir());
    expect(closed.discrepancyStatus ?? (await session(id)).discrepancyStatus).not.toBe("ok");
  });
});

describe("Closing (T15, T17–T19)", () => {
  beforeEach(closeAll);
  it.fails("T19: tutup shift standar tanpa hitungan pecahan ditolak di backend", async () => {
    const s: any = await svc.createCashSession({ openingCash: 100_000, managerPin: PIN } as any, kasir2());
    await expect(svc.closeCashSession(s.id, { actualCash: 100_000 } as any, kasir2())).rejects.toThrow();
  });

  it.fails("T15: refund tunai setelah shift asal ditutup → snapshot shift lama tetap & laci baru punya baris kas keluar", async () => {
    const a: any = await svc.createCashSession({ openingCash: 100_000, managerPin: PIN } as any, kasir());
    const sale: any = await sell(40_000, 40_000);
    await svc.closeCashSession(a.id, { actualCash: 140_000 } as any, kasir());
    const snapshotA: any = await report.getShiftAccountability(a.id);
    const b: any = await svc.createCashSession({ openingCash: 100_000, managerPin: PIN } as any, kasir2());
    await svc.voidOrder(orderNoOf(sale), "Pelanggan batal", manajer());
    const afterA: any = await report.getShiftAccountability(a.id);
    expect(afterA.cash.cashSales - afterA.cash.cashRefundsVoids).toBe(snapshotA.cash.cashSales - snapshotA.cash.cashRefundsVoids);
    expect((await session(b.id)).expectedCash).toBe(60_000);
    expect((await movementsOf(b.id)).length).toBe(1);
  });

  it.fails("Verifikasi: Manajer tidak bisa memverifikasi shift miliknya sendiri", async () => {
    const s: any = await svc.createCashSession({ openingCash: 100_000, managerPin: PIN } as any, manajer());
    await svc.closeCashSession(s.id, { actualCash: 100_000 } as any, manajer());
    await expect(acc.reviewCashSession(s.id, { status: "verified" }, manajer())).rejects.toThrow();
  });

  it.fails("T18: shift berselisih tidak bisa diberi status 'verified' penuh", async () => {
    const s: any = await svc.createCashSession({ openingCash: 100_000, managerPin: PIN } as any, kasir());
    await svc.closeCashSession(s.id, { actualCash: 70_000, managerPin: PIN } as any, kasir());
    await expect(acc.reviewCashSession(s.id, { status: "verified" }, owner())).rejects.toThrow();
  });
});

describe("Petty cash (T07, T08, T11, T14)", () => {
  it("baseline: pengajuan kasir belum mengubah saldo; disetujui baru mengurangi", async () => {
    await acc.createPettyCashEntry({ type: "topup", category: "Pengisian dana", description: "Dana awal", amount: 500_000 }, owner());
    const req: any = await acc.createPettyCashEntry({ type: "expense", category: "Kebersihan", description: "Sabun", amount: 50_000 }, kasir());
    const now = new Date(Date.now() + 1000);
    expect(await acc.pettyCashBalanceBefore(outletId, now)).toBe(500_000);
    await acc.decidePettyCashEntry(req.id, { decision: "approve" }, manajer());
    expect(await acc.pettyCashBalanceBefore(outletId, new Date(Date.now() + 1000))).toBe(450_000);
  });

  it.fails("T14: Manajer tidak bisa mencatat pengeluaran petty cash untuk dirinya sendiri tanpa pemeriksa kedua", async () => {
    const row: any = await acc.createPettyCashEntry({ type: "expense", category: "Lain-lain", description: "Belanja manajer", amount: 40_000 }, manajer());
    expect(row.status).not.toBe("approved");
  });

  it.fails("T08: disetujui ≠ dibayar — saldo fisik baru berkurang saat uang diserahkan", async () => {
    const before = await acc.pettyCashBalanceBefore(outletId, new Date(Date.now() + 1000));
    const req: any = await acc.createPettyCashEntry({ type: "expense", category: "Transport / ongkir", description: "Ongkir", amount: 30_000 }, kasir());
    await acc.decidePettyCashEntry(req.id, { decision: "approve" }, owner());
    // Belum ada event "dibayar" → saldo fisik harus tetap.
    expect(await acc.pettyCashBalanceBefore(outletId, new Date(Date.now() + 1000))).toBe(before);
  });

  it.fails("T11: pengeluaran melebihi saldo petty cash ditolak (saldo tidak boleh negatif)", async () => {
    const balance = await acc.pettyCashBalanceBefore(outletId, new Date(Date.now() + 1000));
    const req: any = await acc.createPettyCashEntry({ type: "expense", category: "Lain-lain", description: "Terlalu besar", amount: balance + 100_000 }, kasir());
    await expect(acc.decidePettyCashEntry(req.id, { decision: "approve" }, owner())).rejects.toThrow();
  });

  it.fails("T15 (petty): membatalkan entri yang sudah disetujui membuat reversal, saldo historis tidak berubah", async () => {
    const req: any = await acc.createPettyCashEntry({ type: "expense", category: "Lain-lain", description: "Salah catat", amount: 10_000 }, kasir());
    await acc.decidePettyCashEntry(req.id, { decision: "approve" }, owner());
    const at = new Date(Date.now() + 500);
    const balanceAtThatTime = await acc.pettyCashBalanceBefore(outletId, at);
    await new Promise((r) => setTimeout(r, 600));
    await acc.decidePettyCashEntry(req.id, { decision: "cancel", note: "salah" }, owner());
    expect(await acc.pettyCashBalanceBefore(outletId, at)).toBe(balanceAtThatTime);
  });
});
