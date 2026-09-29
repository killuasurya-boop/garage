import type { AppSettings } from "@/lib/garage-app-settings-types";

// =============================================================================
// Logika tagihan POS murni (tanpa DB) — diekstrak dari garage-service agar bisa
// diuji unit & dipakai ulang. Ini inti kebenaran transaksi kasir:
// service charge, PB1/pajak, pembulatan, cap voucher, diskon manual, routing
// tiket dapur/bar, dan channel order.
// =============================================================================

export type OrderType = "dine-in" | "takeaway" | "delivery";
export type KitchenTargetGroup = "drink" | "food";

export type ManualDiscountInput = {
  type: "amount" | "percent";
  rawValue: number;
  amount: number;
  // Field opsional dari OrderInput.manualDiscount (tidak dipakai perhitungan,
  // tapi diizinkan agar object literal call site tetap valid).
  approvalId?: string;
  reason?: string;
};

export const kitchenTargetMinutes: Record<KitchenTargetGroup, number> = {
  drink: 5,
  food: 15,
};

export function applyRoundingMode(amount: number, mode: string): number {
  switch (mode) {
    case "nearest_100":
      return Math.round(amount / 100) * 100;
    case "nearest_500":
      return Math.round(amount / 500) * 500;
    case "nearest_1000":
      return Math.round(amount / 1000) * 1000;
    case "none":
    default:
      return amount;
  }
}

export function calculateBillingTotals(subtotal: number, settings: AppSettings) {
  const service = Math.round(subtotal * (settings.serviceChargePct / 100));
  const tax = Math.round((subtotal + service) * (settings.taxPct / 100));
  const grossTotal = applyRoundingMode(subtotal + service + tax, settings.roundingMode);
  return { service, tax, grossTotal };
}

/** Promo otomatis order QR/online dari Pengaturan (qrPromoPct, maks qrPromoMaxAmount). */
export function qrPromoDiscount(
  subtotal: number,
  settings: Pick<AppSettings, "qrPromoPct" | "qrPromoMaxAmount">,
) {
  const pct = Math.max(0, Number(settings.qrPromoPct) || 0);
  if (pct <= 0 || subtotal <= 0) return 0;
  const cap = Math.max(0, Number(settings.qrPromoMaxAmount) || 0);
  return Math.min(cap, Math.round(subtotal * (pct / 100)));
}

export function capVoucherDiscountBySettings(
  discount: number,
  subtotal: number,
  settings: AppSettings,
) {
  const cap = Math.round(subtotal * (settings.voucherMaxDiscountPct / 100));
  return Math.max(0, Math.min(discount, cap));
}

export function computeManualDiscountAmount(
  input: ManualDiscountInput,
  baseAfterVoucher: number,
) {
  const base = Math.max(0, baseAfterVoucher);
  const computed =
    input.type === "percent"
      ? Math.min(base, Math.round((base * input.rawValue) / 100))
      : Math.min(base, Math.round(input.rawValue));
  if (Math.abs(computed - input.amount) > 1) {
    throw new Error("Nilai diskon manual tidak sesuai perhitungan server.");
  }
  return computed;
}

export function manualDiscountNeedsApproval(
  amount: number,
  baseAfterVoucher: number,
  settings: AppSettings,
) {
  if (amount <= 0) return false;
  const base = Math.max(0, baseAfterVoucher);
  if (base <= 0) return true;
  const pct = (amount / base) * 100;
  return pct > settings.manualDiscountApprovalPct;
}

/**
 * Refund sebagian item: service, pajak, dan diskon ikut dipotong proporsional
 * terhadap subtotal item yang dikembalikan. Total baru = total lama − refund,
 * jadi pembulatan bill asli tetap konsisten dengan uang yang dikembalikan.
 */
export function computeRefundSplit(
  order: { subtotal: number; service: number; tax: number; discount: number; total: number },
  refundSubtotal: number,
) {
  if (order.subtotal <= 0 || refundSubtotal <= 0) {
    throw new Error("Tidak ada nilai item yang bisa direfund.");
  }
  if (refundSubtotal > order.subtotal) {
    throw new Error("Nilai refund melebihi subtotal order.");
  }
  const keepRatio = (order.subtotal - refundSubtotal) / order.subtotal;
  const nextSubtotal = order.subtotal - refundSubtotal;
  const nextService = Math.round(order.service * keepRatio);
  const nextTax = Math.round(order.tax * keepRatio);
  const nextDiscount = Math.round(order.discount * keepRatio);
  const nextTotal = Math.max(0, Math.round(order.total * keepRatio));
  return {
    refundAmount: order.total - nextTotal,
    next: {
      subtotal: nextSubtotal,
      service: nextService,
      tax: nextTax,
      discount: nextDiscount,
      total: nextTotal,
    },
  };
}

export function orderTypeToChannel(orderType: OrderType) {
  if (orderType === "takeaway") return "Take away";
  if (orderType === "delivery") return "Delivery";
  return "Dine in";
}

export function kitchenTargetGroupForCategory(category: string): KitchenTargetGroup {
  return category === "Coffee" || category === "Non-Coffee" ? "drink" : "food";
}
