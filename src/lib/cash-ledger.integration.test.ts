import fs from "node:fs";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { cashCount } from "@/lib/test-helpers/cash-count";

import type { Role } from "@/lib/garage-data";
import type { GarageSession } from "@/lib/server-auth";
import { seedGarageBasics, setupGarageTestDb, teardownGarageTestDb, type GarageTestDb } from "@/lib/test-helpers/garage-test-db";

// =============================================================================
// Buku kas tunggal (P1 closing, migrasi 0159): setiap uang laci = satu baris
// immutable; cache expected_cash = Σ buku kas; biaya Finance memakai sumber dana;
// laporan shift dari buku kas; idempotensi; backfill shift berjalan.
// =============================================================================

/* eslint-disable @typescript-eslint/no-explicit-any */
let t: GarageTestDb;
let svc: typeof import("@/lib/garage-service");
let ledger: typeof import("@/lib/cash-ledger");
let report: typeof import("@/lib/shift-accountability-report");
let outletId = "";
const KASIR = "user-cl-kasir";
const MANAJER = "user-cl-manajer";
const OWNER = "user-cl-owner";
const PIN = "551177";

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
const owner = () => as(OWNER, "Owner");
const q = async (sql: string) => (await (t.getPgPool() as any).query(sql)).rows as any[];

async function sessionRow(id: string) {
  const { eq } = await import("drizzle-orm");
  const [row] = await t.getDb().select().from(t.schema.cashSessions).where(eq(t.schema.cashSessions.id, id));
  return row;
}
async function sell(total: number, method = "Cash", cashReceived = total) {
  return (await svc.createOrder(
    { orderType: "takeaway", paymentMethod: method, cashReceived, items: [{ itemId: "itm-cl", variantId: "reg", qty: total / 1_000 }] } as any,
    kasir(),
  )) as any;
}
async function expectCacheMatchesLedger(id: string) {
  const check = await ledger.checkDrawerCache(id);
  expect(check?.difference).toBe(0);
}

let sessionId = "";

beforeAll(async () => {
  t = await setupGarageTestDb();
  ({ outletId } = await seedGarageBasics(t, { userId: KASIR }));
  svc = await import("@/lib/garage-service");
  ledger = await import("@/lib/cash-ledger");
  report = await import("@/lib/shift-accountability-report");
  const { hashPin } = await import("@/lib/attendance");
  const d = t.getDb();
  await d.insert(t.schema.user).values([
    { id: MANAJER, name: "Manajer CL", email: `${MANAJER}@garage.id` },
    { id: OWNER, name: "Owner CL", email: `${OWNER}@garage.id` },
  ]);
  await d.insert(t.schema.staffProfiles).values([
    { userId: KASIR, outletId, role: "Kasir", status: "active" },
    { userId: MANAJER, outletId, role: "Manajer", status: "active", pinHash: hashPin(PIN) },
    { userId: OWNER, outletId, role: "Owner", status: "active" },
  ]).onConflictDoNothing();
  await d.insert(t.schema.menuItems).values({ id: "itm-cl", name: "Item CL", category: "Coffee", section: "Coffee", prep: "1m" });
  await d.insert(t.schema.menuVariants).values({ itemId: "itm-cl", variantId: "reg", label: "Regular", price: 1_000 });
  // Sesi bawaan seed (format lama) ditutup supaya kasir bisa buka shift buku kas.
  await q(`update cash_sessions set status = 'closed', closed_at = now()`);
}, 90_000);

afterAll(async () => {
  if (t) await teardownGarageTestDb(t);
});

describe("buku kas laci", () => {
  it("buka shift = baris modal; penjualan tunai/split masuk, QRIS tidak; cache = buku kas", async () => {
    sessionId = ((await svc.createCashSession({ openingCash: 300_000 }, kasir())) as any).id;
    expect((await sessionRow(sessionId)).ledgerMode).toBe(true);
    await sell(25_000, "Cash", 50_000); // kembalian tidak ikut
    await sell(40_000, "QRIS", 0);
    await svc.createOrder(
      { orderType: "takeaway", paymentMethod: "Cash", items: [{ itemId: "itm-cl", variantId: "reg", qty: 50 }], splits: [{ method: "Cash", amount: 30_000 }, { method: "QRIS", amount: 20_000 }] } as any,
      kasir(),
    );
    const book = await ledger.getDrawerLedger(sessionId);
    expect(book.lines.map((l) => [l.sourceType, l.signed])).toEqual([
      ["opening", 300_000],
      ["sale", 25_000],
      ["sale", 30_000],
    ]);
    expect(book.balance).toBe(355_000);
    await expectCacheMatchesLedger(sessionId);
  });

  it("kas keluar laci (PIN) + pembatalannya = baris keluar lalu baris pembalik", async () => {
    const res: any = await svc.recordCashMovement({ type: "out", categoryKey: "belanja_bar", description: "Es batu", amount: 100_000, managerPin: PIN } as any, kasir());
    const movement = res.movement ?? res;
    const [row] = await q(`select ledger_entry_id from cash_movements where ref_no = '${movement.refNo}'`);
    expect(row.ledger_entry_id).toBeTruthy();
    await svc.voidCashMovement(movement.id, "Salah catat, es batal", manajer());
    const book = await ledger.getDrawerLedger(sessionId);
    const tail = book.lines.slice(-2);
    expect(tail.map((l) => [l.sourceType, l.signed])).toEqual([["drawer_out", -100_000], ["drawer_reversal", 100_000]]);
    expect(tail[1].reversesId).toBe(tail[0].id);
    await expectCacheMatchesLedger(sessionId);
  });

  it("biaya Finance tunai: sumber wajib; Jago tidak memotong laci tapi tercatat di buku; batal = pembalik", async () => {
    const before = await ledger.drawerBalance(sessionId);
    await expect(
      svc.createExpense({ category: "Operasional", description: "Galon", amount: 20_000, paymentMethod: "Cash" }, owner()),
    ).rejects.toBeInstanceOf(svc.ExpenseCashSourceError);
    const jago: any = await svc.createExpense({ category: "Operasional", description: "Galon", amount: 20_000, paymentMethod: "Cash", cashSource: "bank_jago" }, owner());
    expect(await ledger.drawerBalance(sessionId)).toBe(before);
    const [posted] = await q(`select from_account, to_account, amount from cash_ledger_entries where source_type = 'expense' and source_id = '${jago.id}'`);
    expect(posted).toMatchObject({ from_account: "bank_jago", to_account: "external", amount: 20_000 });
    // Kasir mencatat biaya tunai sendiri → laci shiftnya sendiri.
    const own: any = await svc.createExpense({ category: "Operasional", description: "Gas", amount: 15_000, paymentMethod: "Cash" }, kasir());
    expect(own.cashSource).toBe("drawer");
    expect(await ledger.drawerBalance(sessionId)).toBe(before - 15_000);
    await t.getDb().transaction((tx: any) => svc.cancelExpenseInTx(tx, own.id, owner(), "Salah input"));
    expect(await ledger.drawerBalance(sessionId)).toBe(before);
    await expectCacheMatchesLedger(sessionId);
  });

  it("buku kas tidak bisa diubah atau dihapus (trigger DB)", async () => {
    await expect(q(`update cash_ledger_entries set amount = 1`)).rejects.toThrow(/tidak bisa diubah/);
    await expect(q(`delete from cash_ledger_entries`)).rejects.toThrow(/tidak bisa diubah/);
  });

  it("idempotensi: kunci sama + isi sama = satu posting; isi beda ditolak", async () => {
    const db = t.getDb();
    const before = await ledger.drawerBalance(sessionId);
    const input = { sessionId, delta: -5_000, sourceType: "drawer_out" as const, sourceId: "RETRY-1", idempotencyKey: "retry-key-1" };
    const first = await ledger.postDrawerCash(db, input);
    const again = await ledger.postDrawerCash(db, input);
    expect(again?.replay).toBe(true);
    expect(again?.entryId).toBe(first?.entryId);
    await expect(ledger.postDrawerCash(db, { ...input, delta: -6_000 })).rejects.toThrow(/isi yang berbeda/);
    expect(await ledger.drawerBalance(sessionId)).toBe(before - 5_000);
    await expectCacheMatchesLedger(sessionId);
  });

  it("tanggal bisnis Asia/Jakarta (lewat tengah malam UTC)", () => {
    expect(ledger.businessDateOf(new Date("2026-10-24T17:30:00Z"))).toBe("2026-10-25");
    expect(ledger.businessDateOf(new Date("2026-10-24T16:59:00Z"))).toBe("2026-10-24");
  });

  it("laporan shift & ringkasan POS dari buku kas: tanpa 'penyesuaian lain', tutup shift pakai buku kas", async () => {
    const data: any = await report.getShiftAccountability(sessionId);
    expect(data.cash.ledgerMode).toBe(true);
    expect(data.cash.otherAdjustments).toBe(0);
    const balance = await ledger.drawerBalance(sessionId);
    expect(data.cash.expected).toBe(balance);
    const summary: any = await svc.getCashSessionSummary(sessionId, KASIR, { allowAll: true } as any);
    expect(summary.reconciliation.expectedCash).toBe(balance);
    const closed: any = await svc.closeCashSession(sessionId, { actualCash: balance, denominations: cashCount(balance) } as any, kasir());
    expect(closed.discrepancy ?? (await sessionRow(sessionId)).discrepancy).toBe(0);
    const after: any = await report.getShiftAccountability(sessionId);
    expect(after.cash.expected).toBe(balance);
    expect(after.cash.ledgerLines.length).toBeGreaterThan(0);
  });

  it("Final Bayar tunai menambah laci sebesar pembayaran yang dikonfirmasi (sekali)", async () => {
    const s: any = await svc.createCashSession({ openingCash: 100_000, managerPin: PIN } as any, kasir());
    const created: any = await svc.createCustomerOrder({
      orderType: "takeaway",
      outletId,
      customerMode: "guest",
      guestName: "Budi",
      source: "qr_takeaway",
      staffOrder: true,
      paymentMethod: "Cash",
      items: [{ itemId: "itm-cl", variantId: "reg", qty: 30 }],
    } as any);
    const orderId = created.order.id;
    await svc.updateCustomerOrderStatus(orderId, { action: "accept" }, kasir(), { openBill: true });
    const before = await ledger.drawerBalance(s.id);
    const [order] = await q(`select total from orders where id = '${orderId}'`);
    await svc.updateCustomerOrderStatus(orderId, { action: "paid", paymentMethod: "Cash", cashReceived: order.total + 5_000 }, kasir());
    expect(await ledger.drawerBalance(s.id)).toBe(before + order.total);
    const rows = await q(`select source_type, amount from cash_ledger_entries where cash_session_id = '${s.id}' and source_type = 'final_pay'`);
    expect(rows).toEqual([{ source_type: "final_pay", amount: order.total }]);
    await expectCacheMatchesLedger(s.id);
  });
});

describe("migrasi 0159", () => {
  it("shift yang berjalan saat aktivasi: baris saldo awal + ledger_mode, idempoten", async () => {
    await q(`update cash_sessions set status = 'closed', closed_at = now() where status = 'open'`);
    const [open] = await q(`insert into cash_sessions (code, outlet_id, opening_cash, expected_cash, status, opened_by) values ('CS-LEGACY-1', '${outletId}', 100000, 175000, 'open', '${KASIR}') returning id`);
    const sql = fs.readFileSync("./drizzle/0159_cash_ledger.sql", "utf8");
    const tail = sql.split("--> statement-breakpoint").map((x) => x.trim()).filter((x) => /legacy_opening|SET "ledger_mode"/.test(x));
    expect(tail.length).toBe(2);
    for (let run = 0; run < 2; run++) for (const stmt of tail) await (t.getPgPool() as any).exec(stmt);
    const book = await ledger.getDrawerLedger(open.id);
    expect(book.lines.map((l) => [l.sourceType, l.signed])).toEqual([["legacy_opening", 175_000]]);
    expect((await sessionRow(open.id)).ledgerMode).toBe(true);
    await expectCacheMatchesLedger(open.id);
  });

  it("0160: petty cash lama yang disetujui = dibayar pada waktu aslinya; saldo historis sama; idempoten", async () => {
    const acc = await import("@/lib/cashier-accountability");
    const at = new Date("2026-10-20T03:00:00Z");
    const [e1] = await q(`insert into petty_cash_entries (entry_no, outlet_id, type, category, description, amount, status, entry_at, approved_at)
      values ('PC-LEGACY-1', '${outletId}', 'topup', 'Pengisian dana', 'Dana lama', 300000, 'approved', '${at.toISOString()}', '${at.toISOString()}') returning id`);
    await q(`insert into petty_cash_entries (entry_no, outlet_id, type, category, description, amount, status, entry_at, approved_at)
      values ('PC-LEGACY-2', '${outletId}', 'expense', 'Kebersihan', 'Sabun lama', 40000, 'approved', '${new Date(at.getTime() + 3_600_000).toISOString()}', null)`);
    await q(`insert into petty_cash_entries (entry_no, outlet_id, type, category, description, amount, status, entry_at)
      values ('PC-LEGACY-3', '${outletId}', 'expense', 'Lain-lain', 'Ditolak lama', 99000, 'rejected', '${at.toISOString()}')`);
    const sql = fs.readFileSync("./drizzle/0160_petty_cash_payment.sql", "utf8");
    const data = sql.split("--> statement-breakpoint").map((x) => x.trim()).filter((x) => /petty_legacy/.test(x));
    expect(data.length).toBe(2);
    for (let run = 0; run < 2; run++) for (const stmt of data) await (t.getPgPool() as any).exec(stmt);
    const [row] = await q(`select paid_at, ledger_entry_id from petty_cash_entries where id = '${e1.id}'`);
    expect(row.ledger_entry_id).toBeTruthy();
    expect(new Date(row.paid_at).toISOString()).toBe(at.toISOString());
    expect(await acc.pettyCashBalanceBefore(outletId, new Date(at.getTime() + 1_000))).toBe(300_000);
    expect(await acc.pettyCashBalanceBefore(outletId, new Date(at.getTime() + 7_200_000))).toBe(260_000);
    const count = await q(`select count(*)::int n from cash_ledger_entries where idempotency_key like 'petty_legacy:%'`);
    expect(count[0].n).toBe(2);
  });
});
