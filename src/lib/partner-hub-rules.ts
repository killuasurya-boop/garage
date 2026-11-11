// =============================================================================
// SMART PARTNER HUB — aturan MURNI (tanpa DB/jaringan). Owner 10 Nov 2026, PRD V1.0,
// keputusan GATE 0 (docs/partner-hub/00-GATE0-AUDIT-PLAN.md). Semua nominal = rupiah bulat.
// =============================================================================

export const PARTNER_STATUSES = ["draft", "verifikasi", "disetujui", "aktif", "dibekukan", "nonaktif"] as const;
export type PartnerStatus = (typeof PARTNER_STATUSES)[number];

export const PARTNER_STATUS_LABEL: Record<PartnerStatus, string> = {
  draft: "Draft",
  verifikasi: "Verifikasi",
  disetujui: "Disetujui Owner",
  aktif: "Aktif",
  dibekukan: "Dihentikan sementara",
  nonaktif: "Nonaktif",
};

/** Alur status mitra (PRD 04). Aktivasi punya syarat tambahan (partnerActivationBlockers). */
const PARTNER_STATUS_FLOW: Record<PartnerStatus, PartnerStatus[]> = {
  draft: ["verifikasi", "nonaktif"],
  verifikasi: ["disetujui", "draft", "nonaktif"],
  disetujui: ["aktif", "verifikasi", "nonaktif"],
  aktif: ["dibekukan", "nonaktif"],
  dibekukan: ["aktif", "nonaktif"],
  nonaktif: ["draft"],
};

export function canChangePartnerStatus(from: string, to: string) {
  return (PARTNER_STATUS_FLOW[from as PartnerStatus] ?? []).includes(to as PartnerStatus);
}

export const OPERATIONAL_STATUSES = ["buka", "jeda", "tutup"] as const;
export type OperationalStatus = (typeof OPERATIONAL_STATUSES)[number];

export const OPERATIONAL_STATUS_LABEL: Record<OperationalStatus, string> = {
  buka: "Buka",
  jeda: "Jeda",
  tutup: "Tutup",
};

/** Syarat aktivasi (PRD 04). Kosong = boleh diaktifkan. */
export function partnerActivationBlockers(input: {
  status: string;
  hasVerifiedBank: boolean;
  hasActiveAccount: boolean;
  phone: string | null;
  activeProductCount: number;
  termsAccepted: boolean;
}): string[] {
  const blockers: string[] = [];
  if (input.status !== "disetujui" && input.status !== "dibekukan") blockers.push("Mitra harus berstatus Disetujui Owner dulu.");
  if (!input.termsAccepted) blockers.push("Kesepakatan harga, pembatalan & serah-terima belum dicatat.");
  if (!input.phone?.trim()) blockers.push("Kontak WhatsApp mitra belum diisi.");
  if (!input.hasVerifiedBank) blockers.push("Rekening penerima belum diverifikasi Owner/Finance.");
  if (!input.hasActiveAccount) blockers.push("Akun login mitra belum dibuat.");
  if (input.activeProductCount < 1) blockers.push("Minimal satu produk mitra disetujui.");
  return blockers;
}

/** "HH:MM" → menit sejak 00:00, atau null bila tidak valid. */
export function parseClock(value: string | null | undefined) {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value?.trim() ?? "");
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}

/** Hari & menit lokal WIB (Asia/Jakarta, UTC+7 tetap) dari sebuah instant. */
export function jakartaDayMinute(at: Date) {
  const local = new Date(at.getTime() + 7 * 3_600_000);
  return { day: local.getUTCDay(), minute: local.getUTCHours() * 60 + local.getUTCMinutes() };
}

/** Sudah lewat last order hari ini? (null/tidak diisi = tanpa batas). */
export function isPastLastOrder(lastOrderByDay: Record<string, string | null> | null | undefined, at = new Date()) {
  const { day, minute } = jakartaDayMinute(at);
  const limit = parseClock(lastOrderByDay?.[String(day)] ?? null);
  return limit !== null && minute > limit;
}

export type PartnerAvailabilityInput = {
  hubEnabled: boolean;
  partnerStatus: string;
  operationalStatus: string;
  linkActive: boolean;
  productStock: string | null | undefined;
  lastOrderByDay?: Record<string, string | null> | null;
};

/**
 * Bolehkah produk mitra dipesan sekarang? (PRD 06). Null = boleh; teks = alasan (untuk kasir/waiter).
 * Server memanggil ini lagi saat order disahkan — status di layar tidak pernah dipercaya.
 */
export function partnerOrderBlockReason(input: PartnerAvailabilityInput, at = new Date()): string | null {
  if (!input.hubEnabled) return "Partner Hub belum aktif di outlet ini.";
  if (input.partnerStatus !== "aktif") return "Mitra belum aktif / sedang dihentikan.";
  if (!input.linkActive) return "Produk mitra belum disetujui Owner.";
  if (input.operationalStatus === "tutup") return "Mitra sedang tutup.";
  if (input.operationalStatus === "jeda") return "Mitra sedang jeda.";
  if (input.operationalStatus !== "buka") return "Ketersediaan mitra belum terkonfirmasi.";
  if (input.productStock === "sold_out") return "Produk sedang habis (Sold Out).";
  if (isPastLastOrder(input.lastOrderByDay, at)) return "Sudah lewat jam last order mitra.";
  return null;
}

/** Label pendek untuk kartu produk POS (kasir langsung tahu kenapa tidak bisa dijual). Null = bisa dipesan. */
export function partnerCardLabel(input: PartnerAvailabilityInput, at = new Date()): string | null {
  if (!partnerOrderBlockReason(input, at)) return null;
  if (input.partnerStatus !== "aktif") return "Mitra nonaktif";
  if (input.operationalStatus === "tutup") return "Mitra tutup";
  if (input.operationalStatus === "jeda") return "Mitra jeda";
  if (input.operationalStatus !== "buka") return "Mitra belum konfirmasi";
  if (input.productStock === "sold_out") return "Habis";
  if (isPastLastOrder(input.lastOrderByDay, at)) return "Lewat last order";
  return "Tidak tersedia";
}

/** Pesanan mitra yang perlu perhatian kasir: belum diterima lewat SLA, atau sudah siap tapi belum diambil. */
export function partnerOrdersNeedingAttention(
  orders: Array<{ status: string; createdAt: string | Date; readyAt: string | Date | null; claimedByName?: string | null }>,
  now: number,
  slaWarnMinutes: number,
  readyWarnMinutes: number,
) {
  return orders.filter((order) => {
    if (order.status === "queue") return now - new Date(order.createdAt).getTime() >= slaWarnMinutes * 60_000;
    if (order.status === "ready" && !order.claimedByName) return Boolean(order.readyAt) && now - new Date(order.readyAt as string | Date).getTime() >= readyWarnMinutes * 60_000;
    return false;
  }).length;
}

// ─── Tiket mitra (PRD 07.5) ──────────────────────────────────────────────────
// Disimpan di kitchen_tickets (station "Mitra"): queue → accepted → cooking(=diproses) → ready → (waiter) served.

export const PARTNER_STATION = "Mitra";

export type PartnerTicketAction = "accept" | "start" | "ready" | "reject";

export const PARTNER_TICKET_STATUS_LABEL: Record<string, string> = {
  queue: "Menunggu Mitra",
  accepted: "Diterima",
  cooking: "Diproses",
  ready: "Siap Antar",
  served: "Diantar",
  rejected: "Ditolak",
  cancelled: "Dibatalkan",
};

/** Transisi tiket yang boleh dilakukan mitra. Null = tidak sah (status mundur / lompat). */
export function partnerTicketNextStatus(current: string, action: PartnerTicketAction): string | null {
  if (action === "accept") return current === "queue" ? "accepted" : null;
  if (action === "start") return current === "accepted" ? "cooking" : null;
  if (action === "ready") return current === "accepted" || current === "cooking" ? "ready" : null;
  if (action === "reject") return current === "queue" || current === "accepted" ? "rejected" : null;
  return null;
}

/** Status baris mitra mengikuti status tiket (untuk keuangan & laporan). */
export function lineStatusForTicket(ticketStatus: string): string {
  switch (ticketStatus) {
    case "accepted":
      return "accepted";
    case "cooking":
      return "processing";
    case "ready":
      return "ready";
    case "served":
      return "delivered";
    case "rejected":
      return "rejected";
    case "cancelled":
      return "cancelled";
    default:
      return "queue";
  }
}

/** DEC-03: item wajib dibayar ke mitra sejak mitra menandai Siap Antar (dan tidak dibatalkan). */
export function isPayableLineStatus(status: string) {
  return status === "ready" || status === "picked" || status === "delivered";
}

// ─── Keuangan (PRD 12.1) ─────────────────────────────────────────────────────

export type PartnerLineAmounts = {
  qty: number;
  unitPrice: number;
  unitCost: number;
  fulfilledQty: number;
  cancelledQty: number;
  status: string;
  /** Order dibatalkan/void setelah barang disiapkan: penjualan 0, kewajiban tetap (DEC-04). */
  salesVoided?: boolean;
};

/**
 * Angka per baris. Bruto = qty terjual × harga; HPP & kewajiban hanya untuk qty yang memenuhi syarat
 * (DEC-03). Diskon promo Garage tidak mengubah HPP mitra (DEC-05) → tidak dihitung di sini.
 */
export function partnerLineFinance(line: PartnerLineAmounts) {
  const soldQty = Math.max(0, line.qty - line.cancelledQty);
  const payableQty = isPayableLineStatus(line.status) ? Math.min(soldQty, Math.max(line.fulfilledQty, 0)) : 0;
  const gross = line.salesVoided ? 0 : soldQty * line.unitPrice;
  // Kewajiban = HPP qty yang sudah memenuhi syarat bayar (DEC-03).
  const liability = payableQty * line.unitCost;
  // HPP terkait untuk laba: seluruh qty terjual (item yang belum siap tetap akan dibayar bila dipenuhi);
  // order void setelah barang disiapkan = penjualan 0, HPP = kewajiban yang tetap dibayar (DEC-04).
  const cost = line.salesVoided ? liability : soldQty * line.unitCost;
  return { soldQty, payableQty, gross, cost, profit: gross - cost, liability };
}

export type PartnerAdjustmentAmounts = { salesDelta: number; liabilityDelta: number; status: string };

/** Ringkasan settlement: Σ baris + penyesuaian yang disetujui. Sisa = kewajiban − pembayaran terverifikasi. */
export function partnerSettlementTotals(
  lines: PartnerLineAmounts[],
  adjustments: PartnerAdjustmentAmounts[],
  verifiedPaid = 0,
) {
  let totalQty = 0;
  let grossSales = 0;
  let totalCost = 0;
  let lineLiability = 0;
  for (const line of lines) {
    const f = partnerLineFinance(line);
    totalQty += f.payableQty;
    grossSales += f.gross;
    totalCost += f.cost;
    lineLiability += f.liability;
  }
  const approved = adjustments.filter((a) => a.status === "approved");
  const salesAdjustments = approved.reduce((sum, a) => sum + a.salesDelta, 0);
  const liabilityAdjustments = approved.reduce((sum, a) => sum + a.liabilityDelta, 0);
  const netSales = grossSales + salesAdjustments;
  const liabilityTotal = lineLiability + liabilityAdjustments;
  return {
    totalQty,
    grossSales,
    salesAdjustments,
    netSales,
    totalCost,
    liabilityAdjustments,
    // Laba kotor = penjualan bersih − HPP terkait − penyesuaian kewajiban (untuk settlement = netSales − setoran).
    garageProfit: netSales - totalCost - liabilityAdjustments,
    liabilityTotal,
    paidAmount: verifiedPaid,
    outstanding: liabilityTotal - verifiedPaid,
  };
}

// ─── Settlement (PRD 13.1) ───────────────────────────────────────────────────

export const SETTLEMENT_STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  submitted: "Diajukan",
  approved: "Disetujui",
  partially_paid: "Dibayar sebagian",
  paid: "Lunas",
  disputed: "Sengketa",
  cancelled: "Dibatalkan",
};

/** Status setelah pembayaran terverifikasi dicatat. */
export function settlementStatusAfterPayment(liabilityTotal: number, verifiedPaid: number) {
  if (verifiedPaid <= 0) return "approved";
  return verifiedPaid >= liabilityTotal ? "paid" : "partially_paid";
}

/** Pembayaran tidak boleh melebihi sisa kewajiban (PRD 16.3 #5). Null = boleh. */
export function payoutBlockReason(input: { status: string; liabilityTotal: number; verifiedPaid: number; recordedPending: number; amount: number }) {
  if (!["approved", "partially_paid"].includes(input.status)) return "Settlement harus disetujui Owner sebelum dibayar.";
  if (!Number.isInteger(input.amount) || input.amount <= 0) return "Nominal pembayaran harus rupiah bulat > 0.";
  const remaining = input.liabilityTotal - input.verifiedPaid - input.recordedPending;
  if (input.amount > remaining) return `Nominal melebihi sisa setoran (Rp${Math.max(remaining, 0).toLocaleString("id-ID")}).`;
  return null;
}

export function maskAccountNumber(value: string) {
  const digits = value.replace(/\D/g, "");
  return digits.length <= 4 ? `••${digits}` : `•••• ${digits.slice(-4)}`;
}

/** Teks WhatsApp ke mitra: nomor order, meja, produk & qty, catatan. Tanpa HPP & tanpa nomor pelanggan. */
export function partnerTicketWhatsappText(input: {
  partnerName: string;
  orderNo: string;
  tableLabel: string | null;
  items: Array<{ name: string; qty: number; note?: string | null }>;
  portalUrl?: string | null;
}) {
  const lines = [
    `Halo ${input.partnerName}, pesanan Garage Coffee:`,
    `Order ${input.orderNo} · ${input.tableLabel ?? "Take away"}`,
    ...input.items.map((item) => `• ${item.name} x${item.qty}${item.note?.trim() ? ` (${item.note.trim()})` : ""}`),
  ];
  if (input.portalUrl) lines.push(`Buka Portal Mitra: ${input.portalUrl}`);
  return lines.join("\n");
}
