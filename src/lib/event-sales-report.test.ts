import { describe, expect, it } from "vitest";

import { aggregateEventSales, eventSalesCsv, eventSalesRange, type EventSalesOrder } from "@/lib/event-sales-report";

const order = (id: string, patch: Partial<EventSalesOrder> = {}): EventSalesOrder => ({
  id, orderNo: id, status: "paid", parentOrderId: null,
  subtotal: 40_000, discount: 2_000, total: 38_000, createdAt: new Date("2026-10-21T08:00:00Z"), ...patch,
});
const snapshot = { entryId: "entry", entryName: "Kopi + Cemilan", kind: "bundle" as const, groupId: "group", entryQuantity: 2, unitCost: 5_000 };

describe("event sales financial integrity", () => {
  it("does not multiply item totals when an order has multiple payments, and separates pending/failed", () => {
    const report = aggregateEventSales({
      orders: [order("paid"), order("pending", { status: "pending_cashier" }), order("bad", { status: "failed" })],
      items: [{ orderId: "paid", itemName: "Latte", variantLabel: "Cold", qty: 2, lineTotal: 40_000, eventSnapshot: snapshot }],
      payments: [
        { orderId: "paid", method: "Cash", status: "captured", amount: 18_000, metadata: {} },
        { orderId: "paid", method: "QRIS", status: "captured", amount: 20_000, metadata: {} },
        { orderId: "pending", method: "QRIS", status: "pending", amount: 38_000, metadata: {} },
        { orderId: "bad", method: "QRIS", status: "failed", amount: 38_000, metadata: {} },
      ],
    });
    expect(report.summary).toMatchObject({ paidRevenue: 38_000, netSales: 38_000, pendingAmount: 38_000, failedAmount: 38_000, componentUnits: 2 });
    expect(report.entries[0]).toMatchObject({ submittedUnits: 2, remainingComponentUnits: 2, grossItemSales: 40_000 });
    expect(report.cost).toMatchObject({ complete: true, total: 10_000, grossMargin: 28_000 });
  });

  it("includes partitioned split bills but counts a common order and bundle group once", () => {
    const report = aggregateEventSales({
      orders: [order("root", { subtotal: 20_000, discount: 0, total: 20_000 }), order("child", { parentOrderId: "root", subtotal: 20_000, discount: 0, total: 20_000 })],
      items: ["root", "child"].map((orderId) => ({ orderId, itemName: "Kopi", variantLabel: "Cold", qty: 1, lineTotal: 20_000, eventSnapshot: snapshot })),
      payments: ["root", "child"].map((orderId) => ({ orderId, method: "Cash", amount: 20_000, status: "captured", metadata: {} })),
    });
    expect(report.summary).toMatchObject({ originalOrders: 1, paidBills: 2, netSales: 40_000, paidRevenue: 40_000 });
    expect(report.entries[0].submittedUnits).toBe(2);
  });

  it("does not subtract refunds twice from already-reduced order/payment values", () => {
    const report = aggregateEventSales({
      orders: [order("partial", { subtotal: 20_000, discount: 0, total: 20_000 }), order("void", { status: "voided" })],
      items: [{ orderId: "partial", itemName: "Latte", variantLabel: "Cold", qty: 1, lineTotal: 20_000, eventSnapshot: snapshot }],
      payments: [
        { orderId: "partial", method: "Cash", amount: 20_000, status: "captured", metadata: { refundedAmount: 20_000 } },
        { orderId: "void", method: "Cash", amount: 0, status: "voided", metadata: { refundedAmount: 38_000 } },
      ],
    });
    expect(report.summary).toMatchObject({ paidRevenue: 20_000, netSales: 20_000, refundAmount: 20_000, voidReturnAmount: 38_000, cancelledBills: 1 });
  });

  it("reports missing historical costs without substituting current recipe costs", () => {
    const report = aggregateEventSales({
      orders: [order("paid")], payments: [],
      items: [{ orderId: "paid", itemName: "Nasi", variantLabel: "Regular", qty: 2, lineTotal: 40_000, eventSnapshot: { ...snapshot, unitCost: null } }],
    });
    expect(report.cost).toMatchObject({ complete: false, total: null, grossMargin: null, missingComponentUnits: 2, knownSubtotal: 0 });
  });
  it("attributes only contextual event items and proportional discounts in a mixed bill", () => {
    const report = aggregateEventSales({ orders: [order("mixed", { subtotal: 100000, discount: 10000, total: 90000 })], items: [
      { orderId: "mixed", itemName: "Paket", variantLabel: "Pilihan", qty: 1, lineTotal: 40000, eventSnapshot: { ...snapshot, entryQuantity: 1, unitCost: 15000 } },
      { orderId: "mixed", itemName: "Menu Reguler", variantLabel: "Regular", qty: 2, lineTotal: 60000, eventSnapshot: null },
    ], payments: [{ orderId: "mixed", method: "Cash", amount: 90000, status: "captured", metadata: {} }] });
    expect(report.summary).toMatchObject({ grossItemSales: 40000, discounts: 4000, netSales: 36000, paidRevenue: 90000, componentUnits: 1 });
    expect(report.cost).toMatchObject({ complete: true, total: 15000, grossMargin: 21000 });
    expect(report.components).toHaveLength(1);
    expect(report.components[0].name).toBe("Paket");
  });

  it("validates calendar dates and an inclusive maximum range", () => {
    expect(() => eventSalesRange("2026-02-31", "2026-03-01")).toThrow();
    expect(() => eventSalesRange("2026-10-22", "2026-10-21")).toThrow();
    expect(() => eventSalesRange("2026-01-01", "2026-12-31")).toThrow();
    expect(eventSalesRange("2026-10-21", "2026-10-21").end.toISOString()).toBe("2026-10-21T17:00:00.000Z");
  });

  it("escapes spreadsheet formulas in exported user-controlled labels", () => {
    const report = aggregateEventSales({ orders: [order("paid")], payments: [], items: [
      { orderId: "paid", itemName: '=HYPERLINK("x")', variantLabel: "Cold", qty: 1, lineTotal: 40_000, eventSnapshot: { ...snapshot, entryName: '=HYPERLINK("x")' } },
    ] });
    expect(eventSalesCsv(report)).toContain("'=HYPERLINK");
  });
});
