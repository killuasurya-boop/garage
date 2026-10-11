// =============================================================================
// Aturan murni Take away / Delivery (tanpa DB) — dipakai server & UI.
// - Status antar: preparing → picked_up → on_the_way → delivered.
// - Langkah pelacak pelanggan per tipe pesanan (Makan di tempat / Take away /
//   Delivery) dengan label station: Dapur = "Dimasak", Bar = "Diracik".
// =============================================================================

export const DELIVERY_STATUSES = ["preparing", "picked_up", "on_the_way", "delivered"] as const;
export type DeliveryStatus = (typeof DELIVERY_STATUSES)[number];

export const DELIVERY_STATUS_LABEL: Record<DeliveryStatus, string> = {
  preparing: "Disiapkan",
  picked_up: "Diambil kurir",
  on_the_way: "Dalam pengantaran",
  delivered: "Sudah sampai",
};

/** Kolom yang berubah saat status antar diganti. GPS kurir dihapus saat selesai (privasi). */
export function deliveryStatusPatch(next: DeliveryStatus, now: Date) {
  if (next === "delivered") {
    return {
      deliveryStatus: next,
      deliveredAt: now,
      courierLat: null,
      courierLng: null,
      courierLocationAt: null,
      updatedAt: now,
    };
  }
  return { deliveryStatus: next, deliveredAt: null, updatedAt: now };
}

/** GPS kurir hanya diterima saat pesanan sedang dibawa kurir. */
export function acceptsCourierLocation(status: string | null | undefined) {
  return status === "picked_up" || status === "on_the_way";
}

export type OrderFulfillment = "dine-in" | "takeaway" | "delivery";

export function normalizeFulfillment(value: string | null | undefined): OrderFulfillment {
  return value === "takeaway" || value === "delivery" ? value : "dine-in";
}

export const FULFILLMENT_LABEL: Record<OrderFulfillment, string> = {
  "dine-in": "Makan di tempat",
  takeaway: "Take away",
  delivery: "Delivery",
};

/** "Dimasak" (Dapur), "Diracik" (Bar), atau gabungan bila pesanan berisi keduanya. */
export function productionVerb(stations: Array<{ station: string }>) {
  const hasBar = stations.some((entry) => entry.station === "Bar");
  const hasFood = stations.some((entry) => entry.station !== "Bar");
  if (hasBar && hasFood) return "Dimasak & diracik";
  if (hasBar) return "Diracik";
  return "Dimasak";
}

export function stationVerb(station: string) {
  return station === "Bar" ? "Diracik" : "Dimasak";
}

export type TrackerStepKey = "received" | "production" | "ready" | "packing" | "pickup" | "on_the_way" | "arrived" | "served";

export type TrackerStep = {
  key: TrackerStepKey;
  label: string;
  hint: string;
  state: "done" | "current" | "todo";
};

export type TrackerInput = {
  fulfillment: string | null | undefined;
  orderStatus: string;
  stations: Array<{ station: string; status: string }>;
  deliveryStatus?: string | null;
};

/**
 * Langkah pelacak per tipe pesanan:
 * - Makan di tempat: Diterima → Dimasak/Diracik → Siap → Diantar ke meja
 * - Take away:       Pembayaran diterima → Dimasak/Diracik → Dipacking → Siap diambil
 * - Delivery:        Pembayaran diterima → Dimasak/Diracik → Dipacking → Diantar kurir → Sampai
 * "Dipacking" = semua station siap tapi belum diserahkan; tiket "delivered"
 * (serah-terima helper) = siap diambil / siap dibawa kurir.
 */
export function buildTrackerSteps(input: TrackerInput): TrackerStep[] {
  const type = normalizeFulfillment(input.fulfillment);
  const verb = productionVerb(input.stations);
  const live = input.stations.filter((entry) => !["rejected", "canceled", "cancelled"].includes(entry.status));
  const waitingCashier = ["pending_cashier", "awaiting_payment"].includes(input.orderStatus);
  const allReady = live.length > 0 && live.every((entry) => entry.status === "ready" || entry.status === "delivered");
  const allHanded = live.length > 0 && live.every((entry) => entry.status === "delivered");
  const delivery = input.deliveryStatus ?? null;

  const receivedLabel = type === "dine-in" ? "Diterima" : "Pembayaran diterima";
  const receivedHint = type === "dine-in" ? "Kasir mengonfirmasi pesanan" : "Pembayaran sudah dicek kasir";

  let defs: Array<Omit<TrackerStep, "state">>;
  let reached: number;
  if (type === "dine-in") {
    defs = [
      { key: "received", label: receivedLabel, hint: receivedHint },
      { key: "production", label: verb, hint: "Tim Bar/Dapur sedang membuat" },
      { key: "ready", label: "Siap", hint: "Pesanan siap diantar" },
      { key: "served", label: "Diantar ke meja", hint: "Selamat menikmati" },
    ];
    reached = waitingCashier ? -1 : allHanded || input.orderStatus === "completed" ? 3 : allReady ? 2 : live.length ? 1 : 0;
  } else if (type === "takeaway") {
    defs = [
      { key: "received", label: receivedLabel, hint: receivedHint },
      { key: "production", label: verb, hint: "Tim Bar/Dapur sedang membuat" },
      { key: "packing", label: "Dipacking", hint: "Pesanan dikemas" },
      { key: "pickup", label: "Siap diambil", hint: "Ambil di kasir, sebut nomor pesanan" },
    ];
    reached = waitingCashier ? -1 : allHanded || input.orderStatus === "completed" ? 3 : allReady ? 2 : live.length ? 1 : 0;
  } else {
    defs = [
      { key: "received", label: receivedLabel, hint: receivedHint },
      { key: "production", label: verb, hint: "Tim Bar/Dapur sedang membuat" },
      { key: "packing", label: "Dipacking", hint: "Pesanan dikemas untuk kurir" },
      { key: "on_the_way", label: "Diantar kurir", hint: "Kurir menuju alamat Anda" },
      { key: "arrived", label: "Sampai", hint: "Pesanan sudah diterima" },
    ];
    reached = waitingCashier
      ? -1
      : delivery === "delivered"
        ? 4
        : delivery === "on_the_way" || delivery === "picked_up"
          ? 3
          : allReady
            ? 2
            : live.length
              ? 1
              : 0;
  }
  const lastIndex = defs.length - 1;
  return defs.map((step, index) => ({
    ...step,
    state: index < reached || (index === reached && index === lastIndex) ? "done" : index === reached ? "current" : "todo",
  }));
}

/** Jarak garis lurus (km) dua titik GPS — cukup untuk "kurir ± 1,2 km lagi". */
export function distanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function validLatLng(lat: unknown, lng: unknown): { lat: number; lng: number } | null {
  if (typeof lat !== "number" || typeof lng !== "number") return null;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return { lat: Math.round(lat * 1e6) / 1e6, lng: Math.round(lng * 1e6) / 1e6 };
}

// -----------------------------------------------------------------------------
// Ongkir per km (owner, Okt 2026): ongkir dasar untuk N km pertama + tarif per
// km berikutnya (dibulatkan ke atas), maksimal radius. Jarak = garis lurus dari
// titik Garage ke lokasi yang dibagikan pelanggan. Tanpa lokasi pelanggan (atau
// titik Garage belum diisi) → ongkir dasar (flat).
// -----------------------------------------------------------------------------
export type DeliveryTariff = {
  baseFee: number;
  baseKm: number;
  perKmFee: number;
  /** 0 = tanpa batas radius. */
  maxKm: number;
};

export type DeliveryQuote =
  | { ok: true; fee: number; distanceKm: number | null; flat: boolean }
  | { ok: false; reason: string; distanceKm: number };

export function deliveryQuote(
  tariff: DeliveryTariff,
  origin: { lat: number; lng: number } | null,
  destination: { lat: number; lng: number } | null,
): DeliveryQuote {
  const baseFee = Math.max(0, Math.round(tariff.baseFee));
  if (!origin || !destination) return { ok: true, fee: baseFee, distanceKm: null, flat: true };
  const km = Math.round(distanceKm(origin, destination) * 10) / 10;
  if (tariff.maxKm > 0 && km > tariff.maxKm) {
    return {
      ok: false,
      distanceKm: km,
      reason: `Lokasi ± ${km.toLocaleString("id-ID")} km dari Garage, di luar jangkauan delivery (maks ${tariff.maxKm} km).`,
    };
  }
  const extraKm = Math.max(0, Math.ceil(km - Math.max(0, tariff.baseKm)));
  return { ok: true, fee: baseFee + extraKm * Math.max(0, Math.round(tariff.perKmFee)), distanceKm: km, flat: false };
}

/** Order take away/delivery belum lunas & sudah lewat batas → tolak otomatis. */
export function isUnpaidOrderExpired(
  order: { fulfillment: string | null; status: string; createdAt: Date | string },
  limitMinutes: number,
  now: Date = new Date(),
) {
  if (!limitMinutes || limitMinutes <= 0) return false;
  if (order.fulfillment !== "takeaway" && order.fulfillment !== "delivery") return false;
  if (order.status !== "pending_cashier" && order.status !== "awaiting_payment") return false;
  return now.getTime() - new Date(order.createdAt).getTime() >= limitMinutes * 60_000;
}

export const AUTO_REJECT_REASON = (minutes: number) => `Tidak dibayar dalam ${minutes} menit`;
