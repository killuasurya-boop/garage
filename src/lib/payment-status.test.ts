import { describe, expect, it } from "vitest";

import { paymentBalance, paymentStatusOf } from "@/lib/payment-status";

describe("paymentStatusOf", () => {
  it("membedakan status dari metode", () => {
    expect(paymentStatusOf({ status: "paid" })).toBe("paid");
    expect(paymentStatusOf({ status: "awaiting_payment" })).toBe("pending");
    expect(paymentStatusOf({ status: "accepted" })).toBe("pending");
    expect(paymentStatusOf({ status: "pending_cashier" })).toBe("pending");
    expect(paymentStatusOf({ status: "voided" })).toBe("failed");
    expect(paymentStatusOf({ status: "rejected" })).toBe("failed");
    expect(paymentStatusOf({ status: "paid" }, "failed")).toBe("failed");
  });

  it("dibayar & sisa tagihan", () => {
    expect(paymentBalance(30000, "paid")).toEqual({ paid: 30000, balanceDue: 0 });
    expect(paymentBalance(30000, "pending")).toEqual({ paid: 0, balanceDue: 30000 });
    expect(paymentBalance(30000, "pending", 10000)).toEqual({ paid: 10000, balanceDue: 20000 });
    expect(paymentBalance(30000, "failed")).toEqual({ paid: 0, balanceDue: 0 });
  });
});
