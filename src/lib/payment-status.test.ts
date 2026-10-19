import { describe, expect, it } from "vitest";

import { channelGroupOf, paymentBalance, paymentStatusOf } from "@/lib/payment-status";

describe("paymentStatusOf", () => {
  it("Pending / Lunas / Dibatalkan / Refund terpisah dari metode", () => {
    expect(paymentStatusOf({ status: "paid" })).toBe("paid");
    expect(paymentStatusOf({ status: "awaiting_payment" })).toBe("pending");
    expect(paymentStatusOf({ status: "accepted" })).toBe("pending");
    expect(paymentStatusOf({ status: "pending_cashier" })).toBe("pending");
    expect(paymentStatusOf({ status: "voided" })).toBe("cancelled");
    expect(paymentStatusOf({ status: "rejected" })).toBe("cancelled");
    expect(paymentStatusOf({ status: "refunded" })).toBe("refund");
    expect(paymentStatusOf({ status: "paid" }, "refunded")).toBe("refund");
    expect(paymentStatusOf({ status: "paid" }, "failed")).toBe("cancelled");
  });

  it("dibayar & sisa tagihan", () => {
    expect(paymentBalance(30000, "paid")).toEqual({ paid: 30000, balanceDue: 0 });
    expect(paymentBalance(30000, "pending")).toEqual({ paid: 0, balanceDue: 30000 });
    expect(paymentBalance(30000, "pending", 10000)).toEqual({ paid: 10000, balanceDue: 20000 });
    expect(paymentBalance(30000, "cancelled")).toEqual({ paid: 0, balanceDue: 0 });
  });
});

describe("channelGroupOf", () => {
  it("memetakan jenis pesanan", () => {
    expect(channelGroupOf({ orderSource: "pos", channel: "Dine in" })).toBe("pos_dine_in");
    expect(channelGroupOf({ orderSource: "pos", channel: "Take away" })).toBe("takeaway");
    expect(channelGroupOf({ orderSource: "pos", channel: "Delivery" })).toBe("delivery");
    expect(channelGroupOf({ orderSource: "qr_table", fulfillment: "dine-in", channel: "QR Table" })).toBe("digital_menu");
    expect(channelGroupOf({ orderSource: "qr_takeaway", fulfillment: "takeaway", channel: "QR Takeaway" })).toBe("takeaway");
    expect(channelGroupOf({ orderSource: "qr_takeaway", fulfillment: "delivery", channel: "Delivery" })).toBe("delivery");
  });
});
