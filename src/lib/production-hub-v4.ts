// =============================================================================
// Production Hub V4 — aturan tampilan murni (tanpa DB/React): status kartu,
// aksi utama per status, SLA, urutan prioritas yang stabil, preset kepadatan,
// dan pemotongan daftar item ("+N item lainnya"). Server tetap memvalidasi
// setiap transisi (garage-kitchen-status.ts + updateKitchenStatus) — fungsi di
// sini hanya memilih tombol yang ditampilkan, tidak pernah melewati server.
// =============================================================================

import type { ProductionTicketView } from "@/lib/garage-api-types";
import { parseTableNumber, tableNumberFromLabel } from "@/lib/garage-tables";

export type HubStatus = "waiting" | "processing" | "ready" | "delivering" | "done";
export type HubAction = "start" | "finish" | "call" | "serve" | "deliver_done";
export type SlaLevel = "ok" | "warn" | "critical";
export type HubSortMode = "priority" | "oldest" | "newest";

type TicketLike = Pick<
  ProductionTicketView,
  "ticketNo" | "status" | "table" | "channel" | "createdAt" | "handoverAt" | "targetMinutes" | "readyAt"
>;

/** Nomor meja dari label tiket ("Meja 06", "T-6", "6"); null = takeaway/pickup/delivery. */
export function hubTableNumber(table: string): string | null {
  const t = table.trim();
  if (/^(take|delivery|bawa|pickup|ambil)/i.test(t)) return null;
  return tableNumberFromLabel(t) ?? parseTableNumber(t.replace(/^T-?/i, ""));
}

/** Pickup = tanpa meja (takeaway, online, kurir): diambil, BUKAN diantar ke meja. */
export function isPickupTicket(ticket: Pick<TicketLike, "table" | "channel">): boolean {
  return hubTableNumber(ticket.table) === null;
}

export function hubStatusOf(ticket: Pick<TicketLike, "status" | "handoverAt" | "table" | "channel">): HubStatus {
  switch (ticket.status) {
    case "queue":
      return "waiting";
    case "cooking":
      return "processing";
    case "ready":
      // Dine-in: setelah waiter dipanggil = sedang diantar. Pickup tidak punya tahap antar.
      return ticket.handoverAt && !isPickupTicket(ticket) ? "delivering" : "ready";
    default:
      return "done";
  }
}

export const HUB_STATUS_LABEL: Record<HubStatus, string> = {
  waiting: "Menunggu",
  processing: "Proses",
  ready: "Siap",
  delivering: "Diantar",
  done: "Selesai",
};

/** Label siap per jenis order (dine-in vs pickup). */
export function readyLabel(ticket: Pick<TicketLike, "status" | "handoverAt" | "table" | "channel">) {
  const pickup = isPickupTicket(ticket);
  const status = hubStatusOf(ticket);
  if (status === "delivering") return "Sedang Diantar";
  if (status === "ready") return pickup ? "Siap Diambil" : "Siap Antar";
  if (status === "done") return pickup ? "Sudah Diambil" : "Selesai Antar";
  return HUB_STATUS_LABEL[status];
}

/**
 * SATU aksi utama per status. Pickup tidak pernah memakai aksi antar:
 * READY pickup → AMBIL (serahkan langsung), READY dine-in → ANTAR (panggil waiter),
 * SEDANG DIANTAR → SELESAI ANTAR (catat waiter yang mengantar).
 */
export function primaryActionOf(
  ticket: Pick<TicketLike, "status" | "handoverAt" | "table" | "channel">,
): { action: HubAction; label: string } | null {
  const status = hubStatusOf(ticket);
  if (status === "waiting") return { action: "start", label: "Mulai" };
  if (status === "processing") return { action: "finish", label: "Selesaikan" };
  if (status === "ready") return isPickupTicket(ticket) ? { action: "serve", label: "Ambil" } : { action: "call", label: "Antar" };
  if (status === "delivering") return { action: "deliver_done", label: "Selesai Antar" };
  return null;
}

export function elapsedSeconds(fromIso: string, now: number, untilIso?: string | null) {
  const end = untilIso ? new Date(untilIso).getTime() : now;
  return Math.max(0, Math.floor((end - new Date(fromIso).getTime()) / 1000));
}

export function formatElapsed(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m >= 60 ? `${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/**
 * SLA sejak pesanan masuk station (sama dengan server: lewat targetMinutes = telat).
 * Hanya tiket yang masih diproduksi yang bisa kritis.
 */
export function slaLevelOf(ticket: Pick<TicketLike, "status" | "createdAt" | "targetMinutes">, now: number): SlaLevel {
  if (ticket.status !== "queue" && ticket.status !== "cooking") return "ok";
  const minutes = elapsedSeconds(ticket.createdAt, now) / 60;
  const target = Math.max(1, ticket.targetMinutes || 15);
  if (minutes > target) return "critical";
  if (minutes >= target * 0.6) return "warn";
  return "ok";
}

const STATUS_RANK: Record<HubStatus, number> = { waiting: 1, processing: 2, ready: 3, delivering: 4, done: 5 };

/** Urutan: SLA kritis → menunggu terlama → sedang diproduksi → siap. */
export function sortHubTickets<T extends TicketLike>(tickets: T[], now: number, mode: HubSortMode = "priority"): T[] {
  const time = (t: T) => new Date(t.createdAt).getTime();
  const tie = (a: T, b: T) => time(a) - time(b) || a.ticketNo.localeCompare(b.ticketNo);
  if (mode === "oldest") return [...tickets].sort(tie);
  if (mode === "newest") return [...tickets].sort((a, b) => -tie(a, b));
  return [...tickets].sort((a, b) => {
    const ca = slaLevelOf(a, now) === "critical" ? 0 : 1;
    const cb = slaLevelOf(b, now) === "critical" ? 0 : 1;
    if (ca !== cb) return ca - cb;
    const ra = STATUS_RANK[hubStatusOf(a)];
    const rb = STATUS_RANK[hubStatusOf(b)];
    return ra - rb || tie(a, b);
  });
}

/**
 * Jangan memindahkan kartu yang sedang dipakai operator: kunci (hover/fokus/
 * konfirmasi/sibuk) tetap di posisi lamanya; kartu lain mengisi sisa slot
 * menurut urutan baru. Kunci yang hilang dari data (sudah selesai) diabaikan.
 */
export function stabilizeOrder(previous: string[], next: string[], locked: Iterable<string>): string[] {
  const nextSet = new Set(next);
  const pinned = new Map<number, string>();
  for (const key of locked) {
    const index = previous.indexOf(key);
    if (index >= 0 && nextSet.has(key) && index < next.length) pinned.set(index, key);
  }
  if (!pinned.size) return next;
  const pinnedKeys = new Set(pinned.values());
  const rest = next.filter((key) => !pinnedKeys.has(key));
  const out: string[] = [];
  for (let i = 0; i < next.length; i += 1) {
    out.push(pinned.get(i) ?? (rest.shift() as string));
  }
  return out;
}

export type DensityId = "auto" | "8" | "12" | "15" | "18" | "24";

export const DENSITY_PRESETS: Array<{ id: Exclude<DensityId, "auto">; cols: number; rows: number; label: string }> = [
  { id: "8", cols: 4, rows: 2, label: "8 · tablet" },
  { id: "12", cols: 4, rows: 3, label: "12" },
  { id: "15", cols: 5, rows: 3, label: "15 · standar" },
  { id: "18", cols: 6, rows: 3, label: "18 · padat" },
  { id: "24", cols: 6, rows: 4, label: "24 · layar besar" },
];

/** Ukuran minimum kartu agar teks tetap terbaca (px). */
export const CARD_MIN_WIDTH = 236;
export const CARD_MIN_HEIGHT = 196;

/**
 * Grid sesuai ruang yang tersedia. Preset dipakai hanya bila kartunya masih
 * memenuhi ukuran minimum; bila tidak, turun ke grid terbesar yang terbaca.
 */
export function resolveGrid(density: DensityId, width: number, height: number, gap = 8) {
  const fits = (cols: number, rows: number) =>
    (width - gap * (cols - 1)) / cols >= CARD_MIN_WIDTH && (height - gap * (rows - 1)) / rows >= CARD_MIN_HEIGHT;
  const maxCols = Math.max(1, Math.min(6, Math.floor((width + gap) / (CARD_MIN_WIDTH + gap))));
  const maxRows = Math.max(1, Math.min(4, Math.floor((height + gap) / (CARD_MIN_HEIGHT + gap))));
  if (density !== "auto") {
    const preset = DENSITY_PRESETS.find((p) => p.id === density);
    if (preset && fits(preset.cols, preset.rows)) return { cols: preset.cols, rows: preset.rows, clamped: false };
    if (preset) {
      return { cols: Math.min(preset.cols, maxCols), rows: Math.min(preset.rows, maxRows), clamped: true };
    }
  }
  // Auto (brief V4): 1920×1080 → 5×3 = 15, tablet landscape → 4×2 = 8, layar ≥2200px → 6×4 = 24.
  const cols = width >= 2200 ? 6 : width >= 1450 ? 5 : width >= 920 ? 4 : width >= 640 ? 3 : width >= 420 ? 2 : 1;
  const rows = height >= 1150 ? 4 : height >= 700 ? 3 : height >= 420 ? 2 : 1;
  return { cols: Math.max(1, Math.min(cols, maxCols)), rows: Math.max(1, Math.min(rows, maxRows)), clamped: false };
}

/**
 * Item yang muat di kartu berukuran tetap. Catatan item menghabiskan satu baris
 * tambahan; sisa item jadi "+N item lainnya" (detail lengkap di lembar detail).
 */
export function fitItems<T extends { note: string | null }>(items: T[], maxLines: number) {
  const visible: T[] = [];
  let used = 0;
  for (let i = 0; i < items.length; i += 1) {
    const cost = 1 + (items[i].note ? 1 : 0);
    // Sisakan satu baris untuk "+N item lainnya" bila masih ada item setelah ini.
    const reserve = i < items.length - 1 ? 1 : 0;
    if (used + cost + reserve > maxLines) {
      if (visible.length === 0) visible.push(items[i]);
      break;
    }
    visible.push(items[i]);
    used += cost;
  }
  return { visible, hidden: items.length - visible.length };
}

/**
 * Area "Semua": tiket Bar & Dapur dari order yang sama ditaruh berdampingan
 * (posisi mengikuti tiket order itu yang paling depan), supaya satu order
 * terbaca sebagai satu kelompok tanpa menggabung aksi per station.
 */
export function groupSiblings<T>(list: T[], orderOf: (item: T) => string | null): T[] {
  const byOrder = new Map<string, T[]>();
  for (const item of list) {
    const key = orderOf(item);
    if (key) byOrder.set(key, [...(byOrder.get(key) ?? []), item]);
  }
  const seen = new Set<string>();
  const out: T[] = [];
  for (const item of list) {
    const key = orderOf(item);
    if (!key) {
      out.push(item);
      continue;
    }
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(...(byOrder.get(key) ?? [item]));
  }
  return out;
}
