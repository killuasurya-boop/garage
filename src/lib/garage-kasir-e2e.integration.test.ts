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
// Alur kasir end-to-end (owner, Okt 2026): buka shift → jual tunai/QRIS/split →
// kas keluar/masuk → diskon approval → void → ringkasan shift, laporan
// penjualan, blind count → tutup shift pas. Semua angka harus konsisten.
// =============================================================================

/* eslint-disable @typescript-eslint/no-explicit-any */
let t: GarageTestDb;
let svc: typeof import("@/lib/garage-service");
let outletId = "";
const KASIR = "user-e2e-kasir";
const KASIR_LAIN = "user-e2e-kasir-2";
const KASIR_BASI = "user-e2e-kasir-basi";
const MANAJER = "user-e2e-manajer";
const MANAGER_PIN = "731958";
let sessionId = "";

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

async function expectedCash() {
  const { eq } = await import("drizzle-orm");
  const [row] = await t.getDb().select().from(t.schema.cashSessions).where(eq(t.schema.cashSessions.id, sessionId));
  return row.expectedCash;
}

beforeAll(async () => {
  t = await setupGarageTestDb();
  const seeded = await seedGarageBasics(t, { userId: KASIR });
  outletId = seeded.outletId;
  svc = await import("@/lib/garage-service");
  const { hashPin } = await import("@/lib/attendance");
  const { eq } = await import("drizzle-orm");
  const d = t.getDb();
  await d.insert(t.schema.user).values([
    { id: KASIR_LAIN, name: "Kasir Lain", email: `${KASIR_LAIN}@garage.id` },
    { id: KASIR_BASI, name: "Kasir Basi", email: `${KASIR_BASI}@garage.id` },
    { id: MANAJER, name: "Manajer E2E", email: `${MANAJER}@garage.id` },
  ]);
  await d.insert(t.schema.staffProfiles).values([
    { userId: KASIR, outletId, role: "Kasir", status: "active" },
    { userId: KASIR_LAIN, outletId, role: "Kasir", status: "active" },
    { userId: KASIR_BASI, outletId, role: "Kasir", status: "active" },
    { userId: MANAJER, outletId, role: "Manajer", status: "active", pinHash: hashPin(MANAGER_PIN) },
  ]);
  const [session] = await d.select().from(t.schema.cashSessions).where(eq(t.schema.cashSessions.openedBy, KASIR));
  sessionId = session.id;
}, 60_000);

afterAll(async () => {
  await teardownGarageTestDb(t);
});

let cashOrderNo = "";

describe("Kasir end-to-end", () => {
  it("jual tunai: kembalian dicatat, kas seharusnya naik sebesar total", async () => {
    const result: any = await svc.createOrder(
      {
        orderType: "takeaway",
        paymentMethod: "Cash",
        cashReceived: 50_000,
        items: [{ itemId: "itm-coffee", variantId: "reg", qty: 2 }],
      } as any,
      kasir(),
    );
    cashOrderNo = result.orderNo;
    // Tanpa pajak & service (owner): total = harga menu.
    expect(result.total).toBe(40_000);
    expect(result.tax).toBe(0);
    expect(result.service).toBe(0);
    expect(await expectedCash()).toBe(140_000);
  });

  it("uang tunai kurang ditolak", async () => {
    await expect(
      svc.createOrder(
        { orderType: "takeaway", paymentMethod: "Cash", cashReceived: 10_000, items: [{ itemId: "itm-coffee", variantId: "reg", qty: 1 }] } as any,
        kasir(),
      ),
    ).rejects.toThrow(/kurang/);
  });

  it("QRIS tidak menambah laci; split bayar hanya bagian tunai yang masuk", async () => {
    await svc.createOrder(
      { orderType: "takeaway", paymentMethod: "QRIS", items: [{ itemId: "itm-food", variantId: "reg", qty: 1 }] } as any,
      kasir(),
    );
    expect(await expectedCash()).toBe(140_000);
    await svc.createOrder(
      {
        orderType: "takeaway",
        items: [
          { itemId: "itm-coffee", variantId: "reg", qty: 1 },
          { itemId: "itm-food", variantId: "reg", qty: 1 },
        ],
        splits: [
          { method: "Cash", amount: 20_000 },
          { method: "QRIS", amount: 30_000 },
        ],
      } as any,
      kasir(),
    );
    expect(await expectedCash()).toBe(160_000);
  });

  it("kas keluar di bawah batas langsung tercatat; kas masuk besar wajib PIN Manajer", async () => {
    const out = await svc.recordCashMovement(
      { type: "out", category: "Beli Air/Es", description: "Es batu 2 kantong", amount: 20_000 },
      kasir(),
    );
    expect(out.expenseId).toBeTruthy();
    expect(await expectedCash()).toBe(140_000);

    await expect(
      svc.recordCashMovement({ type: "in", category: "Tambah Uang Kecil", description: "Pecahan dari Owner", amount: 100_000 }, kasir()),
    ).rejects.toBeInstanceOf(svc.CashMovementPinRequiredError);
    await expect(
      svc.recordCashMovement(
        { type: "in", category: "Tambah Uang Kecil", description: "Pecahan dari Owner", amount: 100_000, managerPin: "000000" },
        kasir(),
      ),
    ).rejects.toThrow(/PIN salah/);
    const inMove = await svc.recordCashMovement(
      { type: "in", category: "Tambah Uang Kecil", description: "Pecahan dari Owner", amount: 100_000, managerPin: MANAGER_PIN },
      kasir(),
    );
    expect(inMove.approvedByName).toBe("Manajer E2E");
    expect(await expectedCash()).toBe(240_000);
  });

  it("kas keluar/masuk tanpa shift terbuka ditolak", async () => {
    await expect(
      svc.recordCashMovement({ type: "out", category: "Lain-lain", description: "tes", amount: 5_000 }, as(KASIR_LAIN, "Kasir")),
    ).rejects.toBeInstanceOf(svc.CashSessionRequiredForCashOutError);
  });

  it("approval diskon milik kasir lain tidak bisa dipakai", async () => {
    const [customer] = await t
      .getDb()
      .insert(t.schema.customers)
      .values({ name: "Member E2E", phone: "081200001111", tier: "Silver" } as any)
      .returning();
    const approval: any = await svc.requestManualDiscountApproval(
      { type: "amount", rawValue: 10_000, baseAfterVoucher: 40_000, reason: "Komplain" },
      as(KASIR_LAIN, "Kasir"),
    );
    const approvalId = approval.approvalId ?? approval.id;
    await svc.decideApproval(approvalId, { status: "approved" }, manajer());
    await expect(
      svc.createOrder(
        {
          orderType: "takeaway",
          paymentMethod: "QRIS",
          customerId: customer.id,
          items: [{ itemId: "itm-coffee", variantId: "reg", qty: 2 }],
          manualDiscount: { approvalId, type: "amount", rawValue: 10_000, amount: 10_000, reason: "Komplain" },
        } as any,
        kasir(),
      ),
    ).rejects.toThrow(/bukan untuk transaksi Anda/);
  });

  it("PIN di kasir hanya untuk pengajuan POS", async () => {
    await expect(
      svc.decideApprovalWithPin("APP-EXP-xyz", { pin: MANAGER_PIN, status: "approved" }, kasir()),
    ).rejects.toThrow(/menu Persetujuan/);
  });

  it("void tunai oleh Manajer mengurangi laci shift asal (bukan laci Manajer)", async () => {
    const res: any = await svc.requestOrderVoidApproval(cashOrderNo, { reasonCode: "pelanggan_batal" }, manajer());
    expect(res.status).toBe("approved");
    expect(await expectedCash()).toBe(200_000);
  });

  it("ringkasan shift dari pembayaran sesi ini: void terhitung, metode benar, kas masuk/keluar", async () => {
    const summary: any = await svc.getCashSessionSummary(sessionId, KASIR);
    expect(summary.counts.paid).toBe(2);
    expect(summary.counts.refunded).toBe(1); // order void
    expect(summary.sales.gross).toBe(80_000);
    const byMethod = Object.fromEntries(summary.byMethod.map((m: any) => [m.method, m.total]));
    expect(byMethod).toEqual({ QRIS: 60_000, Cash: 20_000 });
    expect(summary.cashMovements).toEqual({ cashIn: 100_000, cashOut: 20_000 });
  });

  it("laporan penjualan outlet konsisten dengan ringkasan shift", async () => {
    const { getSalesReport } = await import("@/lib/sales-report");
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(new Date());
    const report = await getSalesReport({ outletId, range: { from: today, to: today } });
    expect(report.summary.gross).toBe(80_000);
    expect(report.summary.transactions).toBe(2);
    expect(report.summary.voidCount).toBe(1);
    const methods = Object.fromEntries(report.paymentMethods.map((m) => [m.label, m.revenue]));
    expect(methods).toEqual({ QRIS: 60_000, Tunai: 20_000 });
    const shiftReport = await getSalesReport({ outletId, range: { from: today, to: today }, sessionId });
    expect(shiftReport.scope).toBe("shift");
    expect(shiftReport.summary.gross).toBe(80_000);
  });

  it("blind count: Kasir tidak menerima kas seharusnya selama shift buka", async () => {
    const { redactOpenShiftCash } = await import("@/lib/cash-blind");
    const hidden = redactOpenShiftCash({ status: "open", expectedCash: 200_000, discrepancy: 0 }, "Kasir");
    expect(hidden.expectedCash).toBe(0);
    const shown = redactOpenShiftCash({ status: "open", expectedCash: 200_000, discrepancy: 0 }, "Manajer");
    expect(shown.expectedCash).toBe(200_000);
  });

  it("shift yang terbuka > 20 jam tidak bisa dipakai jualan", async () => {
    await t
      .getDb()
      .insert(t.schema.cashSessions)
      .values({
        code: "CS-BASI",
        openingCash: 100_000,
        expectedCash: 100_000,
        outletId,
        openedBy: KASIR_BASI,
        status: "open",
        openedAt: new Date(Date.now() - 21 * 60 * 60_000),
      });
    await expect(
      svc.createOrder(
        { orderType: "takeaway", paymentMethod: "QRIS", items: [{ itemId: "itm-coffee", variantId: "reg", qty: 1 }] } as any,
        as(KASIR_BASI, "Kasir"),
      ),
    ).rejects.toThrow(/lebih dari 20 jam/);
  });

  it("tutup shift dengan hitungan pas → selisih 0", async () => {
    const closed: any = await svc.closeCashSession(sessionId, { actualCash: 200_000 }, kasir());
    expect(closed.status).toBe("closed");
    expect(closed.expectedCash).toBe(200_000);
    expect(closed.discrepancy).toBe(0);
  });
});
