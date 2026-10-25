import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { Role } from "@/lib/garage-data";
import type { GarageSession } from "@/lib/server-auth";
import {
  seedGarageBasics,
  setupGarageTestDb,
  teardownGarageTestDb,
  type GarageTestDb,
} from "@/lib/test-helpers/garage-test-db";

// Laporan lengkap aktivitas kasir: angka PDF = data database (tanpa dummy),
// rekonsiliasi kas dari pecahan, petty cash & kejadian ikut tercatat.

/* eslint-disable @typescript-eslint/no-explicit-any */
let t: GarageTestDb;
let svc: any;
let acc: any;
let report: any;
let pdf: any;
let outletId = "";
let sessionId = "";
const USER = "user-itest-shift-report";

const as = (role: Role) =>
  ({
    user: { id: USER, name: `${role} Test`, email: `${USER}@garage.id` },
    profile: {
      id: `sp-${USER}`,
      role,
      shiftLabel: "Pagi",
      deviceLabel: "Kasir-1",
      passwordResetRequired: false,
      workstation: null,
      outlet: { id: outletId, code: "TST", name: "Outlet Test", timezone: "Asia/Jakarta" },
    },
  }) as unknown as GarageSession;

beforeAll(async () => {
  t = await setupGarageTestDb();
  outletId = (await seedGarageBasics(t, { userId: USER })).outletId;
  svc = await import("@/lib/garage-service");
  acc = await import("@/lib/cashier-accountability");
  report = await import("@/lib/shift-accountability-report");
  pdf = await import("@/lib/shift-accountability-pdf");
  const [row] = await t.getDb().select().from(t.schema.cashSessions);
  sessionId = row.id;
}, 60_000);

afterAll(async () => {
  await teardownGarageTestDb(t);
});

describe("laporan pertanggungjawaban kasir", () => {
  it("menyusun penjualan, kas, petty cash, kejadian & PDF dari data nyata", async () => {
    await svc.createOrder(
      { orderType: "takeaway", paymentMethod: "Cash", cashReceived: 50_000, items: [{ itemId: "itm-coffee", variantId: "reg", qty: 2 }] },
      as("Kasir"),
    );
    await svc.createOrder(
      { orderType: "takeaway", paymentMethod: "QRIS", items: [{ itemId: "itm-food", variantId: "reg", qty: 1 }] },
      as("Kasir"),
    );
    await svc.recordCashMovement(
      { type: "out", category: "Operasional", description: "Beli es batu", amount: 15_000, counterparty: "Toko Es", referenceNo: "NOTA-7" },
      as("Kasir"),
    );
    await acc.createPettyCashEntry({ type: "expense", category: "Kebersihan", description: "Sabun", amount: 12_000 }, as("Kasir"));
    await acc.createShiftIncident({ category: "Gangguan POS / printer", description: "Kertas habis 5 menit" }, as("Kasir"));
    await svc.closeCashSession(
      sessionId,
      { actualCash: 125_000, denominations: { "100000": 1, "20000": 1, "5000": 1 }, closingNote: "Aman", floatLeft: 100_000 },
      as("Kasir"),
    );

    const data = await report.getShiftAccountability(sessionId);
    expect(data.sales).toMatchObject({ paidCount: 2, itemsSold: 3, netSales: 70_000, grossSales: 70_000, paymentsReceived: 70_000, unpaidTotal: 0 });
    expect(data.cash).toMatchObject({ openingCash: 100_000, cashSales: 40_000, cashOut: 15_000, cashRefundsVoids: 0, expected: 125_000, actual: 125_000, variance: 0, qris: 30_000, otherAdjustments: 0, deposit: 25_000 });
    expect(data.methods.map((m: any) => m.group).sort()).toEqual(["QRIS", "Tunai"]);
    expect(data.products.map((p: any) => [p.name, p.unit, p.sold])).toEqual([
      ["Kopi Test", "cup", 2],
      ["Nasi Test", "porsi", 1],
    ]);
    expect(data.movements[0]).toMatchObject({ counterparty: "Toko Es", referenceNo: "NOTA-7", amount: 15_000 });
    expect(data.petty).toHaveLength(1);
    expect(data.petty[0].status).toBe("submitted");
    expect(data.incidents).toHaveLength(1);
    expect(data.session.shiftStatus).toBe("Ditutup · menunggu verifikasi");
    expect(data.dataGaps.some((gap: string) => /modal awal/.test(gap))).toBe(true);

    const buffer: Buffer = await pdf.renderShiftAccountabilityPdf(data);
    expect(buffer.subarray(0, 4).toString()).toBe("%PDF");
    expect(buffer.length).toBeGreaterThan(8_000);

    const daily: Buffer = await pdf.renderDailyAccountabilityPdf({
      kind: "combined",
      date: data.session.businessDate,
      outletName: "Outlet Test",
      reports: [data],
      petty: await report.getPettyCashDay(outletId, data.session.businessDate),
    });
    expect(daily.subarray(0, 4).toString()).toBe("%PDF");

    expect(
      pdf.accountabilityFileName({ kind: "shift", date: "2026-10-19", cashierName: "Killua Surya!", shiftNumber: 2 }),
    ).toBe("Laporan_Shift_KilluaSurya_2026-10-19_Shift-2.pdf");
    expect(pdf.accountabilityFileName({ kind: "cash", date: "2026-10-19" })).toBe("Laporan_Kas_PettyCash_2026-10-19.pdf");
  });

  it("verifikasi Manajer lain tampil sebagai status sebenarnya; pemilik shift tidak memverifikasi sendiri", async () => {
    await expect(acc.reviewCashSession(sessionId, { status: "verified", note: "Cocok" }, as("Manajer"))).rejects.toMatchObject({
      code: "INDEPENDENT_REVIEW_REQUIRED",
    });
    const other = "user-itest-report-manajer2";
    await t.getDb().insert(t.schema.user).values({ id: other, name: "Manajer Lain", email: `${other}@garage.id` });
    const reviewer = { ...as("Manajer"), user: { id: other, name: "Manajer Lain", email: `${other}@garage.id` } } as GarageSession;
    await acc.reviewCashSession(sessionId, { status: "verified", note: "Cocok" }, reviewer);
    const data = await report.getShiftAccountability(sessionId);
    expect(data.session.shiftStatus).toBe("Diverifikasi");
    expect(data.session.reviewedByName).toBe("Manajer Lain");
    expect(data.session.discrepancyAcknowledged).toBe(false);
  });
});
