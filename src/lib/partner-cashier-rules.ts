// =============================================================================
// Partner Hub — aturan MURNI untuk kasir (Owner 16 Nov 2026):
// 1. Alur kartu pesanan mitra di POS: satu tombol utama per status (Terima → Proses → Siap → Serahkan/Antar).
// 2. Rekap "Penjualan Mitra" per shift: per mitra & per produk — penjualan, modal mitra (wajib bayar), profit Garage.
// Server tetap memvalidasi setiap aksi; fungsi di sini hanya memilih tombol & menyusun angka dari data yang sudah ada.
// =============================================================================

import { parseTableNumber, tableNumberFromLabel } from "@/lib/garage-tables";
import { isPayableLineStatus, partnerLineFinance, wibDayKey, type PartnerLineAmounts } from "@/lib/partner-hub-rules";

// ─── 1. Alur kartu pesanan mitra ─────────────────────────────────────────────

export type PartnerDeskOrder = {
  status: string;
  tableLabel: string | null;
  /** orders.fulfillment: "dine-in" | "takeaway" | "delivery" | null (order POS lama). */
  fulfillment?: string | null;
  claimedByName: string | null;
  claimedById?: string | null;
  needsRefund?: boolean;
  paymentLabel: string;
};

export type PartnerDeskViewer = {
  userId: string;
  /** Owner/Manajer atau Kasir tanpa workstation produksi (`canHandleMoney`). */
  canHandleMoney: boolean;
  /** Owner/Manajer: boleh menyelesaikan tiket yang diklaim orang lain. */
  isManager: boolean;
};

/** Take away / delivery / ambil di kasir = diserahkan, BUKAN diantar ke meja. */
export function isPartnerPickupOrder(order: Pick<PartnerDeskOrder, "tableLabel" | "fulfillment">) {
  if (order.fulfillment === "takeaway" || order.fulfillment === "delivery") return true;
  if (order.fulfillment === "dine-in") return false;
  const label = order.tableLabel?.trim() ?? "";
  if (!label || /^(take|delivery|bawa|pickup|ambil)/i.test(label)) return true;
  return (tableNumberFromLabel(label) ?? parseTableNumber(label.replace(/^T-?/i, ""))) === null;
}

export type PartnerDeskActionKind = "accept" | "start" | "ready" | "reject" | "handover" | "claim" | "deliver" | "refund" | "cancel_item";

export type PartnerDeskAction = {
  kind: PartnerDeskActionKind;
  label: string;
  tone: "primary" | "success" | "danger" | "default";
  /** Aksi atas nama mitra (dicatat sebagai staf a.n. mitra). */
  onBehalf?: boolean;
};

export type PartnerDeskPlan = {
  /** Tombol utama (paling besar). Null = tidak ada yang bisa dilakukan penampil ini. */
  primary: PartnerDeskAction | null;
  secondary: PartnerDeskAction[];
  /** Satu kalimat "langkah berikutnya" untuk kasir. */
  hint: string | null;
};

/**
 * Tombol untuk satu kartu pesanan mitra. Urutan normal:
 * Menunggu mitra → (mitra / staf a.n. mitra) Terima → Mulai proses → Siap → Serahkan (take away) / Klaim & antar (meja).
 * Ditolak mitra & item masih di bill → Keluarkan dari bill (belum bayar) / Ajukan refund (lunas), hanya pemegang uang.
 */
export function partnerDeskPlan(order: PartnerDeskOrder, viewer: PartnerDeskViewer): PartnerDeskPlan {
  const pickup = isPartnerPickupOrder(order);
  const paid = order.paymentLabel === "Lunas";
  if (order.needsRefund) {
    if (!viewer.canHandleMoney) return { primary: null, secondary: [], hint: "Ditolak mitra — minta kasir menyelesaikan bill pelanggan." };
    return {
      primary: paid ? { kind: "refund", label: "Ajukan refund", tone: "danger" } : { kind: "cancel_item", label: "Keluarkan dari bill", tone: "danger" },
      secondary: [],
      hint: paid ? "Pelanggan sudah bayar — ajukan refund item ini." : "Bill belum dibayar — keluarkan item ini supaya pelanggan tidak ditagih.",
    };
  }
  switch (order.status) {
    case "queue":
      return {
        primary: null,
        secondary: [
          { kind: "accept", label: "Terima a.n. mitra", tone: "default", onBehalf: true },
          { kind: "reject", label: "Tolak", tone: "danger", onBehalf: true },
        ],
        hint: "Menunggu mitra menerima. Bila mitra tidak merespons, hubungi mitra atau terima atas namanya.",
      };
    case "accepted":
      return {
        primary: { kind: "start", label: "Mulai proses a.n. mitra", tone: "primary", onBehalf: true },
        secondary: [
          { kind: "ready", label: "Langsung siap", tone: "success", onBehalf: true },
          { kind: "reject", label: "Tolak", tone: "danger", onBehalf: true },
        ],
        hint: "Diterima mitra — menunggu mulai dibuat.",
      };
    case "cooking":
      return {
        primary: { kind: "ready", label: "Tandai siap a.n. mitra", tone: "success", onBehalf: true },
        secondary: [],
        hint: "Sedang dibuat mitra. Tekan Siap hanya bila barang sudah di titik serah-terima.",
      };
    case "ready": {
      const mine = Boolean(order.claimedById && order.claimedById === viewer.userId);
      const claimedByOther = Boolean(order.claimedByName) && !mine;
      if (claimedByOther && !viewer.isManager) {
        return { primary: null, secondary: [], hint: `${pickup ? "Sedang diserahkan" : "Sedang diantar"} oleh ${order.claimedByName}.` };
      }
      if (pickup && viewer.canHandleMoney) {
        return { primary: { kind: "handover", label: "Serahkan ke pelanggan", tone: "success" }, secondary: [], hint: "Siap — ambil di mitra, panggil pelanggan, lalu serahkan." };
      }
      // Waiter/helper tetap bisa membantu take away lewat klaim → diserahkan (perilaku lama).
      if (pickup && !order.claimedByName) {
        return { primary: { kind: "claim", label: "Klaim & ambil", tone: "primary" }, secondary: [], hint: "Siap — ambil di mitra lalu serahkan ke pelanggan (atau ke kasir)." };
      }
      if (!order.claimedByName) {
        return { primary: { kind: "claim", label: "Klaim & antar", tone: "primary" }, secondary: [], hint: "Siap — klaim, ambil di mitra, lalu antar ke meja." };
      }
      return {
        primary: { kind: "deliver", label: pickup ? "Sudah diserahkan" : "Sudah diantar", tone: "success" },
        secondary: [],
        hint: `${pickup ? "Sedang diserahkan" : "Sedang diantar"} ${order.claimedByName}.`,
      };
    }
    default:
      return { primary: null, secondary: [], hint: null };
  }
}

export type PartnerDeskStep = { key: "in" | "process" | "ready" | "done"; label: string; state: "done" | "current" | "todo" };

/** Stepper 4 langkah: Masuk → Diproses → Siap → Diserahkan/Diantar. */
export function partnerDeskSteps(order: Pick<PartnerDeskOrder, "status" | "tableLabel" | "fulfillment">): PartnerDeskStep[] {
  const last = isPartnerPickupOrder(order) ? "Diserahkan" : "Diantar";
  const index: Record<string, number> = { queue: 0, accepted: 1, cooking: 1, ready: 2, delivered: 4, served: 4 };
  const at = index[order.status] ?? 0;
  const steps: Array<Pick<PartnerDeskStep, "key" | "label">> = [
    { key: "in", label: "Masuk" },
    { key: "process", label: "Diproses" },
    { key: "ready", label: "Siap" },
    { key: "done", label: last },
  ];
  return steps.map((step, i) => ({ ...step, state: i < at ? "done" : i === at ? "current" : "todo" }));
}

// ─── 2. Penjualan mitra per shift ────────────────────────────────────────────

export type PartnerShiftLine = PartnerLineAmounts & {
  id: string;
  partnerId: string;
  partnerName: string;
  itemName: string;
  variantLabel: string;
  orderNo: string;
  /** Status bayar bill tempat baris ini berada sekarang (paymentStatusOf): paid | pending | cancelled | … */
  orderPayment: string;
  createdAt: Date | string;
};

export type PartnerShiftAdjustment = { orderLineId: string | null; partnerId: string; kind: string; salesDelta: number; liabilityDelta: number; status: string };

export type PartnerShiftProduct = {
  itemName: string;
  variantLabel: string;
  qty: number;
  unitPrice: number;
  sales: number;
  /** Modal mitra = yang wajib dibayar Garage ke mitra (HPP × qty siap). */
  partnerCost: number;
  garageProfit: number;
};

export type PartnerShiftPartner = {
  partnerId: string;
  partnerName: string;
  products: PartnerShiftProduct[];
  orderCount: number;
  qty: number;
  sales: number;
  partnerCost: number;
  garageProfit: number;
  /** Refund pelanggan (mengurangi penjualan, tidak mengurangi wajib bayar — DEC-04/05). */
  refunds: number;
  /** Wajib bayar ke mitra = Σ modal mitra item siap + penyesuaian kewajiban. */
  payable: number;
  /** Item belum siap (masih di mitra): belum wajib bayar, belum dihitung. */
  pending: { qty: number; sales: number; partnerCost: number };
  /** Ditolak mitra / dibatalkan sebelum siap: Rp 0 ke mitra. */
  cancelled: { qty: number; sales: number };
  /** Item siap di bill yang belum dibayar pelanggan (tetap wajib bayar ke mitra). */
  unpaidBill: { qty: number; sales: number };
};

export type PartnerShiftSales = {
  partners: PartnerShiftPartner[];
  totals: { orderCount: number; qty: number; sales: number; partnerCost: number; garageProfit: number; refunds: number; payable: number; pendingQty: number; cancelledQty: number; unpaidBillSales: number };
};

const emptyTotals = (): PartnerShiftSales["totals"] => ({ orderCount: 0, qty: 0, sales: 0, partnerCost: 0, garageProfit: 0, refunds: 0, payable: 0, pendingQty: 0, cancelledQty: 0, unpaidBillSales: 0 });

/**
 * Rekap penjualan mitra untuk satu shift. Yang dihitung "terjual" = qty yang sudah SIAP dari mitra (DEC-03: sejak itu
 * Garage wajib membayar mitra). Penjualan memakai harga jual snapshot (sebelum diskon Garage — promo ditanggung Garage,
 * DEC-05); order void setelah siap = penjualan 0 tetapi modal mitra tetap dibayar (DEC-04).
 * Profit Garage = penjualan − modal mitra − refund pelanggan.
 */
export function partnerShiftSales(lines: PartnerShiftLine[], adjustments: PartnerShiftAdjustment[] = []): PartnerShiftSales {
  const byPartner = new Map<string, PartnerShiftPartner & { orders: Set<string>; productMap: Map<string, PartnerShiftProduct> }>();
  const partnerOf = (partnerId: string, partnerName: string) => {
    let row = byPartner.get(partnerId);
    if (!row) {
      row = {
        partnerId,
        partnerName,
        products: [],
        orderCount: 0,
        qty: 0,
        sales: 0,
        partnerCost: 0,
        garageProfit: 0,
        refunds: 0,
        payable: 0,
        pending: { qty: 0, sales: 0, partnerCost: 0 },
        cancelled: { qty: 0, sales: 0 },
        unpaidBill: { qty: 0, sales: 0 },
        orders: new Set(),
        productMap: new Map(),
      };
      byPartner.set(partnerId, row);
    }
    return row;
  };

  for (const line of lines) {
    const row = partnerOf(line.partnerId, line.partnerName);
    const f = partnerLineFinance(line);
    const cancelledQty = Math.max(0, Math.min(line.qty, line.cancelledQty));
    if (cancelledQty > 0) {
      row.cancelled.qty += cancelledQty;
      row.cancelled.sales += cancelledQty * line.unitPrice;
    }
    if (!isPayableLineStatus(line.status) || f.payableQty === 0) {
      if (f.soldQty > 0 && !["rejected", "cancelled"].includes(line.status)) {
        row.pending.qty += f.soldQty;
        row.pending.sales += line.salesVoided ? 0 : f.soldQty * line.unitPrice;
        row.pending.partnerCost += f.soldQty * line.unitCost;
      }
      continue;
    }
    const qty = f.payableQty;
    const sales = line.salesVoided ? 0 : qty * line.unitPrice;
    const cost = qty * line.unitCost;
    // Sisa qty yang belum siap pada baris yang sama (jarang: siap sebagian) tetap "belum siap".
    if (f.soldQty > qty) {
      row.pending.qty += f.soldQty - qty;
      row.pending.sales += line.salesVoided ? 0 : (f.soldQty - qty) * line.unitPrice;
      row.pending.partnerCost += (f.soldQty - qty) * line.unitCost;
    }
    row.orders.add(line.orderNo);
    row.qty += qty;
    row.sales += sales;
    row.partnerCost += cost;
    if (line.orderPayment !== "paid" && line.orderPayment !== "cancelled") {
      row.unpaidBill.qty += qty;
      row.unpaidBill.sales += sales;
    }
    const key = `${line.itemName}\u0000${line.variantLabel}\u0000${line.unitPrice}\u0000${line.unitCost}`;
    const product = row.productMap.get(key) ?? { itemName: line.itemName, variantLabel: line.variantLabel, qty: 0, unitPrice: line.unitPrice, sales: 0, partnerCost: 0, garageProfit: 0 };
    product.qty += qty;
    product.sales += sales;
    product.partnerCost += cost;
    product.garageProfit = product.sales - product.partnerCost;
    row.productMap.set(key, product);
  }

  const liabilityAdj = new Map<string, number>();
  for (const adj of adjustments) {
    if (adj.status !== "approved") continue;
    const row = byPartner.get(adj.partnerId);
    if (!row) continue;
    if (adj.salesDelta < 0) row.refunds += -adj.salesDelta;
    liabilityAdj.set(adj.partnerId, (liabilityAdj.get(adj.partnerId) ?? 0) + adj.liabilityDelta);
  }

  const partners = [...byPartner.values()]
    .map(({ orders, productMap, ...row }) => {
      const adj = liabilityAdj.get(row.partnerId) ?? 0;
      return {
        ...row,
        orderCount: orders.size,
        payable: row.partnerCost + adj,
        garageProfit: row.sales - row.partnerCost - row.refunds - adj,
        products: [...productMap.values()].sort((a, b) => b.qty - a.qty || a.itemName.localeCompare(b.itemName, "id")),
      };
    })
    .filter((row) => row.qty > 0 || row.pending.qty > 0 || row.cancelled.qty > 0 || row.refunds > 0)
    .sort((a, b) => b.sales - a.sales || a.partnerName.localeCompare(b.partnerName, "id"));

  const totals = emptyTotals();
  for (const row of partners) {
    totals.orderCount += row.orderCount;
    totals.qty += row.qty;
    totals.sales += row.sales;
    totals.partnerCost += row.partnerCost;
    totals.garageProfit += row.garageProfit;
    totals.refunds += row.refunds;
    totals.payable += row.payable;
    totals.pendingQty += row.pending.qty;
    totals.cancelledQty += row.cancelled.qty;
    totals.unpaidBillSales += row.unpaidBill.sales;
  }
  return { partners, totals };
}

/**
 * Kalimat setoran untuk laporan: settlement mitra per hari kalender WIB (A7) — penjualan tanggal X dibayar paling
 * lambat X+1 pukul 12.00 WIB. Item yang siap lewat tengah malam masuk rekap hari berikutnya.
 */
export function partnerShiftPayoutNote(shiftOpenedAt: Date | string) {
  const day = new Date(`${wibDayKey(shiftOpenedAt)}T00:00:00Z`);
  const next = new Date(day.getTime() + 86_400_000);
  const fmt = (d: Date) => d.toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
  return `Wajib bayar ini masuk rekap setoran harian mitra tanggal ${fmt(day)} (item yang siap lewat pukul 00.00 masuk rekap hari berikutnya) dan dibayar paling lambat ${fmt(next)} pukul 12.00 WIB lewat Keuangan Mitra. Laporan shift hanya mencatat, tidak membayar.`;
}
