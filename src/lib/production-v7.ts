// =============================================================================
// Production V7 — aturan murni Command Center (tanpa DB/React).
//
//   FIFO       : urutan = waktu tiket masuk dari SERVER + nomor tiket (penentu seri). Urutan render browser
//                tidak pernah dipakai. SLA telat TIDAK menggeser FIFO; hanya override resmi (Owner/Manajer,
//                beralasan, teraudit) yang mendahulukan tiket.
//   Kolom      : MENUNGGU · DIPROSES · SIAP. Tiket aktif tidak pernah dibuang oleh waktu, halaman, atau batas.
//   Indikator  : setiap indikator menjelaskan APA, KENAPA, SIAPA yang terdampak, dan TINDAKAN — serta jenisnya:
//                fakta terverifikasi, hitungan, atau saran. Tidak ada prediksi tanpa data.
//
// Ambang waktu memakai SlaConfig dari Pengaturan outlet (production-sla.ts) — tidak ada angka SLA baru di sini.
// =============================================================================

import type {
  ProductionBatchSuggestionView,
  ProductionBatchView,
  ProductionStationLoad,
  ProductionTicketView,
} from "@/lib/garage-api-types";
import { hubTableNumber } from "@/lib/production-hub-v4";
import { DEFAULT_SLA_CONFIG, slaStateOf, type SlaConfig } from "@/lib/production-sla";

type Station = "Bar" | "Food";
type FifoTicket = Pick<ProductionTicketView, "ticketNo" | "createdAt" | "fifoOverride">;

const time = (iso: string) => new Date(iso).getTime();
const minutesBetween = (fromIso: string, to: number) => Math.max(0, Math.floor((to - time(fromIso)) / 60_000));
export const stationName = (station: Station) => (station === "Bar" ? "Bar" : "Dapur");

/** Pembanding FIFO: override resmi lebih dulu (yang di-override lebih awal di depan), lalu waktu masuk, lalu nomor tiket. */
export function fifoCompare(a: FifoTicket, b: FifoTicket): number {
  const oa = a.fifoOverride ? 0 : 1;
  const ob = b.fifoOverride ? 0 : 1;
  if (oa !== ob) return oa - ob;
  if (a.fifoOverride && b.fifoOverride) {
    const diff = time(a.fifoOverride.at) - time(b.fifoOverride.at);
    if (diff) return diff;
  }
  return time(a.createdAt) - time(b.createdAt) || a.ticketNo.localeCompare(b.ticketNo);
}

export function fifoSort<T extends FifoTicket>(tickets: readonly T[]): T[] {
  return [...tickets].sort(fifoCompare);
}

/** Hari operasional WIB ("YYYY-MM-DD") dari stempel waktu server. */
export function wibDay(iso: string | number): string {
  const ms = typeof iso === "number" ? iso : time(iso);
  return new Date(ms + 7 * 3_600_000).toISOString().slice(0, 10);
}

export type BoardColumns<T> = {
  waiting: T[];
  processing: T[];
  /** Siap hari ini (urut paling lama siap lebih dulu). */
  ready: T[];
  /** Siap dari hari sebelumnya: TETAP dapat diakses (dikelompokkan), tidak pernah dihapus otomatis. */
  readyEarlier: T[];
};

/**
 * Bagi tiket ke tiga kolom. Tidak ada tiket yang dibuang: jumlah keempat daftar = jumlah tiket aktif yang masuk.
 * Tiket berstatus lain (mis. sudah diantar) bukan tiket aktif dan tidak dikirim server ke papan.
 */
export function boardColumns<T extends ProductionTicketView>(tickets: readonly T[], now: number): BoardColumns<T> {
  const today = wibDay(now);
  const readyAll = tickets.filter((t) => t.status === "ready");
  const byReady = (a: T, b: T) => time(a.readyAt ?? a.createdAt) - time(b.readyAt ?? b.createdAt) || a.ticketNo.localeCompare(b.ticketNo);
  const isToday = (t: T) => wibDay(t.readyAt ?? t.createdAt) === today;
  return {
    waiting: fifoSort(tickets.filter((t) => t.status === "queue")),
    processing: fifoSort(tickets.filter((t) => t.status === "cooking")),
    ready: readyAll.filter(isToday).sort(byReady),
    readyEarlier: readyAll.filter((t) => !isToday(t)).sort(byReady),
  };
}

/** Posisi FIFO (1 = paling dulu) di antrean MENUNGGU per station — yang dikerjakan duluan. */
export function fifoPositions(tickets: readonly ProductionTicketView[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const station of ["Bar", "Food"] as const) {
    fifoSort(tickets.filter((t) => t.status === "queue" && t.station === station)).forEach((t, index) => out.set(t.ticketNo, index + 1));
  }
  return out;
}

/**
 * Keadilan FIFO untuk batch: berapa pesanan MENUNGGU di station yang sama yang masuk lebih dulu daripada
 * porsi tertua di batch ini tetapi TIDAK ikut batch. > 0 berarti memulai batch sekarang melompati mereka.
 * Hanya hitungan dari data papan — bukan larangan; keputusan tetap di staf.
 */
export function batchFifoAhead(
  batch: { station: Station; ticketNos: readonly string[] },
  tickets: readonly ProductionTicketView[],
): { count: number; first: ProductionTicketView | null } {
  const inBatch = new Set(batch.ticketNos);
  const waiting = fifoSort(tickets.filter((t) => t.status === "queue" && t.station === batch.station));
  const firstInBatch = waiting.findIndex((t) => inBatch.has(t.ticketNo));
  if (firstInBatch <= 0) return { count: 0, first: null };
  const ahead = waiting.slice(0, firstInBatch);
  return { count: ahead.length, first: ahead[0] ?? null };
}

/** Nomor antrean harian yang stabil: "#0012". Null bila order tidak punya nomor antrean. */
export function queueLabel(queueNo: number | null | undefined): string | null {
  return typeof queueNo === "number" && queueNo > 0 ? `#${String(queueNo).padStart(4, "0")}` : null;
}

/** Nomor meja besar di kartu: "08" untuk meja, teks pendek untuk tanpa meja. */
export function jumboTable(table: string): { kind: "table"; value: string } | { kind: "pickup"; value: string } {
  const n = hubTableNumber(table);
  if (n) return { kind: "table", value: String(n).padStart(2, "0") };
  const t = table.trim();
  return { kind: "pickup", value: /^deliv/i.test(t) ? "DELIVERY" : /^(take|bawa|pickup|ambil)/i.test(t) || !t ? "TAKEAWAY" : t.toUpperCase().slice(0, 12) };
}

export type OrderProgress = { readyQty: number; totalQty: number; percent: number; stations: Array<{ station: Station; readyQty: number; totalQty: number; status: string }> };

/**
 * Progres order dari data item yang BENAR-BENAR selesai (status item "ready" atau tiketnya sudah siap).
 * `tickets` = semua tiket aktif order itu (Bar + Dapur). Tiket station lain yang sudah diantar tidak lagi ada di
 * papan, jadi progres ini menyatakan "dari tiket yang masih di papan".
 */
export function orderProgress(tickets: readonly ProductionTicketView[]): OrderProgress {
  const stations = tickets.map((t) => {
    const totalQty = t.items.reduce((sum, item) => sum + item.qty, 0);
    const readyQty = t.status === "ready" ? totalQty : t.items.filter((item) => item.status === "ready").reduce((sum, item) => sum + item.qty, 0);
    return { station: t.station, readyQty, totalQty, status: t.status };
  });
  const totalQty = stations.reduce((sum, s) => sum + s.totalQty, 0);
  const readyQty = stations.reduce((sum, s) => sum + s.readyQty, 0);
  return { readyQty, totalQty, percent: totalQty ? Math.round((readyQty / totalQty) * 100) : 0, stations };
}

// ─── KPI ─────────────────────────────────────────────────────────────────────

export type ProductionKpis = {
  waiting: number;
  processing: number;
  ready: number;
  overdue: number;
  /** Menit tunggu tiket MENUNGGU terlama; null = tidak ada yang menunggu. */
  oldestWaitingMinutes: number | null;
  activeBatches: number;
  batchSuggestions: number;
};

export function productionKpis(input: {
  tickets: readonly ProductionTicketView[];
  batches: readonly Pick<ProductionBatchView, "station">[];
  suggestions: readonly Pick<ProductionBatchSuggestionView, "station">[];
  now: number;
  sla?: SlaConfig;
  busyExtra?: Record<Station, number>;
}): ProductionKpis {
  const cfg = input.sla ?? DEFAULT_SLA_CONFIG;
  const waiting = input.tickets.filter((t) => t.status === "queue");
  const overdue = input.tickets.filter(
    (t) => (t.status === "queue" || t.status === "cooking") && slaStateOf(t, input.now, cfg, { busyExtraMinutes: input.busyExtra?.[t.station] ?? 0 }).level === "critical",
  );
  const oldest = fifoSort(waiting.map((t) => ({ ...t, fifoOverride: null })))[0];
  return {
    waiting: waiting.length,
    processing: input.tickets.filter((t) => t.status === "cooking").length,
    ready: input.tickets.filter((t) => t.status === "ready").length,
    overdue: overdue.length,
    oldestWaitingMinutes: oldest ? minutesBetween(oldest.createdAt, input.now) : null,
    activeBatches: input.batches.length,
    batchSuggestions: input.suggestions.length,
  };
}

// ─── Indikator cerdas ────────────────────────────────────────────────────────

export type IndicatorLevel = "info" | "warn" | "critical";
/** fakta = langsung dari data tersimpan; hitungan = dihitung dari data; saran = rekomendasi tindakan. */
export type IndicatorKind = "fakta" | "hitungan" | "saran";

export type ProductionIndicator = {
  code: string;
  level: IndicatorLevel;
  kind: IndicatorKind;
  /** APA yang terjadi. */
  title: string;
  /** KENAPA (dasar datanya). */
  why: string;
  /** Tiket yang terdampak (untuk membuka detail / menyorot kartu). */
  ticketNos: string[];
  station: Station | null;
  /** TINDAKAN yang disarankan. */
  action: string;
};

const LEVEL_RANK: Record<IndicatorLevel, number> = { critical: 0, warn: 1, info: 2 };
const refOf = (t: Pick<ProductionTicketView, "orderNo" | "ticketNo" | "table">) => {
  const table = jumboTable(t.table);
  return `#${t.orderNo ?? t.ticketNo} (${table.kind === "table" ? `Meja ${table.value}` : table.value})`;
};
const listRefs = (tickets: readonly ProductionTicketView[], max = 3) =>
  tickets.slice(0, max).map(refOf).join(", ") + (tickets.length > max ? ` +${tickets.length - max} lainnya` : "");

export function productionIndicators(input: {
  tickets: readonly ProductionTicketView[];
  suggestions: readonly ProductionBatchSuggestionView[];
  load: readonly ProductionStationLoad[];
  now: number;
  sla?: SlaConfig;
  busyExtra?: Record<Station, number>;
  truncated?: { shown: number; total: number } | null;
}): ProductionIndicator[] {
  const cfg = input.sla ?? DEFAULT_SLA_CONFIG;
  const { tickets, now } = input;
  const out: ProductionIndicator[] = [];
  const extra = (t: ProductionTicketView) => input.busyExtra?.[t.station] ?? 0;
  const producing = tickets.filter((t) => t.status === "queue" || t.status === "cooking");

  // 1. Lewat target (fakta dari waktu masuk server + target tiket).
  const overdue = fifoSort(producing.filter((t) => slaStateOf(t, now, cfg, { busyExtraMinutes: extra(t) }).level === "critical"));
  if (overdue.length) {
    out.push({
      code: "OVERDUE",
      level: "critical",
      kind: "hitungan",
      title: `${overdue.length} pesanan lewat target waktu`,
      why: `Waktu sejak masuk sudah melebihi target tiket: ${listRefs(overdue)}.`,
      ticketNos: overdue.map((t) => t.ticketNo),
      station: null,
      action: "Kerjakan sesuai urutan FIFO; kabari kasir/waiter bila pelanggan perlu diberi tahu.",
    });
  }

  // 2. Hampir telat.
  const risk = fifoSort(producing.filter((t) => slaStateOf(t, now, cfg, { busyExtraMinutes: extra(t) }).level === "warn"));
  if (risk.length) {
    out.push({
      code: "SLA_RISK",
      level: "warn",
      kind: "hitungan",
      title: `${risk.length} pesanan mendekati target / belum dimulai`,
      why: `Belum dimulai ≥ ${cfg.startTargetMinutes} mnt atau sisa waktu target menipis: ${listRefs(risk)}.`,
      ticketNos: risk.map((t) => t.ticketNo),
      station: null,
      action: "Mulai pesanan terdepan di antrean.",
    });
  }

  // 3. Pesanan menunggu terlama per station.
  for (const station of ["Bar", "Food"] as const) {
    const waiting = fifoSort(tickets.filter((t) => t.status === "queue" && t.station === station));
    const first = waiting[0];
    if (!first) continue;
    out.push({
      code: `OLDEST_WAITING_${station}`,
      level: "info",
      kind: "fakta",
      title: `${stationName(station)}: giliran berikutnya ${refOf(first)}`,
      why: first.fifoOverride
        ? `Didahulukan oleh ${first.fifoOverride.byName ?? "manajemen"}: ${first.fifoOverride.reason}.`
        : `Masuk paling awal di antrean ${stationName(station)} (${minutesBetween(first.createdAt, now)} mnt lalu), ${waiting.length} pesanan menunggu.`,
      ticketNos: [first.ticketNo],
      station,
      action: "Kerjakan pesanan ini lebih dulu.",
    });
  }

  // 4. Konflik FIFO: ada tiket DIPROSES yang masuk SETELAH tiket yang masih MENUNGGU di station yang sama.
  for (const station of ["Bar", "Food"] as const) {
    const own = tickets.filter((t) => t.station === station);
    const skipped = fifoSort(
      own.filter(
        (w) =>
          w.status === "queue" &&
          !w.pendingCancel &&
          own.some((p) => p.status === "cooking" && !p.fifoOverride && time(p.createdAt) > time(w.createdAt)),
      ),
    );
    if (skipped.length) {
      out.push({
        code: `FIFO_CONFLICT_${station}`,
        level: "warn",
        kind: "fakta",
        title: `${stationName(station)}: ${skipped.length} pesanan lebih awal terlewati`,
        why: `Ada pesanan yang masuk belakangan sudah diproses, sementara ${listRefs(skipped)} masih menunggu.`,
        ticketNos: skipped.map((t) => t.ticketNo),
        station,
        action: "Mulai pesanan yang terlewat. Bila sengaja didahulukan, Owner/Manajer mencatatnya lewat Dahulukan.",
      });
    }
  }

  // 5. Diproses terlalu lama (2× target sejak mulai) — kemungkinan lupa ditandai selesai.
  const stuck = fifoSort(tickets.filter((t) => t.status === "cooking" && t.acceptedAt && minutesBetween(t.acceptedAt, now) >= Math.max(1, t.targetMinutes) * 2));
  if (stuck.length) {
    out.push({
      code: "STUCK",
      level: "warn",
      kind: "hitungan",
      title: `${stuck.length} pesanan diproses sangat lama`,
      why: `Sudah diproses ≥ 2× target tiketnya: ${listRefs(stuck)}.`,
      ticketNos: stuck.map((t) => t.ticketNo),
      station: null,
      action: "Cek fisik: bila sudah jadi, tandai Selesaikan; bila ada kendala, laporkan.",
    });
  }

  // 6. Siap tetapi belum diantar/diambil melewati batas antar.
  const held = tickets
    .filter((t) => t.status === "ready" && minutesBetween(t.readyAt ?? t.createdAt, now) > cfg.deliverTargetMinutes)
    .sort((a, b) => time(a.readyAt ?? a.createdAt) - time(b.readyAt ?? b.createdAt));
  if (held.length) {
    out.push({
      code: "READY_HOLD",
      level: "warn",
      kind: "hitungan",
      title: `${held.length} pesanan siap belum diantar/diambil`,
      why: `Sudah siap lebih dari ${cfg.deliverTargetMinutes} mnt: ${listRefs(held)}.`,
      ticketNos: held.map((t) => t.ticketNo),
      station: null,
      action: "Panggil waiter / serahkan ke pelanggan, lalu tandai selesai antar.",
    });
  }

  // 7. Siap dari hari sebelumnya (kesinambungan shift).
  const today = wibDay(now);
  const carried = tickets.filter((t) => t.status === "ready" && wibDay(t.readyAt ?? t.createdAt) !== today);
  if (carried.length) {
    out.push({
      code: "SHIFT_CARRYOVER",
      level: "info",
      kind: "fakta",
      title: `${carried.length} pesanan siap dari hari sebelumnya belum ditutup`,
      why: "Tiket tidak pernah dihapus otomatis; tiket ini belum ditandai diantar/diambil.",
      ticketNos: carried.map((t) => t.ticketNo),
      station: null,
      action: "Pastikan pesanan sudah diterima pelanggan, lalu tandai Ambil / Selesai Antar.",
    });
  }

  // 8. Kesiapan lintas station: satu bagian order siap, bagian lain belum.
  const byOrder = new Map<string, ProductionTicketView[]>();
  for (const t of tickets) if (t.orderId) byOrder.set(t.orderId, [...(byOrder.get(t.orderId) ?? []), t]);
  const partial: ProductionTicketView[] = [];
  for (const group of byOrder.values()) {
    const ready = group.filter((t) => t.status === "ready");
    const pending = group.filter((t) => t.status !== "ready");
    if (ready.length && pending.length) partial.push(...pending);
  }
  if (partial.length) {
    out.push({
      code: "MULTI_STATION_WAIT",
      level: "info",
      kind: "fakta",
      title: `${partial.length} tiket menahan order yang sebagian sudah siap`,
      why: `Station lain sudah siap, bagian ini belum: ${listRefs(fifoSort(partial))}.`,
      ticketNos: fifoSort(partial).map((t) => t.ticketNo),
      station: null,
      action: "Order belum lengkap sampai semua station siap — selesaikan bagian ini.",
    });
  }

  // 9. Peluang Smart Batch (dari saran server: produk + varian + catatan sama).
  if (input.suggestions.length) {
    const top = [...input.suggestions].sort((a, b) => b.totalQty - a.totalQty)[0];
    out.push({
      code: "BATCH_OPPORTUNITY",
      level: "info",
      kind: "saran",
      title: `${input.suggestions.length} peluang batch — terbesar ${top.itemLabel} ×${top.totalQty}`,
      why: `Item yang sama (produk, varian, catatan) dipesan di ${top.items.length} tiket.`,
      ticketNos: [...new Set(top.items.map((i) => i.ticketNo))],
      station: top.station,
      action: "Buka Batch untuk membuatnya sekaligus. Kartu pesanan asal tetap ada.",
    });
  }

  // 10. Beban station / mode ramai.
  for (const l of input.load) {
    const active = l.waiting + l.processing;
    if (cfg.busyThreshold > 0 && active >= cfg.busyThreshold) {
      out.push({
        code: `STATION_BUSY_${l.station}`,
        level: "warn",
        kind: "hitungan",
        title: `${stationName(l.station)} ramai: ${active} tiket aktif`,
        why: `Batas mode ramai di Pengaturan = ${cfg.busyThreshold} tiket. Menunggu ${l.waiting}, diproses ${l.processing}.`,
        ticketNos: [],
        station: l.station,
        action: "Pertimbangkan bantuan helper atau batch untuk item yang sama.",
      });
    }
  }
  const [bar, food] = [input.load.find((l) => l.station === "Bar"), input.load.find((l) => l.station === "Food")];
  if (bar && food) {
    const heavy = bar.waiting - food.waiting >= 5 ? bar : food.waiting - bar.waiting >= 5 ? food : null;
    const light = heavy === bar ? food : bar;
    if (heavy && light.waiting + light.processing === 0) {
      out.push({
        code: "BOTTLENECK",
        level: "warn",
        kind: "saran",
        title: `Antrean menumpuk di ${stationName(heavy.station)}`,
        why: `${stationName(heavy.station)} punya ${heavy.waiting} pesanan menunggu, ${stationName(light.station)} sedang kosong.`,
        ticketNos: [],
        station: heavy.station,
        action: `Bila memungkinkan, staf ${stationName(light.station)} membantu ${stationName(heavy.station)}.`,
      });
    }
  }

  // 11. Override prioritas aktif (transparansi).
  const overridden = producing.filter((t) => t.fifoOverride);
  if (overridden.length) {
    out.push({
      code: "FIFO_OVERRIDE",
      level: "info",
      kind: "fakta",
      title: `${overridden.length} pesanan didahulukan dari FIFO`,
      why: overridden.map((t) => `${refOf(t)} oleh ${t.fifoOverride?.byName ?? "manajemen"}: ${t.fifoOverride?.reason}`).join("; "),
      ticketNos: overridden.map((t) => t.ticketNo),
      station: null,
      action: "Tercatat di audit. Owner/Manajer bisa mengembalikannya ke FIFO dari detail pesanan.",
    });
  }

  // 12. Menunggu persetujuan batal.
  const cancelling = producing.filter((t) => t.pendingCancel);
  if (cancelling.length) {
    out.push({
      code: "PENDING_CANCEL",
      level: "warn",
      kind: "fakta",
      title: `${cancelling.length} pesanan menunggu persetujuan batal`,
      why: `Ada pengajuan batal yang belum diputuskan: ${listRefs(cancelling)}.`,
      ticketNos: cancelling.map((t) => t.ticketNo),
      station: null,
      action: "Jangan dibuat dulu sampai Owner/Manajer memutuskan.",
    });
  }

  // 13. Data tidak lengkap (tiket tanpa rincian item).
  const empty = tickets.filter((t) => t.items.length === 0);
  if (empty.length) {
    out.push({
      code: "MISSING_ITEMS",
      level: "warn",
      kind: "fakta",
      title: `${empty.length} tiket tanpa rincian item`,
      why: `Tidak ada item tercatat pada ${listRefs(empty)}.`,
      ticketNos: empty.map((t) => t.ticketNo),
      station: null,
      action: "Tanyakan ke kasir isi pesanannya sebelum dibuat.",
    });
  }

  // 14. Papan memuat sebagian (tidak pernah diam-diam).
  if (input.truncated) {
    out.push({
      code: "TRUNCATED",
      level: "critical",
      kind: "fakta",
      title: `Hanya ${input.truncated.shown} dari ${input.truncated.total} tiket aktif yang dimuat`,
      why: "Jumlah tiket aktif melebihi batas muat papan. Yang tampil adalah tiket TERLAMA; sisanya muncul setelah antrean berkurang.",
      ticketNos: [],
      station: null,
      action: "Tutup pesanan Siap yang sudah diterima pelanggan (Ambil / Selesai Antar) agar antrean berkurang.",
    });
  }

  return out.sort((a, b) => LEVEL_RANK[a.level] - LEVEL_RANK[b.level]);
}

// ─── Koneksi & kesegaran data ────────────────────────────────────────────────

export type SyncState = "connected" | "reconnecting" | "offline";

/**
 * Status sinkron yang ditampilkan di header. `stale` = data di layar lebih tua dari batas, apa pun sebabnya —
 * layar tidak pernah menampilkan antrean lama seolah-olah baru.
 */
export function syncHealth(input: { online: boolean; streamConnected: boolean; lastError: string | null; lastSyncAt: number | null; now: number; staleAfterMs?: number }) {
  const staleAfter = input.staleAfterMs ?? 45_000;
  const ageMs = input.lastSyncAt === null ? null : Math.max(0, input.now - input.lastSyncAt);
  const stale = ageMs === null ? false : ageMs > staleAfter;
  const state: SyncState = !input.online ? "offline" : input.lastError || stale ? "reconnecting" : "connected";
  const label = state === "offline" ? "OFFLINE" : state === "reconnecting" ? "MENYAMBUNG ULANG" : input.streamConnected ? "TERHUBUNG" : "TERHUBUNG (POLL)";
  return { state, label, stale: stale || state !== "connected", ageSeconds: ageMs === null ? null : Math.floor(ageMs / 1000) };
}
