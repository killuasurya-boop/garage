import { describe, it, expect } from "vitest";

import { DEFAULT_APP_SETTINGS } from "@/lib/garage-app-settings-types";
import {
  applyRoundingMode,
  calculateBillingTotals,
  calculateOrderBilling,
  capVoucherDiscountBySettings,
  computeManualDiscountAmount,
  computeRefundSplit,
  manualDiscountNeedsApproval,
  orderTypeToChannel,
  kitchenTargetGroupForCategory,
  qrPromoDiscount,
} from "@/lib/garage-billing";

// =============================================================================
// STEP 1 (Kasir) — unit test logika tagihan POS. Inti kebenaran transaksi:
// service charge, PB1, pembulatan, cap voucher, diskon manual, routing tiket.
// =============================================================================

const settings = {
  ...DEFAULT_APP_SETTINGS,
  serviceChargePct: 5,
  taxPct: 10,
  voucherMaxDiscountPct: 50,
  manualDiscountApprovalPct: 10,
  roundingMode: "none",
};

describe("calculateBillingTotals", () => {
  it("hitung service 5% lalu PB1 10% di atas (subtotal+service)", () => {
    // subtotal 100000 → service 5000 → tax 10% * 105000 = 10500 → gross 115500
    const { service, tax, grossTotal } = calculateBillingTotals(100_000, settings);
    expect(service).toBe(5_000);
    expect(tax).toBe(10_500);
    expect(grossTotal).toBe(115_500);
  });

  it("subtotal 0 → semua 0", () => {
    expect(calculateBillingTotals(0, settings)).toEqual({ service: 0, tax: 0, grossTotal: 0 });
  });

  it("pembulatan nearest_1000 dipakai pada grossTotal", () => {
    const rounded = calculateBillingTotals(100_000, { ...settings, roundingMode: "nearest_1000" });
    expect(rounded.grossTotal).toBe(116_000); // 115500 → bulat ke ribuan
  });
});

describe("applyRoundingMode", () => {
  it.each([
    ["none", 115_540, 115_540],
    ["nearest_100", 115_540, 115_500],
    ["nearest_500", 115_540, 115_500],
    ["nearest_1000", 115_540, 116_000],
  ])("%s membulatkan %i → %i", (mode, input, expected) => {
    expect(applyRoundingMode(input as number, mode as string)).toBe(expected);
  });
});

describe("qrPromoDiscount (promo otomatis order QR dari Pengaturan)", () => {
  it("default 10% maks Rp25.000 (sama dengan perilaku lama)", () => {
    expect(qrPromoDiscount(100_000, DEFAULT_APP_SETTINGS)).toBe(10_000);
    expect(qrPromoDiscount(400_000, DEFAULT_APP_SETTINGS)).toBe(25_000);
  });
  it("0% = tanpa promo", () => {
    expect(qrPromoDiscount(100_000, { qrPromoPct: 0, qrPromoMaxAmount: 25_000 })).toBe(0);
  });
  it("persen & batas bisa diatur owner", () => {
    expect(qrPromoDiscount(100_000, { qrPromoPct: 5, qrPromoMaxAmount: 3_000 })).toBe(3_000);
  });
});

describe("capVoucherDiscountBySettings", () => {
  it("voucher tidak melebihi cap (50% subtotal)", () => {
    // subtotal 100000, cap 50000; minta diskon 80000 → dibatasi 50000
    expect(capVoucherDiscountBySettings(80_000, 100_000, settings)).toBe(50_000);
  });
  it("voucher di bawah cap lolos apa adanya", () => {
    expect(capVoucherDiscountBySettings(20_000, 100_000, settings)).toBe(20_000);
  });
  it("diskon negatif dijepit ke 0", () => {
    expect(capVoucherDiscountBySettings(-5_000, 100_000, settings)).toBe(0);
  });
});

describe("computeManualDiscountAmount", () => {
  it("percent: 10% dari 100000 = 10000", () => {
    expect(
      computeManualDiscountAmount({ type: "percent", rawValue: 10, amount: 10_000 }, 100_000),
    ).toBe(10_000);
  });
  it("amount: nominal langsung", () => {
    expect(
      computeManualDiscountAmount({ type: "amount", rawValue: 15_000, amount: 15_000 }, 100_000),
    ).toBe(15_000);
  });
  it("diskon tidak boleh melebihi base", () => {
    expect(
      computeManualDiscountAmount({ type: "amount", rawValue: 999_999, amount: 100_000 }, 100_000),
    ).toBe(100_000);
  });
  it("tolak kalau amount klien tak sesuai hitungan server (anti-manipulasi)", () => {
    expect(() =>
      computeManualDiscountAmount({ type: "percent", rawValue: 10, amount: 50_000 }, 100_000),
    ).toThrow();
  });
});

describe("manualDiscountNeedsApproval", () => {
  it("di bawah ambang (10%) tidak butuh approval", () => {
    expect(manualDiscountNeedsApproval(5_000, 100_000, settings)).toBe(false);
  });
  it("di atas ambang butuh approval", () => {
    expect(manualDiscountNeedsApproval(20_000, 100_000, settings)).toBe(true);
  });
  it("base 0 → butuh approval (cegah bagi nol)", () => {
    expect(manualDiscountNeedsApproval(5_000, 0, settings)).toBe(true);
  });
  it("amount 0 → tidak butuh approval", () => {
    expect(manualDiscountNeedsApproval(0, 100_000, settings)).toBe(false);
  });
});

describe("orderTypeToChannel", () => {
  it.each([
    ["dine-in", "Dine in"],
    ["takeaway", "Take away"],
    ["delivery", "Delivery"],
  ] as const)("%s → %s", (type, channel) => {
    expect(orderTypeToChannel(type)).toBe(channel);
  });
});

describe("kitchenTargetGroupForCategory (routing tiket)", () => {
  it("Coffee & Non-Coffee → bar (drink)", () => {
    expect(kitchenTargetGroupForCategory("Coffee")).toBe("drink");
    expect(kitchenTargetGroupForCategory("Non-Coffee")).toBe("drink");
  });
  it("Makanan & Cemilan → dapur (food)", () => {
    expect(kitchenTargetGroupForCategory("Makanan")).toBe("food");
    expect(kitchenTargetGroupForCategory("Cemilan")).toBe("food");
  });
});

describe("computeRefundSplit", () => {
  const order = { subtotal: 100_000, service: 5_000, tax: 10_500, discount: 0, total: 115_500 };

  it("memotong service & pajak proporsional", () => {
    const split = computeRefundSplit(order, 25_000);
    expect(split.next.subtotal).toBe(75_000);
    expect(split.next.service).toBe(3_750);
    expect(split.next.tax).toBe(7_875);
    expect(split.refundAmount).toBe(28_875);
    expect(split.next.total + split.refundAmount).toBe(order.total);
  });

  it("refund seluruh subtotal mengembalikan total penuh", () => {
    const split = computeRefundSplit(order, 100_000);
    expect(split.refundAmount).toBe(order.total);
    expect(split.next.total).toBe(0);
  });

  it("menolak refund melebihi subtotal atau nol", () => {
    expect(() => computeRefundSplit(order, 100_001)).toThrow();
    expect(() => computeRefundSplit(order, 0)).toThrow();
  });
});

describe("paket event berharga final", () => {
  it("service & PB1 hanya dari menu reguler; paket ditambahkan utuh", () => {
    const result = calculateOrderBilling({ regularSubtotal: 100_000, packageSubtotal: 45_000 }, settings);
    expect(result).toMatchObject({ service: 5_000, tax: 10_500, regularGrossTotal: 115_500, grossTotal: 160_500 });
  });

  it("order paket saja = harga paket persis", () => {
    expect(calculateOrderBilling({ regularSubtotal: 0, packageSubtotal: 50_000 }, settings)).toMatchObject({ service: 0, tax: 0, grossTotal: 50_000 });
  });

  it("refund paket mengembalikan harga paket utuh, service/pajak hanya ikut proporsi reguler", () => {
    const order = { subtotal: 145_000, service: 5_000, tax: 10_500, discount: 0, total: 160_500 };
    const split = computeRefundSplit(order, 45_000, { orderPackageSubtotal: 45_000, refundPackageSubtotal: 45_000 });
    expect(split.refundAmount).toBe(45_000);
    expect(split.next).toMatchObject({ subtotal: 100_000, service: 5_000, tax: 10_500, total: 115_500 });
  });

  it("refund menu reguler pada order berpaket tidak menyentuh nilai paket", () => {
    const order = { subtotal: 145_000, service: 5_000, tax: 10_500, discount: 0, total: 160_500 };
    const split = computeRefundSplit(order, 100_000, { orderPackageSubtotal: 45_000, refundPackageSubtotal: 0 });
    expect(split.refundAmount).toBe(115_500);
    expect(split.next).toMatchObject({ subtotal: 45_000, service: 0, tax: 0, total: 45_000 });
  });
});
