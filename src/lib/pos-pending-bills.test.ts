import { describe, expect, it } from "vitest";

import type { CustomerOrder } from "@/lib/garage-api-types";
import { ageOf, classifyPendingBill, formatAge, methodLabelOf, newlyOverdueIds, pendingBillsView } from "@/lib/pos-pending-bills";

const NOW = Date.parse("2026-11-05T12:00:00Z"); // 19:00 WIB

function order(over: Partial<CustomerOrder> = {}): CustomerOrder {
  return {
    id: over.id ?? "o1",
    orderNo: "QR-0001",
    tableLabel: "Meja 07",
    channel: "QR",
    status: "accepted",
    orderSource: "qr_table",
    customerMode: "guest",
    customerName: "Budi",
    customerPhone: "0812",
    customerNote: null,
    campaign: null,
    whatsappInvoiceStatus: "not_sent",
    whatsappInvoiceUrl: null,
    invoicePdfUrl: null,
    invoiceWebUrl: null,
    invoicePdfGeneratedAt: null,
    subtotal: 50_000,
    service: 0,
    tax: 0,
    discount: 0,
    total: 50_000,
    createdAt: new Date(NOW - 10 * 60_000).toISOString(),
    acceptedAt: null,
    rejectedAt: null,
    rejectionReason: null,
    paymentMethod: "Cash",
    paymentProvider: null,
    paymentReference: null,
    paymentStatus: "pending",
    invoiceNo: null,
    invoiceStatus: null,
    invoiceIssuedAt: null,
    cashFlowStatus: null,
    cashReceived: null,
    cashDeposited: null,
    cashHeldBy: null,
    cashReceivedAt: null,
    cashDepositedAt: null,
    cashierConfirmedAt: null,
    items: [
      { id: "i1", itemName: "Kopi Susu", variantLabel: "Cold", qty: 2, unitPrice: 20_000, lineTotal: 40_000 },
      { id: "i2", itemName: "Roti", variantLabel: "Regular", qty: 1, unitPrice: 10_000, lineTotal: 10_000 },
    ],
    ...over,
  };
}

describe("Tagihan Belum Bayar — jalur Cash vs QRIS", () => {
  it("Bayar nanti kasir = metode belum dipilih (bukan Tunai), masuk jalur cash", () => {
    expect(methodLabelOf({ paymentMethod: "Cash", staffOrder: true })).toBe("Belum dipilih");
    expect(methodLabelOf({ paymentMethod: "Cash", staffOrder: false })).toBe("Tunai");
    expect(classifyPendingBill(order({ staffOrder: true }), NOW).lane).toBe("cash");
  });

  it("QRIS/Transfer/E-Wallet = jalur digital dengan aksi cek mutasi", () => {
    for (const method of ["QRIS", "Bank Transfer", "E-Wallet"]) {
      const bill = classifyPendingBill(order({ paymentMethod: method }), NOW);
      expect(bill.lane).toBe("digital");
      expect(bill.next.kind).toBe("verify_digital");
    }
    expect(classifyPendingBill(order({ paymentMethod: "QRIS", status: "awaiting_payment", paymentProofUrl: "/x" }), NOW).next.kind).toBe("verify_proof");
  });

  it("uang di waiter ditandai & aksinya terima dari waiter", () => {
    const bill = classifyPendingBill(order({ cashReceived: 50_000 }), NOW);
    expect(bill.cashWithWaiter).toBe(true);
    expect(bill.next.kind).toBe("waiter_holds_cash");
  });

  it("umur: 30 mnt peringatan, 60 mnt terlambat, kemarin = stale", () => {
    expect(ageOf(new Date(NOW - 29 * 60_000).toISOString(), NOW).age).toBe("fresh");
    expect(ageOf(new Date(NOW - 30 * 60_000).toISOString(), NOW).age).toBe("warn");
    expect(ageOf(new Date(NOW - 61 * 60_000).toISOString(), NOW).age).toBe("late");
    expect(ageOf("2026-11-04T16:00:00Z", NOW).age).toBe("stale"); // 23:00 WIB kemarin
    expect(formatAge(75)).toBe("1 j 15 mnt");
  });

  it("view: hanya pending, hitungan per jalur, prioritas terlama dulu, cari isi pesanan", () => {
    const orders = [
      order({ id: "a", createdAt: new Date(NOW - 5 * 60_000).toISOString() }),
      order({ id: "b", paymentMethod: "QRIS", createdAt: new Date(NOW - 70 * 60_000).toISOString(), total: 30_000 }),
      order({ id: "c", status: "paid" }),
      order({ id: "d", status: "rejected" }),
    ];
    const view = pendingBillsView(orders, NOW);
    expect(view.bills.map((bill) => bill.order.id)).toEqual(["b", "a"]);
    expect(view.counts).toEqual({ all: 2, cash: 1, digital: 1, overdue: 1 });
    expect(view.totals).toEqual({ cash: 50_000, digital: 30_000 });
    expect(pendingBillsView(orders, NOW, "cash").bills.map((bill) => bill.order.id)).toEqual(["a"]);
    expect(pendingBillsView(orders, NOW, "overdue").bills.map((bill) => bill.order.id)).toEqual(["b"]);
    expect(pendingBillsView(orders, NOW, "all", "kopi susu").bills).toHaveLength(2);
    expect(pendingBillsView(orders, NOW, "all", "tidak ada").bills).toHaveLength(0);
  });

  it("ringkasan isi pesanan & pengingat sekali per tagihan", () => {
    const bill = classifyPendingBill(order({ createdAt: new Date(NOW - 45 * 60_000).toISOString() }), NOW);
    expect(bill.itemCount).toBe(3);
    expect(bill.itemsSummary).toBe("2× Kopi Susu Cold, 1× Roti");
    expect(newlyOverdueIds([bill], new Set())).toEqual(["o1"]);
    expect(newlyOverdueIds([bill], new Set(["o1"]))).toEqual([]);
  });
});
