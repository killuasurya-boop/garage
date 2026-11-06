// =============================================================================
// Invoice Digital V4 (Customer Experience Engine, Nov 2026) — aturan tampilan
// MURNI (tanpa DB, aman diimpor client). Halaman: src/app/invoice/[token].
//
// - Status pembayaran memakai `paymentStatusOf` (satu sumber dengan struk/POS);
//   tidak ada "Lunas" tanpa catatan pembayaran sah. Tombol "Saya sudah bayar"
//   hanya membuka bantuan kirim bukti — status berubah setelah kasir verifikasi.
// - Alur 5 langkah (Diterima → Diverifikasi → Diproses → Siap → Selesai) dihitung
//   dari status order/tiket yang sama dengan pelacak lama (getInvoiceLiveStatus).
// =============================================================================

import { paymentStatusOf } from "@/lib/payment-status";

export type InvoicePaymentState = "paid" | "pending" | "awaiting_confirmation" | "failed" | "cancelled" | "refund";

export const INVOICE_PAYMENT_LABEL: Record<InvoicePaymentState, string> = {
  paid: "Lunas",
  pending: "Belum Dibayar",
  awaiting_confirmation: "Menunggu Konfirmasi",
  failed: "Gagal",
  cancelled: "Dibatalkan",
  refund: "Refund",
};

const NON_CASH_METHODS = /qris|transfer|e-?wallet|gopay|ovo|dana|shopee|linkaja|bank/i;

/**
 * Status pembayaran untuk pelanggan. `paid` hanya bila order lunas atau baris
 * pembayaran tercatat paid/captured, atau invoice resmi terbit (perilaku lama
 * halaman invoice dipertahankan). Non-tunai yang belum dicek kasir = menunggu
 * konfirmasi, bukan lunas.
 */
export function invoicePaymentState(input: {
  orderStatus: string;
  paymentStatus?: string | null;
  paymentMethod?: string | null;
  invoiceStatus?: string | null;
}): InvoicePaymentState {
  const paymentStatus = (input.paymentStatus ?? "").toLowerCase() || null;
  const base = paymentStatusOf({ status: input.orderStatus }, paymentStatus);
  if (base === "refund") return "refund";
  if (base === "cancelled") return paymentStatus === "failed" && !isCancelledOrder(input.orderStatus) ? "failed" : "cancelled";
  if (base === "paid") return "paid";
  if (paymentStatus === "paid" || paymentStatus === "captured") return "paid";
  if ((input.invoiceStatus ?? "").toLowerCase() === "issued") return "paid";
  if (paymentStatus === "pending" && input.paymentMethod && NON_CASH_METHODS.test(input.paymentMethod)) {
    return "awaiting_confirmation";
  }
  return "pending";
}

function isCancelledOrder(status: string) {
  return ["voided", "rejected", "cancelled", "failed", "void"].includes(status.toLowerCase());
}

/** Panel QRIS & "kirim bukti bayar" hanya untuk tagihan yang masih terbuka. */
export function invoiceNeedsPayment(state: InvoicePaymentState) {
  return state === "pending" || state === "awaiting_confirmation" || state === "failed";
}

export type FlowStepState = "done" | "current" | "todo";
export type FlowStep = { key: string; label: string; state: FlowStepState; at: string | null };
export type FulfillmentKind = "dine-in" | "takeaway" | "delivery";

export type InvoiceFlowInput = {
  /** Langkah lama 0..5 (received, cashier, kitchen, cooking, ready, delivered); -1 = ditolak. */
  activeStep: number;
  fulfillment?: FulfillmentKind | null;
  deliveryStatus?: string | null;
  timestamps?: {
    orderCreated?: string | null;
    orderAccepted?: string | null;
    cookingStarted?: string | null;
    ready?: string | null;
    delivered?: string | null;
  } | null;
};

/** Alur 5 langkah V4. Ditolak → [] (UI menampilkan kartu penolakan). */
export function invoiceFlowSteps(input: InvoiceFlowInput): FlowStep[] {
  if (input.activeStep < 0) return [];
  const kind = input.fulfillment ?? "dine-in";
  const ts = input.timestamps ?? {};
  const readyLabel = kind === "takeaway" ? "Siap Diambil" : kind === "delivery" ? "Diantar Kurir" : "Siap Diantar";
  // legacy 0 → 0, 1 → 1, 2/3 → 2, 4 → 3, 5 → 4
  let current = input.activeStep <= 1 ? input.activeStep : input.activeStep <= 3 ? 2 : input.activeStep === 4 ? 3 : 4;
  const deliveryDone = kind === "delivery" ? input.deliveryStatus === "delivered" : true;
  if (kind === "delivery" && current === 4 && !deliveryDone) current = 3;
  const finished = current >= 4 && deliveryDone;
  const defs: Array<{ key: string; label: string; at: string | null }> = [
    { key: "received", label: "Diterima", at: ts.orderCreated ?? null },
    { key: "verified", label: "Diverifikasi", at: ts.orderAccepted ?? null },
    { key: "processing", label: "Diproses", at: ts.cookingStarted ?? null },
    { key: "ready", label: readyLabel, at: ts.ready ?? null },
    { key: "done", label: "Selesai", at: finished ? ts.delivered ?? null : null },
  ];
  return defs.map((def, index) => ({
    ...def,
    state: finished || index < current ? "done" : index === current ? "current" : "todo",
    at: finished || index <= current ? def.at : null,
  }));
}

export type StationCard = {
  key: string;
  label: string;
  status: string;
  tone: "done" | "active" | "waiting";
  at: string | null;
};

const STATION_LABEL: Record<string, string> = { bar: "Bar", barista: "Bar", kitchen: "Dapur", dapur: "Dapur" };

/** Kartu Bar / Dapur / Waiter (atau Kasir / Kurir) dari tiket produksi nyata. */
export function invoiceStationCards(input: {
  stations: Array<{ station: string; status: string; readyAt?: string | null; deliveredAt?: string | null; acceptedAt?: string | null }>;
  kitchenStatus: string;
  fulfillment?: FulfillmentKind | null;
  deliveryStatus?: string | null;
  deliveredAt?: string | null;
}): StationCard[] {
  const cards: StationCard[] = [];
  const seen = new Map<string, StationCard>();
  for (const station of input.stations) {
    const label = STATION_LABEL[station.station.toLowerCase()] ?? station.station;
    const tone: StationCard["tone"] = ["ready", "delivered", "completed"].includes(station.status)
      ? "done"
      : station.status === "cooking"
        ? "active"
        : "waiting";
    const card: StationCard = {
      key: label.toLowerCase(),
      label,
      status: tone === "done" ? "Selesai" : tone === "active" ? "Sedang Dibuat" : "Antri",
      tone,
      at: tone === "done" ? station.readyAt ?? station.deliveredAt ?? null : null,
    };
    const existing = seen.get(card.key);
    // Beberapa tiket di stasiun yang sama: tampilkan yang paling belum selesai.
    if (!existing || rank(card.tone) < rank(existing.tone)) seen.set(card.key, card);
  }
  cards.push(...seen.values());

  const kind = input.fulfillment ?? "dine-in";
  const handed = ["delivered", "completed"].includes(input.kitchenStatus);
  const ready = input.kitchenStatus === "ready";
  if (kind === "delivery") {
    const arrived = input.deliveryStatus === "delivered";
    cards.push({
      key: "courier",
      label: "Kurir",
      status: arrived ? "Sudah Sampai" : handed ? "Dalam Pengantaran" : "Menunggu",
      tone: arrived ? "done" : handed ? "active" : "waiting",
      at: arrived ? input.deliveredAt ?? null : null,
    });
  } else if (kind === "takeaway") {
    cards.push({
      key: "pickup",
      label: "Kasir",
      status: handed ? "Sudah Diambil" : ready ? "Siap Diambil" : "Menunggu",
      tone: handed ? "done" : ready ? "active" : "waiting",
      at: handed ? input.deliveredAt ?? null : null,
    });
  } else {
    cards.push({
      key: "waiter",
      label: "Waiter",
      status: handed ? "Diantar" : ready ? "Dalam Pengantaran" : "Menunggu",
      tone: handed ? "done" : ready ? "active" : "waiting",
      at: handed ? input.deliveredAt ?? null : null,
    });
  }
  return cards;
}

function rank(tone: StationCard["tone"]) {
  return tone === "waiting" ? 0 : tone === "active" ? 1 : 2;
}

/** "081234567890" → "0812•••••890". Invoice publik tidak menampilkan nomor penuh. */
export function maskPhone(phone: string | null | undefined): string | null {
  const digits = String(phone ?? "").replace(/\D/g, "");
  if (digits.length < 7) return null;
  return `${digits.slice(0, 4)}${"•".repeat(Math.max(3, digits.length - 7))}${digits.slice(-3)}`;
}

export function fulfillmentLabel(kind: FulfillmentKind | null | undefined, tableLabel?: string | null) {
  if (kind === "delivery") return "Delivery";
  if (kind === "takeaway") return "Take Away";
  return tableLabel ? `Dine In · ${tableLabel}` : "Dine In";
}
