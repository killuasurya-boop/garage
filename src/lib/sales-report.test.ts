import { describe, expect, it } from "vitest";

import { buildSalesSummarySlipContent } from "@/lib/management-slips";
import { aggregateSalesReport, paymentMethodGroup } from "@/lib/sales-report";

const at = (iso: string) => new Date(iso);

const orders = [
  { id: "o1", orderNo: "A1", status: "paid", subtotal: 50000, discount: 0, deliveryFee: 0, total: 50000, channel: "Dine in", createdAt: at("2026-10-12T02:15:00Z") },
  { id: "o2", orderNo: "A2", status: "paid", subtotal: 40000, discount: 5000, deliveryFee: 10000, total: 45000, channel: "Delivery", createdAt: at("2026-10-12T02:45:00Z") },
  { id: "o3", orderNo: "A3", status: "voided", subtotal: 20000, discount: 0, deliveryFee: 0, total: 20000, channel: "Take away", createdAt: at("2026-10-12T05:00:00Z") },
];
const items = [
  { orderId: "o1", itemName: "Coffee Latte", variantLabel: "Cold", category: "Coffee", qty: 2, lineTotal: 40000 },
  { orderId: "o1", itemName: "Kentang Ori", variantLabel: "Regular", category: "Cemilan", qty: 1, lineTotal: 10000 },
  { orderId: "o2", itemName: "Coffee Latte", variantLabel: "Cold", category: "Coffee", qty: 2, lineTotal: 40000 },
  { orderId: "o3", itemName: "Ice Tea", variantLabel: "Regular", category: "Non-Coffee", qty: 2, lineTotal: 20000 },
];
const payments = [
  { orderId: "o1", method: "Cash", amount: 30000, status: "captured", cashierName: "Kasir A" },
  { orderId: "o1", method: "QRIS", amount: 20000, status: "captured", cashierName: "Kasir A" },
  { orderId: "o2", method: "QRIS", amount: 45000, status: "captured", cashierName: "Kasir B" },
  { orderId: "o3", method: "Cash", amount: 0, status: "voided", cashierName: "Kasir A" },
];

describe("aggregateSalesReport", () => {
  const report = aggregateSalesReport({ orders, items, payments });

  it("ringkasan hanya dari order lunas; void dihitung terpisah", () => {
    expect(report.summary).toMatchObject({
      gross: 95000,
      transactions: 2,
      averageTicket: 47500,
      itemsSold: 5,
      discount: 5000,
      deliveryFee: 10000,
      voidCount: 1,
      voidValue: 20000,
    });
  });

  it("produk & kategori diurutkan omzet, item void tidak ikut", () => {
    expect(report.products[0]).toMatchObject({ label: "Coffee Latte (Cold)", qty: 4, revenue: 80000 });
    expect(report.products.find((row) => row.label.startsWith("Ice Tea"))).toBeUndefined();
    expect(report.categories.map((row) => row.label)).toEqual(["Coffee", "Cemilan"]);
  });

  it("metode bayar mengikuti pembayaran (split bayar terpecah)", () => {
    expect(report.paymentMethods).toEqual([
      expect.objectContaining({ label: "QRIS", revenue: 65000, count: 2 }),
      expect.objectContaining({ label: "Tunai", revenue: 30000, count: 1 }),
    ]);
  });

  it("per jam WIB, per kasir, per tipe order", () => {
    expect(report.hours.map((row) => row.label)).toEqual(["09.00"]);
    expect(report.cashiers.map((row) => [row.label, row.revenue])).toEqual([
      ["Kasir A", 50000],
      ["Kasir B", 45000],
    ]);
    expect(report.orderTypes.map((row) => row.label)).toEqual(["Dine in", "Delivery"]);
  });

  it("pengelompokan metode bayar", () => {
    expect(paymentMethodGroup("Cash")).toBe("Tunai");
    expect(paymentMethodGroup("Bank Transfer")).toBe("Transfer");
    expect(paymentMethodGroup("E-Wallet")).toBe("E-Wallet");
  });

  it("slip ringkasan muat di 32 kolom", () => {
    const slip = buildSalesSummarySlipContent(
      { ...report, range: { from: "2026-10-12", to: "2026-10-12" }, scope: "outlet", sessionCode: null },
      { width: 32 },
    );
    expect(Math.max(...slip.split("\r\n").map((line) => line.length))).toBeLessThanOrEqual(32);
    expect(slip).toContain("LAPORAN PENJUALAN");
    expect(slip).toContain("4x Coffee Latte (Cold)");
  });
});
