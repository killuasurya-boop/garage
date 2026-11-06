import { describe, expect, it } from "vitest";

import { invoiceFlowSteps, invoiceNeedsPayment, invoicePaymentState, invoiceStationCards, maskPhone } from "@/lib/invoice-v4";

describe("invoicePaymentState", () => {
  it("Lunas hanya dari catatan pembayaran sah", () => {
    expect(invoicePaymentState({ orderStatus: "paid", paymentStatus: "captured" })).toBe("paid");
    expect(invoicePaymentState({ orderStatus: "accepted", paymentStatus: "captured" })).toBe("paid");
    expect(invoicePaymentState({ orderStatus: "accepted", paymentStatus: null, invoiceStatus: "issued" })).toBe("paid");
    expect(invoicePaymentState({ orderStatus: "awaiting_payment", paymentStatus: null })).toBe("pending");
  });

  it("non-tunai yang belum dicek kasir = menunggu konfirmasi, bukan lunas", () => {
    expect(invoicePaymentState({ orderStatus: "pending_cashier", paymentStatus: "pending", paymentMethod: "QRIS" })).toBe(
      "awaiting_confirmation",
    );
    expect(invoicePaymentState({ orderStatus: "pending_cashier", paymentStatus: "pending", paymentMethod: "Cash" })).toBe("pending");
  });

  it("batal / refund / gagal", () => {
    expect(invoicePaymentState({ orderStatus: "voided", paymentStatus: "captured" })).toBe("cancelled");
    expect(invoicePaymentState({ orderStatus: "refunded", paymentStatus: "captured" })).toBe("refund");
    expect(invoicePaymentState({ orderStatus: "awaiting_payment", paymentStatus: "failed" })).toBe("failed");
    expect(invoiceNeedsPayment("cancelled")).toBe(false);
    expect(invoiceNeedsPayment("pending")).toBe(true);
    expect(invoiceNeedsPayment("paid")).toBe(false);
  });
});

describe("invoiceFlowSteps", () => {
  const ts = { orderCreated: "2026-11-06T15:30:00Z", orderAccepted: "2026-11-06T15:31:00Z", cookingStarted: "2026-11-06T15:33:00Z", ready: null, delivered: null };

  it("memetakan 6 langkah lama ke 5 langkah V4", () => {
    const steps = invoiceFlowSteps({ activeStep: 3, timestamps: ts });
    expect(steps.map((step) => step.state)).toEqual(["done", "done", "current", "todo", "todo"]);
    expect(steps[2].at).toBe(ts.cookingStarted);
    expect(steps[3].at).toBeNull();
  });

  it("label siap mengikuti tipe pesanan", () => {
    expect(invoiceFlowSteps({ activeStep: 4, fulfillment: "takeaway" })[3].label).toBe("Siap Diambil");
    expect(invoiceFlowSteps({ activeStep: 4, fulfillment: "dine-in" })[3].label).toBe("Siap Diantar");
  });

  it("delivery baru selesai saat kurir sampai", () => {
    expect(invoiceFlowSteps({ activeStep: 5, fulfillment: "delivery", deliveryStatus: "on_the_way" }).map((s) => s.state)).toEqual([
      "done",
      "done",
      "done",
      "current",
      "todo",
    ]);
    expect(invoiceFlowSteps({ activeStep: 5, fulfillment: "delivery", deliveryStatus: "delivered" }).every((s) => s.state === "done")).toBe(true);
  });

  it("ditolak → tanpa langkah", () => {
    expect(invoiceFlowSteps({ activeStep: -1 })).toEqual([]);
  });
});

describe("invoiceStationCards", () => {
  it("Bar/Dapur dari tiket + Waiter untuk dine-in", () => {
    const cards = invoiceStationCards({
      stations: [
        { station: "bar", status: "ready", readyAt: "2026-11-06T15:39:00Z" },
        { station: "kitchen", status: "cooking" },
      ],
      kitchenStatus: "cooking",
      fulfillment: "dine-in",
    });
    expect(cards.map((c) => [c.label, c.status])).toEqual([
      ["Bar", "Selesai"],
      ["Dapur", "Sedang Dibuat"],
      ["Waiter", "Menunggu"],
    ]);
  });

  it("tiket ganda di stasiun sama → tampil yang paling belum selesai", () => {
    const cards = invoiceStationCards({
      stations: [
        { station: "bar", status: "ready" },
        { station: "bar", status: "queue" },
      ],
      kitchenStatus: "queue",
      fulfillment: "takeaway",
    });
    expect(cards[0].status).toBe("Antri");
    expect(cards[1]).toMatchObject({ label: "Kasir", status: "Menunggu" });
  });
});

describe("maskPhone", () => {
  it("tidak pernah menampilkan nomor penuh", () => {
    expect(maskPhone("081234567890")).toBe("0812•••••890");
    expect(maskPhone("123")).toBeNull();
    expect(maskPhone(null)).toBeNull();
  });
});
