import { describe, expect, it } from "vitest";

import {
  buildDailyBankReport,
  canSeeProductHpp,
  categoryQtyText,
  dailyBankReportText,
  dailyBankStatusLabel,
  salesUnitFor,
  summarizeSalesHpp,
  type SalesLine,
} from "@/lib/sales-hpp-summary";

const line = (over: Partial<SalesLine>): SalesLine => ({
  menuItemId: "bar-latte",
  variantId: "cold",
  itemName: "Coffee Latte",
  variantLabel: "Cold",
  category: "Coffee",
  station: "bar",
  productType: "menu",
  qty: 1,
  revenue: 25_000,
  unitHpp: 9_000,
  ...over,
});

describe("ringkasan penjualan + HPP produk", () => {
  it("satuan: Bar = cup, Dapur & mitra = porsi, retail/lainnya = pcs", () => {
    expect(salesUnitFor({ station: "bar", productType: "menu" })).toBe("cup");
    expect(salesUnitFor({ station: "dapur", productType: "menu" })).toBe("porsi");
    expect(salesUnitFor({ station: "none", productType: "partner" })).toBe("porsi");
    expect(salesUnitFor({ station: "none", productType: "retail" })).toBe("pcs");
    expect(salesUnitFor({ station: null, productType: null })).toBe("pcs");
  });

  it("menjumlah per kategori & produk; HPP = HPP produk × qty; HPP 0 ditandai belum diisi", () => {
    const summary = summarizeSalesHpp([
      line({ qty: 2, revenue: 50_000 }),
      line({ qty: 1, revenue: 25_000 }),
      line({ menuItemId: "nasgor", variantId: "regular", itemName: "Nasi Goreng", variantLabel: "Regular", category: "Makanan", station: "dapur", qty: 3, revenue: 75_000, unitHpp: 12_000 }),
      line({ menuItemId: "rokok", variantId: "bks", itemName: "Rokok", variantLabel: null, category: "Rokok", station: "none", productType: "retail", qty: 1, revenue: 30_000, unitHpp: 0 }),
    ]);
    expect(summary.categories.map((c) => [c.name, c.qty, c.unit, c.hpp])).toEqual([
      // Omzet sama (75.000) → urut nama.
      ["Coffee", 3, "cup", 27_000],
      ["Makanan", 3, "porsi", 36_000],
      ["Rokok", 1, "pcs", 0],
    ]);
    const latte = summary.products.find((p) => p.name === "Coffee Latte · Cold")!;
    expect(latte).toMatchObject({ qty: 3, revenue: 75_000, unitHpp: 9_000, hpp: 27_000, grossProfit: 48_000 });
    expect(summary.products.find((p) => p.name === "Nasi Goreng")?.name).toBe("Nasi Goreng");
    expect(summary.categories.find((c) => c.name === "Rokok")?.missingHppQty).toBe(1);
    expect(summary.totals).toEqual({ qty: 7, revenue: 180_000, hpp: 63_000, grossProfit: 117_000, missingHppProducts: 1 });
    expect(categoryQtyText(summary.categories)).toBe("Coffee 3 cup · Makanan 3 porsi · Rokok 1 pcs");
    expect(categoryQtyText([])).toBe("Belum ada penjualan");
  });

  it("HPP & laba hanya untuk Owner dan Manajer", () => {
    expect(canSeeProductHpp("Owner")).toBe(true);
    expect(canSeeProductHpp("Manajer")).toBe(true);
    expect(canSeeProductHpp("Kasir")).toBe(false);
    expect(canSeeProductHpp(null)).toBe(false);
  });
});

describe("Laporan Harian Rekening Bersama", () => {
  const sales = summarizeSalesHpp([line({ qty: 10, revenue: 250_000, unitHpp: 9_000 })]);
  const figure = {
    date: "2026-11-24",
    orderCount: 8,
    grossSales: 260_000,
    discount: 5_000,
    refund: 5_000,
    netSales: 250_000,
    payroll: 60_000,
    operatingExpense: 40_000,
    nonOperatingExpense: 10_000,
    otherIncome: 20_000,
    channels: { Cash: 100_000, QRIS: 150_000, Modal: 200_000 },
    source: "live",
  };

  it("laba bersih = omzet bersih − HPP produk − upah − biaya operasional − non-op + pendapatan lain", () => {
    const r = buildDailyBankReport(figure, sales);
    expect(r.hppProducts).toBe(90_000);
    expect(r.grossProfit).toBe(160_000);
    expect(r.operatingCost).toBe(100_000);
    expect(r.operatingProfit).toBe(60_000);
    expect(r.netProfit).toBe(70_000);
    expect(r.netMarginPct).toBe(28);
    expect(r.locked).toBe(false);
    // "Modal" (modal awal laci) bukan uang masuk penjualan.
    expect(r.channels).toEqual([
      { method: "QRIS", amount: 150_000 },
      { method: "Cash", amount: 100_000 },
    ]);
    expect(buildDailyBankReport({ ...figure, netSales: 0, source: "locked" }, sales)).toMatchObject({ netMarginPct: null, locked: true, hppLocked: false });
    expect(buildDailyBankReport({ ...figure, source: "locked" }, sales, { hppFrozen: true }).hppLocked).toBe(true);
    // HPP beku hanya berarti bila hari memang dikunci.
    expect(buildDailyBankReport(figure, sales, { hppFrozen: true }).hppLocked).toBe(false);
    expect(dailyBankStatusLabel({ locked: false, hppLocked: false })).toBe("Sementara");
    expect(dailyBankStatusLabel({ locked: true, hppLocked: true })).toBe("Dikunci");
    expect(dailyBankStatusLabel({ locked: true, hppLocked: false })).toBe("Dikunci, HPP dihitung ulang");
  });

  it("teks ringkasan untuk grup keuangan memuat omzet, cup/porsi, HPP, laba bersih, uang masuk", () => {
    const text = dailyBankReportText(buildDailyBankReport(figure, sales), "Garage Coffee");
    expect(text).toContain("*Laporan Harian Garage Coffee*");
    expect(text).toContain("Selasa, 24 November 2026 (sementara)");
    expect(text).toContain("Omzet bersih: Rp250.000");
    expect(text).toContain("Terjual: Coffee 10 cup");
    expect(text).toContain("HPP produk: -Rp90.000");
    expect(text).toContain("*Laba bersih: Rp70.000*");
    expect(text).toContain("- QRIS: Rp150.000");
    expect(text).not.toContain("Modal");
  });
});
