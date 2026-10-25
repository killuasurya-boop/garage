import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { cashCount } from "@/lib/test-helpers/cash-count";

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
    await svc.recordCashMovement({ type: "out", categoryKey: "setoran", description: "Setor owner", amount: 1_000_000, counterparty: "Kasir", depositAccount: "bank_jago", managerPin: PIN } as any, kasir());
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

  it("T02: biaya tunai Owner tanpa shift tidak lagi diam-diam memotong laci kasir — wajib sumber dana", async () => {
    const before = (await session(id)).expectedCash;
    await expect(
      svc.createExpense({ category: "Operasional", description: "Beli galon (uang owner)", amount: 200_000, paymentMethod: "Cash" }, owner()),
    ).rejects.toThrow(/sumber dana/);
    await svc.createExpense({ category: "Operasional", description: "Beli galon (uang owner)", amount: 200_000, paymentMethod: "Cash", cashSource: "external" } as any, owner());
    expect((await session(id)).expectedCash).toBe(before);
  });

  it("Satu sumber saldo: laporan shift tidak punya 'penyesuaian lain' tanpa penjelasan", async () => {
    const data: any = await report.getShiftAccountability(id);
    expect(data.cash.otherAdjustments).toBe(0);
  });

  it("T16: selisih Rp1 tidak berlabel balance/ok", async () => {
    const expected = (await session(id)).expectedCash;
    const closed: any = await svc.closeCashSession(id, { actualCash: expected - 1, denominations: cashCount(expected - 1) } as any, kasir());
    expect(closed.discrepancyStatus ?? (await session(id)).discrepancyStatus).not.toBe("ok");
  });
});

describe("Closing (T15, T17–T19)", () => {
  beforeEach(closeAll);
  it("T19: tutup shift standar tanpa hitungan pecahan ditolak di backend", async () => {
    const s: any = await svc.createCashSession({ openingCash: 100_000, managerPin: PIN } as any, kasir2());
    await expect(svc.closeCashSession(s.id, { actualCash: 100_000 } as any, kasir2())).rejects.toThrow();
  });

  it("T15: refund tunai setelah shift asal ditutup → snapshot shift lama tetap & laci baru punya baris kas keluar", async () => {
    const a: any = await svc.createCashSession({ openingCash: 100_000, managerPin: PIN } as any, kasir());
    const sale: any = await sell(40_000, 40_000);
    await svc.closeCashSession(a.id, { actualCash: 140_000, denominations: cashCount(140_000) } as any, kasir());
    const snapshotA: any = await report.getShiftAccountability(a.id);
    const b: any = await svc.createCashSession({ openingCash: 100_000, managerPin: PIN } as any, kasir2());
    await svc.voidOrder(orderNoOf(sale), "Pelanggan batal", manajer());
    const afterA: any = await report.getShiftAccountability(a.id);
    expect(afterA.cash.cashSales - afterA.cash.cashRefundsVoids).toBe(snapshotA.cash.cashSales - snapshotA.cash.cashRefundsVoids);
    expect((await session(b.id)).expectedCash).toBe(60_000);
    const { getDrawerLedger } = await import("@/lib/cash-ledger");
    const ledgerB = await getDrawerLedger(b.id);
    expect(ledgerB.lines.map((l) => [l.sourceType, l.signed])).toEqual([["opening", 100_000], ["void", -40_000]]);
    expect(ledgerB.balance).toBe(60_000);
  });

  it("Verifikasi: Manajer tidak bisa memverifikasi shift miliknya sendiri", async () => {
    const s: any = await svc.createCashSession({ openingCash: 100_000, managerPin: PIN } as any, manajer());
    await svc.closeCashSession(s.id, { actualCash: 100_000, denominations: cashCount(100_000) } as any, manajer());
    await expect(acc.reviewCashSession(s.id, { status: "verified" }, manajer())).rejects.toThrow();
  });

  it("T18: shift berselisih tidak bisa diberi status 'verified' penuh", async () => {
    const s: any = await svc.createCashSession({ openingCash: 100_000, managerPin: PIN } as any, kasir());
    await svc.closeCashSession(s.id, { actualCash: 70_000, denominations: cashCount(70_000), managerPin: PIN } as any, kasir());
    await expect(acc.reviewCashSession(s.id, { status: "verified" }, owner())).rejects.toThrow();
  });
});

describe("Closing & verifikasi — P3/P4", () => {
  beforeEach(closeAll);
  it("selisih: verifikasi wajib 'selisih diakui' + catatan; hitungan pertama tetap, hitung ulang tersimpan", async () => {
    const s: any = await svc.createCashSession({ openingCash: 100_000, managerPin: PIN } as any, kasir());
    const closed: any = await svc.closeCashSession(s.id, { actualCash: 95_000, denominations: cashCount(95_000) } as any, kasir());
    expect(closed.discrepancyStatus).toBe("minor");
    await expect(acc.reviewCashSession(s.id, { status: "verified", acknowledgeDiscrepancy: true }, manajer())).rejects.toMatchObject({
      code: "DISCREPANCY_NOT_ACKNOWLEDGED",
    });
    const res = await acc.reviewCashSession(
      s.id,
      { status: "verified", note: "Kembalian kurang Rp5rb, kasir mengakui", acknowledgeDiscrepancy: true, recountDenominations: cashCount(95_000) },
      manajer(),
    );
    expect(res).toMatchObject({ recountCash: 95_000, discrepancyAcknowledged: true, selfVerified: false });
    const row = await session(s.id);
    expect([row.actualCash, row.recountCash, row.recountBy]).toEqual([95_000, 95_000, MANAJER]);
    const data: any = await report.getShiftAccountability(s.id);
    expect(data.session.shiftStatus).toBe("Diverifikasi · selisih diakui");
  });

  it("hitung ulang pemeriksa berbeda dari kasir → juga wajib diakui walau hitungan pertama balance", async () => {
    const s: any = await svc.createCashSession({ openingCash: 100_000, managerPin: PIN } as any, kasir());
    await svc.closeCashSession(s.id, { actualCash: 100_000, denominations: cashCount(100_000) } as any, kasir());
    await expect(
      acc.reviewCashSession(s.id, { status: "verified", recountDenominations: cashCount(90_000) }, manajer()),
    ).rejects.toMatchObject({ code: "DISCREPANCY_NOT_ACKNOWLEDGED" });
  });

  it("Owner memeriksa shift sendiri = berlabel 'tanpa pemeriksa kedua'", async () => {
    const s: any = await svc.createCashSession({ openingCash: 100_000 } as any, owner());
    await svc.closeCashSession(s.id, { actualCash: 100_000, denominations: cashCount(100_000) } as any, owner());
    const res = await acc.reviewCashSession(s.id, { status: "verified" }, owner());
    expect(res.selfVerified).toBe(true);
    const data: any = await report.getShiftAccountability(s.id);
    expect(data.session.shiftStatus).toBe("Diverifikasi · tanpa pemeriksa kedua");
  });

  it("Manajer tidak bisa memeriksa shift outlet lain", async () => {
    const s: any = await svc.createCashSession({ openingCash: 100_000, managerPin: PIN } as any, kasir());
    await svc.closeCashSession(s.id, { actualCash: 100_000, denominations: cashCount(100_000) } as any, kasir());
    const other = { ...manajer(), profile: { ...manajer().profile, outlet: { ...manajer().profile.outlet, id: "00000000-0000-4000-8000-000000000999" } } } as GarageSession;
    await expect(acc.reviewCashSession(s.id, { status: "verified" }, other)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("verifikasi ditolak selama setoran shift belum dikonfirmasi masuk rekening", async () => {
    const s: any = await svc.createCashSession({ openingCash: 100_000, managerPin: PIN } as any, kasir());
    await sell(50_000, 50_000);
    const dep: any = await svc.recordCashMovement(
      { type: "out", categoryKey: "setoran", description: "Setor sore", amount: 50_000, counterparty: "Kasir", depositAccount: "bank_bni", managerPin: PIN } as any,
      kasir(),
    );
    await svc.closeCashSession(s.id, { actualCash: 100_000, denominations: cashCount(100_000) } as any, kasir());
    await expect(acc.reviewCashSession(s.id, { status: "verified" }, manajer())).rejects.toMatchObject({ code: "DEPOSIT_UNCONFIRMED" });
    await svc.confirmCashDeposit(dep.id, { bankRef: "BNI-123456" }, owner());
    await expect(acc.reviewCashSession(s.id, { status: "verified" }, manajer())).resolves.toMatchObject({ reviewStatus: "verified" });
  });

  it("verifikasi lama yang berselisih tanpa pengakuan tidak dilabel 'tidak ada selisih'", async () => {
    const { eq } = await import("drizzle-orm");
    const s: any = await svc.createCashSession({ openingCash: 100_000, managerPin: PIN } as any, kasir());
    await svc.closeCashSession(s.id, { actualCash: 90_000, denominations: cashCount(90_000) } as any, kasir());
    await t.getDb().update(t.schema.cashSessions).set({ reviewStatus: "verified", discrepancyAcknowledged: false }).where(eq(t.schema.cashSessions.id, s.id));
    const data: any = await report.getShiftAccountability(s.id);
    expect(data.session.shiftStatus).toBe("Diverifikasi · selisih belum diakui (verifikasi lama)");
  });

  it("tutup darurat tanpa pecahan: wajib alasan + PIN Manajer, tercatat di shift", async () => {
    const s: any = await svc.createCashSession({ openingCash: 100_000, managerPin: PIN } as any, kasir2());
    await expect(
      svc.closeCashSession(s.id, { actualCash: 100_000, countSkippedReason: "Kasir sakit, pulang" } as any, kasir2()),
    ).rejects.toThrow(/PIN/);
    await svc.closeCashSession(s.id, { actualCash: 100_000, countSkippedReason: "Kasir sakit, pulang", managerPin: PIN } as any, kasir2());
    const row = await session(s.id);
    expect([row.status, row.countSkippedReason, row.managerSignOffBy]).toEqual(["closed", "Kasir sakit, pulang", MANAJER]);
  });
});

describe("Petty cash (T07, T08, T11, T14) — P2", () => {
  const later = () => new Date(Date.now() + 1000);
  it("baseline: pengajuan & persetujuan belum mengubah saldo; baru berkurang saat uang diserahkan", async () => {
    await acc.createPettyCashEntry({ type: "topup", category: "Pengisian dana", description: "Dana awal", amount: 500_000, fundSource: "bank_jago" }, owner());
    const req: any = await acc.createPettyCashEntry({ type: "expense", category: "Kebersihan", description: "Sabun", amount: 50_000 }, kasir());
    expect(await acc.pettyCashBalanceBefore(outletId, later())).toBe(500_000);
    await acc.decidePettyCashEntry(req.id, { decision: "approve" }, manajer());
    expect(await acc.pettyCashBalanceBefore(outletId, later())).toBe(500_000);
    await acc.decidePettyCashEntry(req.id, { decision: "pay", recipient: "Kasir P0" }, manajer());
    expect(await acc.pettyCashBalanceBefore(outletId, later())).toBe(450_000);
  });

  it("T14: pengajuan Manajer menunggu pemeriksa lain; Manajer tidak bisa menyetujui miliknya sendiri", async () => {
    const row: any = await acc.createPettyCashEntry({ type: "expense", category: "Lain-lain", description: "Belanja manajer", amount: 40_000 }, manajer());
    expect(row.status).toBe("submitted");
    await expect(acc.decidePettyCashEntry(row.id, { decision: "approve" }, manajer())).rejects.toThrow(/Owner atau Manajer lain/);
    const approved: any = await acc.decidePettyCashEntry(row.id, { decision: "approve" }, owner());
    expect(approved.status).toBe("approved");
  });

  it("T08: disetujui ≠ dibayar — saldo fisik baru berkurang saat uang diserahkan", async () => {
    const before = await acc.pettyCashBalanceBefore(outletId, later());
    const req: any = await acc.createPettyCashEntry({ type: "expense", category: "Transport / ongkir", description: "Ongkir", amount: 30_000 }, kasir());
    await acc.decidePettyCashEntry(req.id, { decision: "approve" }, owner());
    expect(await acc.pettyCashBalanceBefore(outletId, later())).toBe(before);
    await expect(acc.decidePettyCashEntry(req.id, { decision: "pay" }, owner())).rejects.toThrow(/penerima/);
    await acc.decidePettyCashEntry(req.id, { decision: "pay", recipient: "Kurir" }, owner());
    expect(await acc.pettyCashBalanceBefore(outletId, later())).toBe(before - 30_000);
  });

  it("T11: pembayaran melebihi saldo petty cash ditolak (saldo tidak boleh negatif)", async () => {
    const balance = await acc.pettyCashBalanceBefore(outletId, later());
    const req: any = await acc.createPettyCashEntry({ type: "expense", category: "Lain-lain", description: "Terlalu besar", amount: balance + 100_000, recipient: "Toko" }, kasir());
    await acc.decidePettyCashEntry(req.id, { decision: "approve" }, owner());
    await expect(acc.decidePettyCashEntry(req.id, { decision: "pay" }, owner())).rejects.toThrow(/tidak cukup/);
    expect(await acc.pettyCashBalanceBefore(outletId, later())).toBe(balance);
  });

  it("T12: dua pembayaran bersamaan melebihi saldo → hanya satu yang lolos", async () => {
    const balance = await acc.pettyCashBalanceBefore(outletId, later());
    const half = Math.floor(balance / 2) + 1_000;
    const a: any = await acc.createPettyCashEntry({ type: "expense", category: "Lain-lain", description: "Bersamaan A", amount: half, recipient: "A" }, kasir());
    const b: any = await acc.createPettyCashEntry({ type: "expense", category: "Lain-lain", description: "Bersamaan B", amount: half, recipient: "B" }, kasir());
    await acc.decidePettyCashEntry(a.id, { decision: "approve" }, owner());
    await acc.decidePettyCashEntry(b.id, { decision: "approve" }, owner());
    const results = await Promise.allSettled([
      acc.decidePettyCashEntry(a.id, { decision: "pay" }, owner()),
      acc.decidePettyCashEntry(b.id, { decision: "pay" }, owner()),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(await acc.pettyCashBalanceBefore(outletId, later())).toBe(balance - half);
  });

  it("T15 (petty): membatalkan entri yang sudah dibayar membuat baris pembalik, saldo historis tidak berubah", async () => {
    const req: any = await acc.createPettyCashEntry({ type: "expense", category: "Lain-lain", description: "Salah catat", amount: 10_000, recipient: "X" }, kasir());
    await acc.decidePettyCashEntry(req.id, { decision: "approve" }, owner());
    await acc.decidePettyCashEntry(req.id, { decision: "pay" }, owner());
    const at = new Date(Date.now() + 300);
    await new Promise((r) => setTimeout(r, 400));
    const balanceAtThatTime = await acc.pettyCashBalanceBefore(outletId, at);
    await acc.decidePettyCashEntry(req.id, { decision: "cancel", note: "salah" }, owner());
    expect(await acc.pettyCashBalanceBefore(outletId, at)).toBe(balanceAtThatTime);
    expect(await acc.pettyCashBalanceBefore(outletId, later())).toBe(balanceAtThatTime + 10_000);
  });
});
