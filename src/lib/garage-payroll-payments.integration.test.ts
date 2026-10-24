import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { Role } from "@/lib/garage-data";
import type { GarageSession } from "@/lib/server-auth";
import {
  seedGarageBasics,
  setupGarageTestDb,
  teardownGarageTestDb,
  type GarageTestDb,
} from "@/lib/test-helpers/garage-test-db";

// =============================================================================
// INTEGRASI gajian & kasbon: tandai lunas, potong kasbon FIFO, sisa terbawa,
// pengeluaran Finance (≥ batas approval → pending), tidak bisa bayar dua kali.
// =============================================================================

/* eslint-disable @typescript-eslint/no-explicit-any */
let t: GarageTestDb;
let outletId = "";
const NOW = new Date("2026-09-10T10:00:00+07:00");
const id = (code: string) => `payroll-${code.toLowerCase()}`;

function manajer(): GarageSession {
  return {
    user: { id: "user-seed", name: "Manajer Test", email: "user-seed@garage.id" },
    profile: {
      id: "sp-user-seed",
      role: "Manajer" as Role,
      shiftLabel: "Pagi",
      deviceLabel: "Kantor",
      passwordResetRequired: false,
      outlet: { id: outletId, code: "TST", name: "Outlet Test", timezone: "Asia/Jakarta" },
    },
  } as unknown as GarageSession;
}

async function employee(code: string) {
  const { createAbsenEmployee } = await import("@/lib/garage-absen-employees");
  await createAbsenEmployee({ code, name: `Nama ${code}`, monthlySalary: 1_800_000 }, { name: "Owner", outletId });
}

async function wages(code: string, days: Array<[string, number]>) {
  await t
    .getDb()
    .insert(t.schema.staffDailyWages)
    .values(days.map(([date, total]) => ({ staffUserId: id(code), date, baseWage: total, totalCredited: total })));
}

async function fees(code: string, days: Array<[string, number]>) {
  await t
    .getDb()
    .insert(t.schema.feePoolSplits)
    .values(days.map(([date, amount]) => ({ staffUserId: id(code), date, minutesWorked: 600, sharePct: 100, amount })));
}

async function expensesFor(name: string) {
  const { like } = await import("drizzle-orm");
  return t.getDb().select().from(t.schema.expenses).where(like(t.schema.expenses.description, `%${name}%`));
}

beforeAll(async () => {
  process.env.PAYROLL_V2_ENABLED = "true";
  t = await setupGarageTestDb();
  outletId = (await seedGarageBasics(t, { userId: "user-seed" })).outletId;
  await employee("PAY1");
  await employee("PAY2");
  await employee("PAY3");
}, 120_000);

afterAll(async () => {
  await teardownGarageTestDb(t);
});

describe("Gajian", () => {
  it("bayar s/d tanggal: gaji + fee dipotong kasbon, sisa hari setelahnya tetap belum dibayar", async () => {
    const { giveAdvance, getPayables, payEmployee } = await import("@/lib/garage-payroll-payments");
    const { getGajiWalletSummary } = await import("@/lib/garage-daily-wage");
    await wages("PAY1", [
      ["2026-09-01", 60_000],
      ["2026-09-02", 60_000],
      ["2026-09-03", 60_000],
      ["2026-09-05", 60_000],
    ]);
    await fees("PAY1", [
      ["2026-09-01", 5_000],
      ["2026-09-02", 5_000],
    ]);
    const adv = await giveAdvance({ code: "pay1", amount: 100_000, method: "Cash" }, manajer(), NOW);
    expect(adv.expenseStatus).toBe("recorded");

    const row = (await getPayables("2026-09-03", NOW)).find((r) => r.code === "PAY1")!;
    expect(row).toMatchObject({ gaji: 180_000, fee: 10_000, advance: 100_000, deduction: 100_000, net: 90_000, carryOver: 0 });

    const res = await payEmployee({ code: "PAY1", until: "2026-09-03", method: "Cash" }, manajer(), NOW);
    expect(res).toMatchObject({ grossGaji: 180_000, grossFee: 10_000, advanceDeducted: 100_000, netPaid: 90_000 });
    // Satu pengeluaran per gajian = uang yang benar-benar diserahkan.
    expect(res.expenses.map((e) => [e.amount, e.status])).toEqual([[90_000, "recorded"]]);

    const gajiExp = await expensesFor("Gaji Nama PAY1");
    expect(gajiExp.map((e: any) => [e.category, e.amount])).toEqual([["Gaji Karyawan", 90_000]]);
    expect((await expensesFor("Kasbon Nama PAY1")).map((e: any) => e.category)).toEqual(["Kasbon"]);

    // Tanggal 5 belum dibayar; kasbon lunas.
    const after = (await getPayables("2026-09-09", NOW)).find((r) => r.code === "PAY1")!;
    expect(after).toMatchObject({ gaji: 60_000, fee: 0, advance: 0, firstDate: "2026-09-05" });
    const wallet = await getGajiWalletSummary(id("PAY1"));
    expect(wallet.balance).toBe(60_000);
  });

  it("tidak bisa membayar periode yang sama dua kali", async () => {
    const { payEmployee } = await import("@/lib/garage-payroll-payments");
    await expect(
      payEmployee({ code: "PAY1", until: "2026-09-03", method: "Cash" }, manajer(), NOW),
    ).rejects.toMatchObject({ code: "NOTHING_TO_PAY" });
  });

  it("kasbon lebih besar dari gaji: dipotong FIFO, sisa terbawa, tidak ada uang keluar", async () => {
    const { eq } = await import("drizzle-orm");
    const { giveAdvance, getPayables, payEmployee } = await import("@/lib/garage-payroll-payments");
    await wages("PAY2", [["2026-09-01", 60_000]]);
    await giveAdvance({ code: "PAY2", amount: 50_000, method: "Cash" }, manajer(), new Date("2026-09-02T10:00:00+07:00"));
    await giveAdvance({ code: "PAY2", amount: 100_000, method: "Transfer" }, manajer(), NOW);

    const res = await payEmployee({ code: "PAY2", until: "2026-09-09", method: "Transfer" }, manajer(), NOW);
    expect(res).toMatchObject({ grossGaji: 60_000, advanceDeducted: 60_000, netPaid: 0, expenses: [] });

    const advances = await t
      .getDb()
      .select()
      .from(t.schema.staffCashAdvances)
      .where(eq(t.schema.staffCashAdvances.staffUserId, id("PAY2")))
      .orderBy(t.schema.staffCashAdvances.date);
    expect(advances.map((a: any) => [a.amount, a.settledAmount])).toEqual([
      [50_000, 50_000],
      [100_000, 10_000],
    ]);
    const row = (await getPayables("2026-09-09", NOW)).find((r) => r.code === "PAY2")!;
    expect(row).toMatchObject({ gaji: 0, advance: 90_000, carryOver: 90_000 });
  });

  it("gajian ≥ batas approval masuk Approvals (pending)", async () => {
    const { payEmployee } = await import("@/lib/garage-payroll-payments");
    const days: Array<[string, number]> = [];
    for (let d = 1; d <= 9; d++) days.push([`2026-08-${String(d + 10).padStart(2, "0")}`, 120_000]);
    await wages("PAY3", days);
    const res = await payEmployee({ code: "PAY3", until: "2026-08-31", method: "Transfer" }, manajer(), NOW);
    expect(res.expenses).toMatchObject([{ amount: 1_080_000, status: "pending_approval" }]);
  });

  it("pengeluaran gajian DITOLAK di Approvals → gajian otomatis batal, gaji kembali belum dibayar", async () => {
    const { eq } = await import("drizzle-orm");
    const { getPayables } = await import("@/lib/garage-payroll-payments");
    const { rejectExpense } = await import("@/lib/garage-service");
    const [payment] = await t
      .getDb()
      .select()
      .from(t.schema.staffPayrollPayments)
      .where(eq(t.schema.staffPayrollPayments.staffUserId, id("PAY3")));
    await rejectExpense(payment.gajiExpenseId!, manajer());

    const [after] = await t
      .getDb()
      .select()
      .from(t.schema.staffPayrollPayments)
      .where(eq(t.schema.staffPayrollPayments.id, payment.id));
    expect(after).toMatchObject({ status: "cancelled", cancelReason: "Pengeluaran ditolak di Persetujuan" });
    const row = (await getPayables("2026-08-31", NOW)).find((r) => r.code === "PAY3")!;
    expect(row.gaji).toBe(1_080_000);
  });

  it("tanggal masa depan dan nominal kasbon tidak valid ditolak", async () => {
    const { giveAdvance, payEmployee } = await import("@/lib/garage-payroll-payments");
    await expect(
      payEmployee({ code: "PAY1", until: "2026-09-11", method: "Cash" }, manajer(), NOW),
    ).rejects.toMatchObject({ code: "DATE_INVALID" });
    await expect(giveAdvance({ code: "PAY1", amount: 500, method: "Cash" }, manajer(), NOW)).rejects.toMatchObject({
      code: "AMOUNT_INVALID",
    });
    await expect(giveAdvance({ code: "NOPE", amount: 5_000, method: "Cash" }, manajer(), NOW)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  it("riwayat menampilkan gajian & kasbon", async () => {
    const { getPaymentHistory } = await import("@/lib/garage-payroll-payments");
    const h = await getPaymentHistory();
    expect(h.payments).toHaveLength(3);
    expect(h.advances).toHaveLength(3);
    expect(h.payments.find((p) => p.code === "PAY1")).toMatchObject({ paidUntil: "2026-09-03", netPaid: 90_000, status: "paid" });
    expect(h.payments.find((p) => p.code === "PAY3")).toMatchObject({ status: "cancelled" });
  });
});

describe("Pembatalan & kasbon menunggu Approvals", () => {
  it("batalkan gajian: gaji/fee belum dibayar lagi, kasbon kembali persis, laci kasir tidak tersentuh", async () => {
    const { eq } = await import("drizzle-orm");
    const { cancelPayment, getPayables } = await import("@/lib/garage-payroll-payments");
    const [payment] = await t
      .getDb()
      .select()
      .from(t.schema.staffPayrollPayments)
      .where(eq(t.schema.staffPayrollPayments.staffUserId, id("PAY1")));
    const [cashBefore] = await t.getDb().select().from(t.schema.cashSessions);

    await cancelPayment(payment.id, "Salah pilih tanggal", manajer(), NOW);

    const row = (await getPayables("2026-09-03", NOW)).find((r) => r.code === "PAY1")!;
    expect(row).toMatchObject({ gaji: 180_000, fee: 10_000, advance: 100_000, net: 90_000 });
    const [exp] = await expensesFor("Gaji Nama PAY1");
    expect(exp.status).toBe("cancelled");
    const [cashAfter] = await t.getDb().select().from(t.schema.cashSessions);
    // Buku kas (owner, Okt 2026): gaji tunai dibayar dari uang Owner, bukan laci shift
    // orang lain → laci tidak berubah saat dibayar maupun dibatalkan.
    expect(cashAfter.expectedCash - cashBefore.expectedCash).toBe(0);
    await expect(cancelPayment(payment.id, "lagi", manajer(), NOW)).rejects.toMatchObject({ code: "ALREADY_CANCELLED" });

    // Bisa dibayar ulang dengan benar.
    const { payEmployee } = await import("@/lib/garage-payroll-payments");
    const again = await payEmployee({ code: "PAY1", until: "2026-09-03", method: "Transfer" }, manajer(), NOW);
    expect(again).toMatchObject({ netPaid: 90_000, advanceDeducted: 100_000 });
  });

  it("kasbon yang sudah dipotong tidak bisa dibatalkan; yang belum bisa", async () => {
    const { eq } = await import("drizzle-orm");
    const { cancelAdvance, giveAdvance } = await import("@/lib/garage-payroll-payments");
    const [settled] = await t
      .getDb()
      .select()
      .from(t.schema.staffCashAdvances)
      .where(eq(t.schema.staffCashAdvances.staffUserId, id("PAY1")));
    await expect(cancelAdvance(settled.id, "coba", manajer(), NOW)).rejects.toMatchObject({ code: "ADVANCE_SETTLED" });

    await giveAdvance({ code: "PAY1", amount: 20_000, method: "Cash" }, manajer(), NOW);
    const fresh = (
      await t.getDb().select().from(t.schema.staffCashAdvances).where(eq(t.schema.staffCashAdvances.amount, 20_000))
    )[0];
    await cancelAdvance(fresh.id, "Tidak jadi", manajer(), NOW);
    const [after] = await t.getDb().select().from(t.schema.staffCashAdvances).where(eq(t.schema.staffCashAdvances.id, fresh.id));
    expect(after.status).toBe("cancelled");
    const exp = (await expensesFor("Kasbon Nama PAY1")).find((e: any) => e.amount === 20_000);
    expect(exp.status).toBe("cancelled");
  });

  it("kasbon ≥ batas approval belum dipotong sampai disetujui; ditolak → kasbon batal", async () => {
    const { eq } = await import("drizzle-orm");
    const { getPayables, giveAdvance } = await import("@/lib/garage-payroll-payments");
    const { approveExpense, rejectExpense } = await import("@/lib/garage-service");
    await wages("PAY2", [["2026-09-04", 60_000]]);

    const big = await giveAdvance({ code: "PAY2", amount: 1_500_000, method: "Transfer" }, manajer(), NOW);
    expect(big.expenseStatus).toBe("pending_approval");
    let row = (await getPayables("2026-09-09", NOW)).find((r) => r.code === "PAY2")!;
    expect(row).toMatchObject({ advance: 90_000, advancePending: 1_500_000 });

    const [adv] = await t
      .getDb()
      .select()
      .from(t.schema.staffCashAdvances)
      .where(eq(t.schema.staffCashAdvances.amount, 1_500_000));
    await rejectExpense(adv.expenseId!, manajer());
    const [afterReject] = await t.getDb().select().from(t.schema.staffCashAdvances).where(eq(t.schema.staffCashAdvances.id, adv.id));
    expect(afterReject.status).toBe("cancelled");
    row = (await getPayables("2026-09-09", NOW)).find((r) => r.code === "PAY2")!;
    expect(row).toMatchObject({ advance: 90_000, advancePending: 0 });

    // Disetujui Owner → baru ikut dipotong.
    const owner = { ...manajer(), profile: { ...manajer().profile, role: "Owner" as Role } } as GarageSession;
    await giveAdvance({ code: "PAY2", amount: 1_200_000, method: "Transfer" }, manajer(), NOW);
    const [adv2] = await t
      .getDb()
      .select()
      .from(t.schema.staffCashAdvances)
      .where(eq(t.schema.staffCashAdvances.amount, 1_200_000));
    await approveExpense(adv2.expenseId!, owner);
    row = (await getPayables("2026-09-09", NOW)).find((r) => r.code === "PAY2")!;
    expect(row).toMatchObject({ advance: 1_290_000, advancePending: 0 });
  });
});

describe("Slip gaji: status pembayaran", () => {
  it("LUNAS / BELUM DIBAYAR dan sisa kasbon", async () => {
    const { buildPayslips } = await import("@/lib/garage-payslip");
    const [pay1] = await buildPayslips("2026-09", { staffUserId: id("PAY1") }, NOW);
    expect(pay1.payment).toMatchObject({ state: "sebagian", unpaidAmount: 60_000 });
    expect(pay1.payment.payments).toHaveLength(1);
    const [pay3] = await buildPayslips("2026-08", { staffUserId: id("PAY3") }, NOW);
    expect(pay3.payment).toMatchObject({ state: "belum", paidAmount: 0, unpaidAmount: 1_080_000 });
  });
});

describe("Fee produk saat void / refund", () => {
  async function paidOrder(no: string, at: string, items: Array<{ qty: number; unitPrice: number }>) {
    const [order] = await t
      .getDb()
      .insert(t.schema.orders)
      .values({ orderNo: no, outletId, channel: "dine_in", subtotal: 0, service: 0, tax: 0, total: 0, status: "paid" })
      .returning();
    await t
      .getDb()
      .insert(t.schema.orderItems)
      .values(
        items.map((it, i) => ({
          orderId: order.id,
          variantId: "reg",
          itemName: `Item ${i}`,
          variantLabel: "Regular",
          unitPrice: it.unitPrice,
          qty: it.qty,
          lineTotal: it.qty * it.unitPrice,
        })),
      );
    await t
      .getDb()
      .insert(t.schema.payments)
      .values({ orderId: order.id, method: "Cash", amount: 1, createdAt: new Date(`${at}+07:00`) });
    return order.id as string;
  }

  it("hari belum dibagi: pool berkurang; hari sudah dibagi: bagian yang belum dibayar ikut berkurang", async () => {
    const { eq } = await import("drizzle-orm");
    const { reverseFeePoolForOrder } = await import("@/lib/garage-fee-pool");
    const s = await import("@/lib/garage-payroll-settings");
    await s.setPayrollSetting("fee.pool", {
      enabled: true,
      perProduct: 100,
      splitMode: "per_head",
      fallbackMode: "hangus",
      minMinutes: 60,
      excludePromo: true,
      excludeRoles: [],
    });

    // Belum dibagi.
    const o1 = await paidOrder("ORD-FEE-1", "2026-09-06T12:00:00", [{ qty: 3, unitPrice: 20_000 }, { qty: 1, unitPrice: 0 }]);
    await t.getDb().insert(t.schema.feePoolDaily).values({ date: "2026-09-06", poolAmount: 1_000, productCount: 10, feePerProduct: 100 });
    expect(await reverseFeePoolForOrder(o1)).toMatchObject({ removed: 300, productCount: 3, date: "2026-09-06" });
    let [pool] = await t.getDb().select().from(t.schema.feePoolDaily).where(eq(t.schema.feePoolDaily.date, "2026-09-06"));
    expect(pool).toMatchObject({ poolAmount: 700, productCount: 7 });

    // Sudah dibagi: PAY2 belum dibayar (dikurangi), PAY1 sudah dibayar (tetap).
    const o2 = await paidOrder("ORD-FEE-2", "2026-09-07T12:00:00", [{ qty: 5, unitPrice: 20_000 }]);
    await t
      .getDb()
      .insert(t.schema.feePoolDaily)
      .values({ date: "2026-09-07", poolAmount: 2_000, productCount: 20, feePerProduct: 100, finalizedAt: NOW, splitMode: "per_head" });
    await fees("PAY2", [["2026-09-07", 2_000]]);
    await fees("PAY1", [["2026-09-07", 2_000]]);
    const [paid] = await t.getDb().select().from(t.schema.staffPayrollPayments).where(eq(t.schema.staffPayrollPayments.staffUserId, id("PAY1")));
    await t
      .getDb()
      .update(t.schema.feePoolSplits)
      .set({ paymentId: paid.id })
      .where(eq(t.schema.feePoolSplits.staffUserId, id("PAY1")));

    // Refund 2 dari 5 item.
    expect(await reverseFeePoolForOrder(o2, [{ qty: 2, unitPrice: 20_000 }])).toMatchObject({ removed: 200 });
    const splits = await t.getDb().select().from(t.schema.feePoolSplits).where(eq(t.schema.feePoolSplits.date, "2026-09-07"));
    const amountOf = (code: string) => splits.find((x: any) => x.staffUserId === id(code))!.amount;
    expect(amountOf("PAY2")).toBe(1_800);
    expect(amountOf("PAY1")).toBe(2_000);
    [pool] = await t.getDb().select().from(t.schema.feePoolDaily).where(eq(t.schema.feePoolDaily.date, "2026-09-07"));
    expect(pool.poolAmount).toBe(1_800);
    expect(pool.notes).toContain("sudah dibayar");
  });

  it("order yang belum pernah dibayar tidak mengubah fee", async () => {
    const { reverseFeePoolForOrder } = await import("@/lib/garage-fee-pool");
    const [order] = await t
      .getDb()
      .insert(t.schema.orders)
      .values({ orderNo: "ORD-FEE-3", outletId, channel: "dine_in", subtotal: 0, service: 0, tax: 0, total: 0, status: "pending" })
      .returning();
    expect(await reverseFeePoolForOrder(order.id)).toMatchObject({ removed: 0, skipped: "never_paid" });
  });
});
