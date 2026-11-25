// Tagihan Belum Bayar (owner, Nov 2026): logika murni pengelompokan Cash pending vs
// QRIS/Transfer/E-Wallet pending, prioritas, dan satu aksi utama per tagihan.
// Hanya menampilkan TAGIHAN pelanggan — tidak pernah kas laci/omzet (blind count tetap).
import type { CustomerOrder } from "@/lib/garage-api-types";
import { paymentStatusOf } from "@/lib/payment-status";

export type PendingLane = "cash" | "digital";
export type PendingFilter = "all" | PendingLane | "overdue";
export type PendingAge = "fresh" | "warn" | "late" | "stale";

/** Batas umur tagihan (menit). */
export const PENDING_WARN_MINUTES = 30;
export const PENDING_LATE_MINUTES = 60;

export type PendingMethodLabel = "Tunai" | "QRIS" | "Transfer" | "E-Wallet" | "Belum dipilih";

export type PendingNextAction =
  | { kind: "collect_cash"; label: string; hint: string }
  | { kind: "waiter_holds_cash"; label: string; hint: string }
  | { kind: "verify_digital"; label: string; hint: string }
  | { kind: "verify_proof"; label: string; hint: string }
  | { kind: "accept_first"; label: string; hint: string };

export type PendingBill = {
  order: CustomerOrder;
  lane: PendingLane;
  method: PendingMethodLabel;
  ageMinutes: number;
  age: PendingAge;
  overdue: boolean;
  /** Uang tunai sudah dipegang waiter tetapi belum diserahkan ke kasir. */
  cashWithWaiter: boolean;
  itemCount: number;
  itemsSummary: string;
  next: PendingNextAction;
  priority: number;
};

export function isPendingBill(order: CustomerOrder) {
  return paymentStatusOf(order) === "pending" && ["pending_cashier", "awaiting_payment", "accepted"].includes(order.status);
}

export function methodLabelOf(order: Pick<CustomerOrder, "paymentMethod" | "staffOrder">): PendingMethodLabel {
  const method = (order.paymentMethod ?? "").trim();
  // "Bayar nanti" kasir menyimpan "Cash" sebagai placeholder (kolom wajib): metode sebenarnya belum dipilih.
  if (order.staffOrder) {
    if (!method || method === "Cash") return "Belum dipilih";
  }
  if (method === "QRIS") return "QRIS";
  if (method === "Bank Transfer" || method === "Transfer") return "Transfer";
  if (method === "E-Wallet") return "E-Wallet";
  return "Tunai";
}

export function laneOf(method: PendingMethodLabel): PendingLane {
  return method === "QRIS" || method === "Transfer" || method === "E-Wallet" ? "digital" : "cash";
}

function startOfJakartaDay(ms: number) {
  const offset = 7 * 60 * 60_000;
  return Math.floor((ms + offset) / 86_400_000) * 86_400_000 - offset;
}

export function ageOf(createdAt: string, now: number): { minutes: number; age: PendingAge } {
  const created = new Date(createdAt).getTime();
  const minutes = Number.isFinite(created) ? Math.max(0, Math.floor((now - created) / 60_000)) : 0;
  if (Number.isFinite(created) && created < startOfJakartaDay(now)) return { minutes, age: "stale" };
  if (minutes >= PENDING_LATE_MINUTES) return { minutes, age: "late" };
  if (minutes >= PENDING_WARN_MINUTES) return { minutes, age: "warn" };
  return { minutes, age: "fresh" };
}

export function formatAge(minutes: number) {
  if (minutes < 1) return "baru";
  if (minutes < 60) return `${minutes} mnt`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} j ${minutes % 60} mnt`;
  return `${Math.floor(hours / 24)} hari`;
}

export function itemsSummaryOf(order: Pick<CustomerOrder, "items">) {
  const count = order.items.reduce((sum, item) => sum + item.qty, 0);
  const names = order.items.map((item) => `${item.qty}× ${item.itemName}${item.variantLabel && item.variantLabel !== "Regular" ? ` ${item.variantLabel}` : ""}`);
  return { count, summary: names.join(", ") };
}

export function nextActionFor(order: CustomerOrder, lane: PendingLane, cashWithWaiter: boolean): PendingNextAction {
  if (order.status === "pending_cashier" || order.status === "awaiting_payment") {
    if (lane === "digital" && order.paymentProofUrl) {
      return { kind: "verify_proof", label: "Cek bukti bayar", hint: "Pelanggan mengirim bukti. Cocokkan dengan notifikasi merchant/bank sebelum lunas." };
    }
    if (order.status === "pending_cashier") {
      return { kind: "accept_first", label: "Terima pesanan", hint: "Pesanan belum diterima kasir. Terima dulu, lalu tagih." };
    }
  }
  if (lane === "digital" && order.qrisNeedsMutationCheck) {
    // Penjualan QRIS statis saat POS offline (Fase 4): uang belum tentu masuk — lunasi hanya setelah mutasi dicek.
    return {
      kind: "verify_digital",
      label: "Cek mutasi QRIS offline",
      hint: `Dibayar QRIS statis saat POS offline${order.offlineNo ? ` (${order.offlineNo})` : ""}. Lunasi hanya bila dana sudah masuk di mutasi QRIS.`,
    };
  }
  if (lane === "digital") {
    return { kind: "verify_digital", label: "Cek mutasi & lunasi", hint: "Cek notifikasi QRIS/bank: nominal sama dengan total, referensi belum dipakai." };
  }
  if (cashWithWaiter) {
    return { kind: "waiter_holds_cash", label: "Terima uang dari waiter", hint: "Uang sudah di waiter. Hitung saat diserahkan, lalu lunasi." };
  }
  return { kind: "collect_cash", label: "Ambil uang", hint: "Tagih ke pelanggan, hitung uang, isi nominal diterima." };
}

/** Skor prioritas (lebih besar = lebih dulu): umur, bukti bayar menunggu, uang di waiter, nominal. */
export function pendingPriority(bill: Pick<PendingBill, "age" | "ageMinutes" | "cashWithWaiter" | "next"> & { total: number }) {
  const ageScore = bill.age === "stale" ? 4000 : bill.age === "late" ? 3000 : bill.age === "warn" ? 2000 : 0;
  const actionScore = bill.next.kind === "verify_proof" ? 600 : bill.cashWithWaiter ? 500 : bill.next.kind === "accept_first" ? 300 : 0;
  return ageScore + actionScore + Math.min(bill.ageMinutes, 999) + Math.min(bill.total / 100_000, 99) / 100;
}

export function classifyPendingBill(order: CustomerOrder, now: number): PendingBill {
  const method = methodLabelOf(order);
  const lane = laneOf(method);
  const { minutes, age } = ageOf(order.createdAt, now);
  const cashWithWaiter = lane === "cash" && (order.cashReceived ?? 0) > 0;
  const { count, summary } = itemsSummaryOf(order);
  const next = nextActionFor(order, lane, cashWithWaiter);
  const bill = {
    order,
    lane,
    method,
    ageMinutes: minutes,
    age,
    overdue: age !== "fresh",
    cashWithWaiter,
    itemCount: count,
    itemsSummary: summary,
    next,
    priority: 0,
  };
  bill.priority = pendingPriority({ ...bill, total: order.total });
  return bill;
}

export type PendingBillsView = {
  bills: PendingBill[];
  counts: Record<PendingFilter, number>;
  totals: Record<PendingLane, number>;
};

export function pendingBillsView(orders: CustomerOrder[], now: number, filter: PendingFilter = "all", query = ""): PendingBillsView {
  const all = orders.filter(isPendingBill).map((order) => classifyPendingBill(order, now));
  const counts: Record<PendingFilter, number> = {
    all: all.length,
    cash: all.filter((bill) => bill.lane === "cash").length,
    digital: all.filter((bill) => bill.lane === "digital").length,
    overdue: all.filter((bill) => bill.overdue).length,
  };
  const totals: Record<PendingLane, number> = {
    cash: all.filter((bill) => bill.lane === "cash").reduce((sum, bill) => sum + bill.order.total, 0),
    digital: all.filter((bill) => bill.lane === "digital").reduce((sum, bill) => sum + bill.order.total, 0),
  };
  const q = query.trim().toLowerCase();
  const bills = all
    .filter((bill) => (filter === "all" ? true : filter === "overdue" ? bill.overdue : bill.lane === filter))
    .filter((bill) =>
      !q
        ? true
        : [bill.order.orderNo, bill.order.tableLabel, bill.order.customerName ?? "", bill.order.customerPhone ?? "", bill.itemsSummary]
            .join(" ")
            .toLowerCase()
            .includes(q),
    )
    .sort((a, b) => b.priority - a.priority);
  return { bills, counts, totals };
}

/** Tagihan yang baru melewati batas peringatan (untuk bunyi pengingat sekali per tagihan). */
export function newlyOverdueIds(bills: PendingBill[], alreadyAlerted: ReadonlySet<string>) {
  return bills.filter((bill) => bill.overdue && !alreadyAlerted.has(bill.order.id)).map((bill) => bill.order.id);
}
