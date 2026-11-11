// =============================================================================
// SMART PARTNER HUB — aturan murni lanjutan (Owner, Nov 2026, backlog P1/P2 PRD Partner Hub):
//   1. Pengajuan harga dari mitra (validasi & ringkasan perubahan).
//   2. Rapor kinerja mitra (waktu terima/siap, tingkat tolak, SLA, jam ramai).
//   3. Peringatan kesehatan mitra (ketersediaan basi, tiket macet, pengajuan menunggu).
// Tanpa DB / tanpa I/O — dipakai server (partner-hub-service) dan diuji di partner-hub-insights.test.ts.
// Bahasa netral: angka adalah bahan evaluasi, bukan tuduhan.
// =============================================================================

// ─── 1. Pengajuan harga ──────────────────────────────────────────────────────

export const PRICE_PROPOSAL_STATUS_LABEL: Record<string, string> = {
  pending: "Menunggu Owner",
  approved: "Disetujui",
  rejected: "Ditolak",
  cancelled: "Dibatalkan mitra",
};

/** Batas wajar perubahan HPP per pengajuan (± persen). Di atas ini tetap boleh, tapi ditandai untuk Owner. */
export const PRICE_PROPOSAL_ALERT_PCT = 25;

export type PriceProposalInput = {
  currentUnitCost: number;
  currentSellPrice: number;
  proposedUnitCost: number;
  suggestedSellPrice?: number | null;
  reason: string;
};

/** Null = boleh diajukan; teks = alasan ditolak (untuk mitra). */
export function priceProposalBlockReason(input: PriceProposalInput): string | null {
  if (!Number.isInteger(input.proposedUnitCost) || input.proposedUnitCost <= 0) return "Harga setor harus rupiah bulat lebih dari 0.";
  if (input.proposedUnitCost > 10_000_000) return "Harga setor terlalu besar. Periksa lagi angkanya.";
  if (input.proposedUnitCost === input.currentUnitCost && (input.suggestedSellPrice == null || input.suggestedSellPrice === input.currentSellPrice)) {
    return "Harga yang diajukan sama dengan harga sekarang.";
  }
  if (input.suggestedSellPrice != null) {
    if (!Number.isInteger(input.suggestedSellPrice) || input.suggestedSellPrice <= 0) return "Usulan harga jual harus rupiah bulat lebih dari 0.";
    if (input.suggestedSellPrice < input.proposedUnitCost) return "Usulan harga jual tidak boleh di bawah harga setor.";
  }
  const reason = input.reason.trim();
  if (reason.length < 5) return "Tulis alasan pengajuan (mis. harga bahan naik).";
  if (reason.length > 500) return "Alasan terlalu panjang (maks. 500 huruf).";
  return null;
}

/** Ringkasan dampak pengajuan untuk layar Owner: selisih HPP, margin Garage sebelum/sesudah. */
export function priceProposalImpact(input: { currentUnitCost: number; currentSellPrice: number; proposedUnitCost: number; sellPrice: number }) {
  const costDelta = input.proposedUnitCost - input.currentUnitCost;
  const costDeltaPct = input.currentUnitCost > 0 ? Math.round((costDelta / input.currentUnitCost) * 1000) / 10 : null;
  const marginBefore = input.currentSellPrice - input.currentUnitCost;
  const marginAfter = input.sellPrice - input.proposedUnitCost;
  return {
    costDelta,
    costDeltaPct,
    marginBefore,
    marginAfter,
    marginAfterPct: input.sellPrice > 0 ? Math.round((marginAfter / input.sellPrice) * 1000) / 10 : 0,
    belowCost: input.sellPrice < input.proposedUnitCost,
    bigChange: costDeltaPct !== null && Math.abs(costDeltaPct) > PRICE_PROPOSAL_ALERT_PCT,
  };
}

/**
 * Harga jual yang dipakai saat Owner menyetujui tanpa mengetik harga jual:
 * usulan mitra bila ada, selain itu harga sekarang — tetapi tidak pernah di bawah harga setor baru
 * (dinaikkan agar margin Garage rupiah tidak berubah).
 */
export function defaultApprovedSellPrice(input: { currentUnitCost: number; currentSellPrice: number; proposedUnitCost: number; suggestedSellPrice?: number | null }) {
  if (input.suggestedSellPrice != null && input.suggestedSellPrice >= input.proposedUnitCost) return input.suggestedSellPrice;
  if (input.currentSellPrice >= input.proposedUnitCost) return input.currentSellPrice;
  return input.proposedUnitCost + Math.max(input.currentSellPrice - input.currentUnitCost, 0);
}

// ─── 2. Rapor kinerja ────────────────────────────────────────────────────────

export type PerformanceTicket = {
  status: string;
  createdAt: Date | string;
  acceptedAt?: Date | string | null;
  readyAt?: Date | string | null;
  handoverAt?: Date | string | null;
  deliveredAt?: Date | string | null;
  claimedAt?: Date | string | null;
  rejectReason?: string | null;
};

const ms = (value: Date | string | null | undefined) => (value ? new Date(value).getTime() : null);

function minutesBetween(from: Date | string | null | undefined, to: Date | string | null | undefined) {
  const a = ms(from);
  const b = ms(to);
  if (a === null || b === null || b < a) return null;
  return (b - a) / 60_000;
}

function summarize(values: number[]) {
  if (!values.length) return { count: 0, avg: null as number | null, p90: null as number | null, max: null as number | null };
  const sorted = [...values].sort((x, y) => x - y);
  const avg = sorted.reduce((sum, v) => sum + v, 0) / sorted.length;
  const p90 = sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.9) - 1)];
  const round = (v: number) => Math.round(v * 10) / 10;
  return { count: sorted.length, avg: round(avg), p90: round(p90), max: round(sorted[sorted.length - 1]) };
}

/** Jam WIB (0–23). */
function jakartaHour(value: Date | string) {
  return new Date(new Date(value).getTime() + 7 * 3_600_000).getUTCHours();
}

export type PerformanceOptions = {
  /** Batas menit menerima pesanan (SLA eskalasi Outlet). */
  acceptSlaMinutes: number;
  /** Target menit dari diterima sampai Siap Antar. */
  prepTargetMinutes: number;
  /** Batas menit "siap belum diambil" (sisi Garage, bukan kinerja mitra). */
  pickupSlaMinutes?: number;
};

/**
 * Rapor kinerja mitra dari tiket station Mitra pada satu periode.
 * - Waktu terima = masuk → diterima; waktu siap = diterima → Siap Antar.
 * - Tingkat tolak dihitung dari tiket yang diputuskan mitra (diterima atau ditolak), bukan yang dibatalkan kasir.
 * - "Ambil" = Siap Antar → diambil waiter: kinerja tim Garage, ditampilkan terpisah.
 */
export function partnerPerformance(tickets: PerformanceTicket[], options: PerformanceOptions) {
  const accept: number[] = [];
  const prep: number[] = [];
  const pickup: number[] = [];
  let lateAccept = 0;
  let latePrep = 0;
  let latePickup = 0;
  let rejected = 0;
  let cancelled = 0;
  let decided = 0;
  let completed = 0;
  const hourly = Array.from({ length: 24 }, () => 0);
  const rejectReasons = new Map<string, number>();

  for (const ticket of tickets) {
    hourly[jakartaHour(ticket.createdAt)] += 1;
    if (ticket.status === "cancelled" || ticket.status === "voided") {
      cancelled += 1;
      continue;
    }
    if (ticket.status === "rejected") {
      rejected += 1;
      decided += 1;
      const reason = ticket.rejectReason?.trim() || "Tanpa alasan";
      rejectReasons.set(reason, (rejectReasons.get(reason) ?? 0) + 1);
      continue;
    }
    if (ticket.acceptedAt) {
      decided += 1;
      const a = minutesBetween(ticket.createdAt, ticket.acceptedAt);
      if (a !== null) {
        accept.push(a);
        if (a > options.acceptSlaMinutes) lateAccept += 1;
      }
    }
    const readyAt = ticket.readyAt ?? ticket.handoverAt;
    if (readyAt) {
      completed += 1;
      const p = minutesBetween(ticket.acceptedAt ?? ticket.createdAt, readyAt);
      if (p !== null) {
        prep.push(p);
        if (p > options.prepTargetMinutes) latePrep += 1;
      }
      const taken = ticket.claimedAt ?? ticket.deliveredAt;
      const k = minutesBetween(readyAt, taken);
      if (k !== null) {
        pickup.push(k);
        if (options.pickupSlaMinutes && k > options.pickupSlaMinutes) latePickup += 1;
      }
    }
  }

  const pct = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 1000) / 10 : null);
  const acceptStats = summarize(accept);
  const prepStats = summarize(prep);
  const peakHours = hourly
    .map((count, hour) => ({ hour, count }))
    .filter((row) => row.count > 0)
    .sort((a, b) => b.count - a.count || a.hour - b.hour)
    .slice(0, 3);

  // Skor layanan 0–100: tepat waktu terima (40) + tepat waktu siap (40) + tidak menolak (20).
  // Null bila belum ada tiket yang diputuskan (tidak dianggap 0).
  const onTimeAccept = acceptStats.count ? 1 - lateAccept / acceptStats.count : null;
  const onTimePrep = prepStats.count ? 1 - latePrep / prepStats.count : null;
  const notRejected = decided ? 1 - rejected / decided : null;
  const parts: Array<[number | null, number]> = [
    [onTimeAccept, 40],
    [onTimePrep, 40],
    [notRejected, 20],
  ];
  const weight = parts.reduce((sum, [value, w]) => sum + (value === null ? 0 : w), 0);
  const serviceScore = weight > 0 ? Math.round((parts.reduce((sum, [value, w]) => sum + (value ?? 0) * w, 0) / weight) * 100) : null;

  return {
    totalTickets: tickets.length,
    completed,
    rejected,
    cancelled,
    rejectRatePct: pct(rejected, decided),
    accept: { ...acceptStats, late: lateAccept, onTimePct: pct(acceptStats.count - lateAccept, acceptStats.count) },
    prep: { ...prepStats, late: latePrep, onTimePct: pct(prepStats.count - latePrep, prepStats.count) },
    pickup: { ...summarize(pickup), late: latePickup },
    serviceScore,
    serviceGrade: serviceGrade(serviceScore),
    peakHours,
    hourly,
    rejectReasons: [...rejectReasons.entries()].map(([reason, count]) => ({ reason, count })).sort((a, b) => b.count - a.count),
  };
}

export function serviceGrade(score: number | null) {
  if (score === null) return "Belum ada data";
  if (score >= 90) return "Sangat baik";
  if (score >= 75) return "Baik";
  if (score >= 60) return "Perlu perhatian";
  return "Perlu dibahas bersama";
}

// ─── 3. Peringatan kesehatan mitra ───────────────────────────────────────────

export type HealthInput = {
  partnerName: string;
  partnerStatus: string;
  operationalStatus: string;
  products: Array<{ name: string; active: boolean; available: boolean; availabilityUpdatedAt?: Date | string | null }>;
  activeTickets: Array<{ ticketNo: string; status: string; createdAt: Date | string; acceptedAt?: Date | string | null; readyAt?: Date | string | null }>;
  pendingProposals: number;
  pendingAdjustments: number;
  unpaidApproved: number;
  hasVerifiedBank: boolean;
  /** Jumlah akun Portal Mitra aktif (undefined = tidak dicek). */
  portalAccounts?: number;
};

export type HealthAlert = { level: "info" | "warning" | "critical"; code: string; text: string };

/**
 * Peringatan operasional yang bisa ditindaklanjuti (urut paling penting). Hanya untuk mitra aktif/dibekukan.
 * Ketersediaan basi = produk "Tersedia" yang tidak dikonfirmasi ulang > `staleDays` hari.
 */
export function partnerHealthAlerts(input: HealthInput, options: { now?: Date; staleDays?: number; stuckMinutes?: number; acceptSlaMinutes?: number } = {}) {
  const now = (options.now ?? new Date()).getTime();
  const staleDays = options.staleDays ?? 3;
  const stuckMinutes = options.stuckMinutes ?? 45;
  const acceptSla = options.acceptSlaMinutes ?? 5;
  const alerts: HealthAlert[] = [];
  if (!["aktif", "dibekukan"].includes(input.partnerStatus)) return alerts;

  // Tiket "queue" dengan acceptedAt = sudah diterima (lihat actOnPartnerTicket).
  const waiting = input.activeTickets.filter((t) => t.status === "queue" && !t.acceptedAt && (now - new Date(t.createdAt).getTime()) / 60_000 > acceptSla);
  if (waiting.length) alerts.push({ level: "critical", code: "ACCEPT_LATE", text: `${waiting.length} pesanan belum diterima lebih dari ${acceptSla} menit.` });
  const stuck = input.activeTickets.filter((t) => t.acceptedAt && t.status !== "ready" && (now - new Date(t.acceptedAt).getTime()) / 60_000 > stuckMinutes);
  if (stuck.length) alerts.push({ level: "warning", code: "TICKET_STUCK", text: `${stuck.length} pesanan diproses lebih dari ${stuckMinutes} menit.` });
  if (input.activeTickets.length && input.operationalStatus !== "buka") {
    alerts.push({ level: "warning", code: "OPEN_TICKETS_WHILE_CLOSED", text: "Masih ada pesanan aktif padahal mitra tidak BUKA." });
  }

  const active = input.products.filter((p) => p.active);
  if (input.partnerStatus === "aktif" && active.length === 0) {
    alerts.push({
      level: "warning",
      code: "NO_ACTIVE_PRODUCT",
      text: input.portalAccounts
        ? "Punya akun Portal Mitra tetapi belum ada produk aktif — Buka/Tersedia dari portal tidak memengaruhi menu. Cek apakah produknya tersambung ke mitra lain (Pengaturan produk → Pindahkan)."
        : "Belum ada produk aktif yang bisa dijual.",
    });
  }
  if (active.length && input.portalAccounts === 0) {
    alerts.push({
      level: "warning",
      code: "NO_PORTAL_ACCOUNT",
      text: `${active.length} produk aktif tetapi mitra belum punya akun Portal Mitra — status Buka/Jeda dan Tersedia/Habis tidak bisa diatur mitra sendiri.`,
    });
  }
  if (active.length && active.every((p) => !p.available)) alerts.push({ level: "info", code: "ALL_SOLD_OUT", text: "Semua produk ditandai Habis." });
  const stale = active.filter((p) => {
    if (!p.available) return false;
    const at = ms(p.availabilityUpdatedAt ?? null);
    return at === null || now - at > staleDays * 86_400_000;
  });
  if (stale.length) {
    alerts.push({ level: "info", code: "AVAILABILITY_STALE", text: `${stale.length} produk "Tersedia" belum dikonfirmasi ulang lebih dari ${staleDays} hari.` });
  }

  if (input.pendingProposals) alerts.push({ level: "warning", code: "PRICE_PROPOSAL_PENDING", text: `${input.pendingProposals} pengajuan harga menunggu keputusan Owner.` });
  if (input.pendingAdjustments) alerts.push({ level: "info", code: "ADJUSTMENT_PENDING", text: `${input.pendingAdjustments} penyesuaian menunggu keputusan Owner.` });
  if (input.unpaidApproved > 0) {
    alerts.push({ level: input.hasVerifiedBank ? "info" : "warning", code: "UNPAID", text: `Setoran disetujui belum dibayar: Rp${input.unpaidApproved.toLocaleString("id-ID")}.` });
  }
  if (!input.hasVerifiedBank) alerts.push({ level: "warning", code: "NO_BANK", text: "Rekening mitra belum terverifikasi." });

  const order = { critical: 0, warning: 1, info: 2 } as const;
  return alerts.sort((a, b) => order[a.level] - order[b.level]);
}

// ─── 4. Klaim grup per meja (P1, papan 02) ───────────────────────────────────

export type PickupTicket = { ticketNo: string; tableLabel: string | null; status: string; claimedByName: string | null; readyAt?: string | Date | null; partnerName?: string };

/**
 * Kelompokkan pesanan mitra yang Siap Antar per meja (take away per tiket sendiri), urut paling lama siap.
 * `claimable` = belum diklaim siapa pun; `deliverable` = sudah diklaim (server tetap memastikan hanya pengklaim
 * yang boleh menandai diantar). Klaim/antar tetap per tiket di server — grup hanya menghemat ketukan waiter.
 */
export function groupPickupByTable(tickets: PickupTicket[]) {
  const groups = new Map<string, { key: string; tableLabel: string | null; tickets: PickupTicket[]; oldestReadyAt: number }>();
  for (const ticket of tickets) {
    if (ticket.status !== "ready") continue;
    const key = ticket.tableLabel ? `table:${ticket.tableLabel}` : `takeaway:${ticket.ticketNo}`;
    const readyAt = ticket.readyAt ? new Date(ticket.readyAt).getTime() : Number.MAX_SAFE_INTEGER;
    const group = groups.get(key) ?? { key, tableLabel: ticket.tableLabel, tickets: [], oldestReadyAt: readyAt };
    group.tickets.push(ticket);
    group.oldestReadyAt = Math.min(group.oldestReadyAt, readyAt);
    groups.set(key, group);
  }
  return [...groups.values()]
    .map((group) => ({
      ...group,
      claimable: group.tickets.filter((t) => !t.claimedByName).map((t) => t.ticketNo),
      deliverable: group.tickets.filter((t) => t.claimedByName).map((t) => t.ticketNo),
      partners: [...new Set(group.tickets.map((t) => t.partnerName).filter(Boolean))] as string[],
    }))
    .sort((a, b) => a.oldestReadyAt - b.oldestReadyAt);
}
