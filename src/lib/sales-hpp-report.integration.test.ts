import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { Role } from "@/lib/garage-data";
import type { GarageSession } from "@/lib/server-auth";
import { seedGarageBasics, setupGarageTestDb, teardownGarageTestDb, type GarageTestDb } from "@/lib/test-helpers/garage-test-db";

// Ringkasan penjualan + HPP produk (Owner 24 Nov 2026) di DB nyata: laporan tutup shift & Laporan Harian Rekening Bersama.

/* eslint-disable @typescript-eslint/no-explicit-any */
let t: GarageTestDb;
let svc: typeof import("@/lib/garage-service");
let outletId = "";
const KASIR = "user-shpp-kasir";

const as = (userId: string, role: Role): GarageSession =>
  ({
    user: { id: userId, name: `Nama ${userId}`, email: `${userId}@garage.id` },
    profile: { id: `sp-${userId}`, role, shiftLabel: "Pagi", deviceLabel: "Kasir-1", passwordResetRequired: false, outlet: { id: outletId, code: "TST", name: "Outlet Test", timezone: "Asia/Jakarta" } },
  }) as unknown as GarageSession;

beforeAll(async () => {
  t = await setupGarageTestDb();
  outletId = (await seedGarageBasics(t, { userId: KASIR })).outletId;
  svc = await import("@/lib/garage-service");
  const { eq } = await import("drizzle-orm");
  const d = t.getDb();
  // Kopi = Bar (cup) HPP 5.000; Nasi = Dapur (porsi) HPP 12.000.
  await d.update(t.schema.menuItems).set({ station: "bar" }).where(eq(t.schema.menuItems.id, "itm-coffee"));
  await d.update(t.schema.menuItems).set({ station: "dapur" }).where(eq(t.schema.menuItems.id, "itm-food"));
  await d.update(t.schema.menuVariants).set({ baseCost: 5_000 }).where(eq(t.schema.menuVariants.itemId, "itm-coffee"));
  await d.update(t.schema.menuVariants).set({ baseCost: 12_000 }).where(eq(t.schema.menuVariants.itemId, "itm-food"));
  const kasir = as(KASIR, "Kasir");
  await svc.createOrder({ orderType: "takeaway", paymentMethod: "Cash", cashReceived: 40_000, items: [{ itemId: "itm-coffee", variantId: "reg", qty: 2 }] } as any, kasir);
  await svc.createOrder({ orderType: "takeaway", paymentMethod: "Cash", cashReceived: 30_000, items: [{ itemId: "itm-food", variantId: "reg", qty: 1 }] } as any, kasir);
}, 120_000);

afterAll(async () => {
  await teardownGarageTestDb(t);
});

describe("Ringkasan penjualan + HPP produk", () => {
  it("laporan shift: cup/porsi per kategori, HPP dari HPP produk; PDF jadi untuk Kasir (tanpa HPP) & Owner (dengan HPP)", async () => {
    const { eq } = await import("drizzle-orm");
    const [session] = await t.getDb().select().from(t.schema.cashSessions).where(eq(t.schema.cashSessions.openedBy, KASIR));
    const transactions = await svc.getCashSessionTransactions(session.id, KASIR);
    const summary = await svc.getCashSessionSummary(session.id, KASIR);
    const { salesHppForOrders } = await import("@/lib/sales-hpp-report");
    const sales = await salesHppForOrders(transactions!.orders.map((o: { id: string }) => o.id));
    expect(sales.categories.map((c) => [c.name, c.qty, c.unit, c.revenue, c.hpp])).toEqual([
      ["Coffee", 2, "cup", 40_000, 10_000],
      ["Makanan", 1, "porsi", 30_000, 12_000],
    ]);
    expect(sales.totals).toMatchObject({ qty: 3, revenue: 70_000, hpp: 22_000, grossProfit: 48_000, missingHppProducts: 0 });

    const { generateShiftReportPdf } = await import("@/lib/garage-shift-report-pdf");
    for (const showHpp of [false, true]) {
      const pdf = await generateShiftReportPdf(summary!, transactions!, null, { summary: sales, showHpp });
      expect(pdf.subarray(0, 4).toString()).toBe("%PDF");
      if (process.env.SALES_PDF_OUT) (await import("node:fs")).writeFileSync(`${process.env.SALES_PDF_OUT}/shift-${showHpp ? "owner" : "kasir"}.pdf`, pdf);
    }
  });

  it("laporan harian: omzet bersih − HPP produk = laba kotor; laba bersih mengikuti rumus; PDF & Excel jadi", async () => {
    const { loadFinanceConfig } = await import("@/lib/finance-control");
    const { jakartaDateKey } = await import("@/lib/finance-control-core");
    const today = jakartaDateKey(new Date(), (await loadFinanceConfig()).businessDay);
    const { getDailyBankReports, DailyBankReportError } = await import("@/lib/sales-hpp-report");
    const [report] = await getDailyBankReports(today, today);
    expect(report.netSales).toBe(70_000);
    expect(report.hppProducts).toBe(22_000);
    expect(report.grossProfit).toBe(48_000);
    expect(report.netProfit).toBe(report.grossProfit - report.payroll - report.operatingExpense - report.nonOperatingExpense + report.otherIncome);
    expect(report.channels.find((c) => /cash|tunai/i.test(c.method))?.amount).toBe(70_000);

    const { generateDailyBankReportPdf } = await import("@/lib/daily-bank-report-pdf");
    const pdf = await generateDailyBankReportPdf([report], "Outlet Test");
    if (process.env.SALES_PDF_OUT) (await import("node:fs")).writeFileSync(`${process.env.SALES_PDF_OUT}/harian.pdf`, pdf);
    expect(pdf.subarray(0, 4).toString()).toBe("%PDF");
    const { dailyBankReportWorkbook } = await import("@/lib/daily-bank-report-xlsx");
    const wb = await dailyBankReportWorkbook([report], { outletName: "Outlet Test", from: today, to: today });
    const row = wb.getWorksheet("Ringkasan")!.getRow(4);
    expect(row.getCell(1).value).toBe(today);
    expect(row.getCell(7).value).toBe(70_000);
    expect(row.getCell(9).value).toBe(22_000);
    expect(String(row.getCell(8).value)).toBe("Coffee 2 cup · Makanan 1 porsi");

    await expect(getDailyBankReports(today, "2000-01-01")).rejects.toBeInstanceOf(DailyBankReportError);
    await expect(getDailyBankReports("2026-01-01", "2026-06-01")).rejects.toMatchObject({ code: "RANGE_TOO_LONG" });
  });
});
