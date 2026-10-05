// =============================================================================
// GARAGE CONTROL CENTER — engine keputusan (murni, tanpa DB, mudah diuji).
//
// Prinsip:
// - Urutan pelanggan = FIFO (createdAt). Prioritas produksi boleh dioptimalkan
//   (batch, SLA), tetapi tidak pernah mengorbankan order tertua: order yang
//   mendekati SLA selalu didahulukan ("LINDUNGI SLA").
// - Smart Batch memakai saran Production Hub (`buildBatchSuggestions`) — engine
//   ini hanya memberi skor & memilih, tidak membentuk batch sendiri.
// - Semua angka berasal dari data nyata; bila sampel kurang → null / "belum
//   cukup", tidak mengarang.
// - Bahasa tanpa menyalahkan orang: yang disebut station / order, bukan staf.
// Rumus lengkap: docs/CONTROL-CENTER.md
// =============================================================================

import type { ProductionBatchSuggestionView, ProductionTicketView } from "@/lib/garage-api-types";

export type OpsStation = "Bar" | "Food";
export type OpsStatusLevel = "normal" | "busy" | "rush" | "critical";
export type OpsSeverity = "critical" | "warning" | "info";

export type EngineTicket = Pick<
  ProductionTicketView,
  | "ticketNo"
  | "orderNo"
  | "station"
  | "status"
  | "createdAt"
  | "acceptedAt"
  | "readyAt"
  | "handoverAt"
  | "targetMinutes"
  | "table"
  | "identity"
  | "items"
>;

/** Porsi SLA: mulai "berisiko" pada 80% target (sama dengan Production Hub). */
export const SLA_RISK_RATIO = 0.8;
/** READY lebih lama dari ini tanpa diambil = serving delay. */
export const READY_DELAY_MINUTES = 3;
/** Horizon kapasitas station (menit) untuk menghitung beban %. */
export const LOAD_HORIZON_MINUTES = 30;
/** Satu waiter dianggap sanggup memegang 4 antaran siap sekaligus. */
export const SERVING_CAPACITY_PER_WAITER = 4;

export const minutesBetween = (fromIso: string | Date, to: Date | number) => {
  const from = typeof fromIso === "string" ? new Date(fromIso).getTime() : fromIso.getTime();
  const end = typeof to === "number" ? to : to.getTime();
  return Math.max(0, (end - from) / 60000);
};

const isWaiting = (t: Pick<EngineTicket, "status">) => t.status === "queue";
const isActive = (t: Pick<EngineTicket, "status">) => t.status === "queue" || t.status === "cooking";

export function isAtSlaRisk(t: Pick<EngineTicket, "status" | "createdAt" | "targetMinutes">, now: Date) {
  return isActive(t) && minutesBetween(t.createdAt, now) >= Math.ceil(t.targetMinutes * SLA_RISK_RATIO);
}

export function isOverSla(t: Pick<EngineTicket, "status" | "createdAt" | "targetMinutes">, now: Date) {
  return isActive(t) && minutesBetween(t.createdAt, now) > t.targetMinutes;
}

// ---------------------------------------------------------------------------
// Batch Score
// ---------------------------------------------------------------------------

export type BatchScore = {
  score: number;
  label: "TINGGI" | "SEDANG" | "RENDAH";
  orders: number;
  /** Porsi − 1: berapa kali "mulai membuat" yang dihemat dibanding satu per satu. */
  setupsSaved: number;
  slaRisk: "AMAN" | "WASPADA" | "BERISIKO";
};

/**
 * Skor 0–100 = order (≤5 → 40) + porsi (≤10 → 30) + keamanan SLA (umur porsi
 * tertua <50% target → 30, <80% → 15, ≥80% → 0).
 */
export function batchScore(
  suggestion: Pick<ProductionBatchSuggestionView, "items" | "totalQty" | "oldestAt">,
  targetMinutes: number,
  now: Date,
): BatchScore {
  const orders = new Set(suggestion.items.map((i) => i.ticketNo)).size;
  const age = minutesBetween(suggestion.oldestAt, now);
  const ratio = targetMinutes > 0 ? age / targetMinutes : 0;
  const slaPoints = ratio < 0.5 ? 30 : ratio < SLA_RISK_RATIO ? 15 : 0;
  const score = Math.round(
    (Math.min(orders, 5) / 5) * 40 + (Math.min(suggestion.totalQty, 10) / 10) * 30 + slaPoints,
  );
  return {
    score,
    label: score >= 75 ? "TINGGI" : score >= 50 ? "SEDANG" : "RENDAH",
    orders,
    setupsSaved: Math.max(0, suggestion.totalQty - 1),
    slaRisk: slaPoints === 30 ? "AMAN" : slaPoints === 15 ? "WASPADA" : "BERISIKO",
  };
}

// ---------------------------------------------------------------------------
// Next Best Action (per station)
// ---------------------------------------------------------------------------

export type NextBestAction =
  | {
      kind: "batch";
      reason: "SMART_BATCH";
      station: OpsStation;
      suggestion: ProductionBatchSuggestionView;
      score: BatchScore;
      oldestMinutes: number;
    }
  | {
      kind: "ticket";
      reason: "SLA_PROTECTION" | "FIFO";
      station: OpsStation;
      ticket: EngineTicket;
      waitingMinutes: number;
    }
  | { kind: "idle"; station: OpsStation };

/** Batch minimal ini baru direkomendasikan di depan antrean FIFO biasa. */
export const BATCH_RECOMMEND_MIN_SCORE = 50;

export function nextBestAction(
  station: OpsStation,
  tickets: EngineTicket[],
  suggestions: ProductionBatchSuggestionView[],
  now: Date,
): NextBestAction {
  const waiting = tickets
    .filter((t) => t.station === station && isWaiting(t))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  if (waiting.length === 0) return { kind: "idle", station };

  const oldest = waiting[0];
  const target = oldest.targetMinutes;
  const scored = suggestions
    .filter((s) => s.station === station)
    .map((s) => ({ s, score: batchScore(s, target, now) }))
    .sort((a, b) => b.score.score - a.score.score);
  const covers = (s: ProductionBatchSuggestionView, ticketNo: string) =>
    s.items.some((i) => i.ticketNo === ticketNo);

  // 1) Lindungi order tertua yang mendekati SLA: batch hanya boleh menang bila
  //    batch itu sendiri sudah memuat order tersebut.
  if (isAtSlaRisk(oldest, now)) {
    const rescue = scored.find(({ s }) => covers(s, oldest.ticketNo));
    if (rescue) {
      return {
        kind: "batch",
        reason: "SMART_BATCH",
        station,
        suggestion: rescue.s,
        score: rescue.score,
        oldestMinutes: minutesBetween(rescue.s.oldestAt, now),
      };
    }
    return {
      kind: "ticket",
      reason: "SLA_PROTECTION",
      station,
      ticket: oldest,
      waitingMinutes: minutesBetween(oldest.createdAt, now),
    };
  }

  // 2) Smart batch layak: utamakan batch yang memuat order tertua (anti starvasi),
  //    lalu skor tertinggi. Batch tidak boleh membuat order lain lewat SLA:
  //    order tertua sudah dicek aman di atas.
  const eligible = scored.filter(({ score }) => score.score >= BATCH_RECOMMEND_MIN_SCORE);
  const pick = eligible.find(({ s }) => covers(s, oldest.ticketNo)) ?? eligible[0];
  if (pick) {
    return {
      kind: "batch",
      reason: "SMART_BATCH",
      station,
      suggestion: pick.s,
      score: pick.score,
      oldestMinutes: minutesBetween(pick.s.oldestAt, now),
    };
  }

  // 3) FIFO biasa.
  return {
    kind: "ticket",
    reason: "FIFO",
    station,
    ticket: oldest,
    waitingMinutes: minutesBetween(oldest.createdAt, now),
  };
}

// ---------------------------------------------------------------------------
// Beban station
// ---------------------------------------------------------------------------

/** Minimal sampel produksi hari ini agar durasi kerja nyata dipakai. */
export const LOAD_MIN_SAMPLES = 5;
/** Tanpa sampel cukup: durasi kerja per tiket diasumsikan 50% target SLA. */
export const LOAD_FALLBACK_RATIO = 0.5;

/**
 * Durasi kerja per tiket (menit): rata-rata produksi nyata hari ini
 * (acceptedAt → readyAt) bila ≥ 5 sampel; selain itu 50% target SLA.
 * Target SLA adalah BATAS waktu, bukan lama membuat — jadi tidak dipakai mentah.
 */
export function workMinutesPerTicket(avgProductionMinutes: number | null, samples: number, targetMinutes: number) {
  if (avgProductionMinutes != null && samples >= LOAD_MIN_SAMPLES) return avgProductionMinutes;
  return targetMinutes * LOAD_FALLBACK_RATIO;
}

/**
 * Beban % = menit kerja antre (tiket menunggu × durasi kerja + tiket sedang
 * dibuat × ½ durasi kerja) ÷ (staf hadir × horizon 30 menit) × 100. Staf minimal 1.
 */
export function stationLoadPct(
  tickets: EngineTicket[],
  station: OpsStation,
  staffOnShift: number,
  production: { avgMinutes: number | null; samples: number } = { avgMinutes: null, samples: 0 },
) {
  const workMinutes = tickets
    .filter((t) => t.station === station)
    .reduce((sum, t) => {
      const per = workMinutesPerTicket(production.avgMinutes, production.samples, t.targetMinutes);
      return sum + (t.status === "queue" ? per : t.status === "cooking" ? per * 0.5 : 0);
    }, 0);
  return Math.round((workMinutes / (Math.max(1, staffOnShift) * LOAD_HORIZON_MINUTES)) * 100);
}

/** Beban serving % = tiket READY ÷ (waiter hadir × 4) × 100. */
export function servingLoadPct(readyCount: number, waitersOnShift: number) {
  return Math.round((readyCount / (Math.max(1, waitersOnShift) * SERVING_CAPACITY_PER_WAITER)) * 100);
}

export const loadLevel = (pct: number) =>
  pct >= 90 ? "KRITIS" : pct >= 70 ? "TINGGI" : pct >= 40 ? "SEDANG" : "RENDAH";

// ---------------------------------------------------------------------------
// Status operasional
// ---------------------------------------------------------------------------

export type OpsStatus = { level: OpsStatusLevel; label: string; reasons: string[] };

export type OpsStatusInput = {
  waiting: number;
  overSla: number;
  slaRisk: number;
  readyDelayed: number;
  oldestWaitingMinutes: number | null;
  /** Target SLA station dari order tertua (menit). */
  oldestTargetMinutes: number | null;
  maxLoadPct: number;
};

const STATUS_LABEL: Record<OpsStatusLevel, string> = {
  normal: "NORMAL",
  busy: "SIBUK",
  rush: "RUSH",
  critical: "KRITIS",
};

/**
 * Bukan hanya jumlah order: gabungan lewat SLA, risiko SLA, umur order
 * tertua vs target, beban station, dan antaran siap yang tertahan.
 */
export function opsStatus(input: OpsStatusInput): OpsStatus {
  const reasons: string[] = [];
  const oldestRatio =
    input.oldestWaitingMinutes != null && input.oldestTargetMinutes
      ? input.oldestWaitingMinutes / input.oldestTargetMinutes
      : 0;

  let level: OpsStatusLevel = "normal";
  const raise = (next: OpsStatusLevel, reason: string) => {
    const rank: OpsStatusLevel[] = ["normal", "busy", "rush", "critical"];
    if (rank.indexOf(next) > rank.indexOf(level)) level = next;
    reasons.push(reason);
  };

  if (input.overSla >= 3 || oldestRatio >= 2 || input.maxLoadPct >= 130) {
    raise("critical", input.overSla >= 3 ? `${input.overSla} order lewat SLA` : oldestRatio >= 2 ? "Order tertua 2× melewati target" : `Beban station ${input.maxLoadPct}%`);
  }
  if (input.overSla >= 1 || input.slaRisk >= 3 || input.maxLoadPct >= 90 || input.waiting >= 8) {
    raise(
      "rush",
      input.overSla >= 1
        ? `${input.overSla} order lewat SLA`
        : input.slaRisk >= 3
          ? `${input.slaRisk} order mendekati SLA`
          : input.maxLoadPct >= 90
            ? `Beban station ${input.maxLoadPct}%`
            : `${input.waiting} order menunggu`,
    );
  }
  if (input.slaRisk >= 1 || input.maxLoadPct >= 60 || input.waiting >= 4 || input.readyDelayed >= 1) {
    raise(
      "busy",
      input.readyDelayed >= 1
        ? `${input.readyDelayed} pesanan siap belum diantar`
        : input.slaRisk >= 1
          ? `${input.slaRisk} order mendekati SLA`
          : input.maxLoadPct >= 60
            ? `Beban station ${input.maxLoadPct}%`
            : `${input.waiting} order menunggu`,
    );
  }
  if (level === "normal") reasons.push("Antrean lancar");
  return { level, label: STATUS_LABEL[level], reasons: [...new Set(reasons)].slice(0, 3) };
}

// ---------------------------------------------------------------------------
// Bottleneck + alert
// ---------------------------------------------------------------------------

export type OpsBottleneck = {
  area: "Bar" | "Dapur" | "Serving" | "Stok";
  loadPct: number | null;
  oldestMinutes: number | null;
  slaRisk: number;
  recommendation: string;
};

export type OpsAlert = {
  id: string;
  severity: OpsSeverity;
  title: string;
  description: string;
  source: "produksi" | "serving" | "stok" | "batch";
  /** Modul tujuan tombol aksi. */
  actionModule: "kitchen" | "waiter" | "inventory" | null;
  actionLabel: string | null;
};

export const stationName = (s: OpsStation) => (s === "Bar" ? "Bar" : "Dapur");

export type StationSnapshot = {
  station: OpsStation;
  loadPct: number;
  waiting: number;
  oldestMinutes: number | null;
  slaRisk: number;
  overSla: number;
  topBatchLabel: string | null;
};

export function detectBottlenecks(
  stations: StationSnapshot[],
  serving: { loadPct: number; delayed: number; oldestReadyMinutes: number | null },
  lowStockCount: number,
): OpsBottleneck[] {
  const out: OpsBottleneck[] = [];
  for (const s of stations) {
    if (s.loadPct >= 90 || s.overSla >= 1 || s.slaRisk >= 2) {
      out.push({
        area: stationName(s.station),
        loadPct: s.loadPct,
        oldestMinutes: s.oldestMinutes,
        slaRisk: s.slaRisk + s.overSla,
        recommendation: s.topBatchLabel
          ? `Dahulukan batch ${s.topBatchLabel}, lalu order tertua`
          : "Kerjakan order tertua lebih dulu (FIFO)",
      });
    }
  }
  if (serving.delayed >= 2 || serving.loadPct >= 90) {
    out.push({
      area: "Serving",
      loadPct: serving.loadPct,
      oldestMinutes: serving.oldestReadyMinutes,
      slaRisk: serving.delayed,
      recommendation: "Helper bantu antar pesanan siap",
    });
  }
  if (lowStockCount > 0) {
    out.push({
      area: "Stok",
      loadPct: null,
      oldestMinutes: null,
      slaRisk: 0,
      recommendation: `Cek ${lowStockCount} bahan menipis sebelum jam ramai`,
    });
  }
  return out;
}

export function buildAlerts(input: {
  stations: StationSnapshot[];
  readyDelayed: Array<{ ticketNo: string; table: string; minutes: number }>;
  batchOpportunities: number;
  lowStock: Array<{ name: string }>;
  batchStockRisks: Array<{ itemLabel: string; ingredients: string[] }>;
}): OpsAlert[] {
  const alerts: OpsAlert[] = [];
  for (const s of input.stations) {
    if (s.overSla > 0) {
      alerts.push({
        id: `sla-over-${s.station}`,
        severity: "critical",
        title: `${s.overSla} order ${stationName(s.station)} lewat SLA`,
        description: `Order tertua menunggu ${Math.floor(s.oldestMinutes ?? 0)} menit.`,
        source: "produksi",
        actionModule: "kitchen",
        actionLabel: "Buka Production",
      });
    } else if (s.slaRisk > 0) {
      alerts.push({
        id: `sla-risk-${s.station}`,
        severity: "warning",
        title: `${s.slaRisk} order ${stationName(s.station)} mendekati SLA`,
        description: "Dahulukan order tertua.",
        source: "produksi",
        actionModule: "kitchen",
        actionLabel: "Buka Production",
      });
    }
    if (s.loadPct >= 90) {
      alerts.push({
        id: `bottleneck-${s.station}`,
        severity: s.loadPct >= 130 ? "critical" : "warning",
        title: `${stationName(s.station)} tertahan · beban ${s.loadPct}%`,
        description: s.topBatchLabel ? `Saran: batch ${s.topBatchLabel}.` : "Kerjakan order tertua lebih dulu.",
        source: "produksi",
        actionModule: "kitchen",
        actionLabel: "Buka Production",
      });
    }
  }
  if (input.readyDelayed.length > 0) {
    const worst = input.readyDelayed[0];
    alerts.push({
      id: "ready-delay",
      severity: input.readyDelayed.length >= 3 ? "critical" : "warning",
      title: `${input.readyDelayed.length} pesanan siap belum diantar`,
      description: `${worst.table} siap ${Math.floor(worst.minutes)} menit lalu — menunggu runner.`,
      source: "serving",
      actionModule: "waiter",
      actionLabel: "Buka Waiter",
    });
  }
  for (const risk of input.batchStockRisks.slice(0, 2)) {
    alerts.push({
      id: `batch-stock-${risk.itemLabel}`,
      severity: "warning",
      title: `Stok bahan ${risk.itemLabel} menipis`,
      description: `Cek: ${risk.ingredients.slice(0, 3).join(", ")}.`,
      source: "stok",
      actionModule: "inventory",
      actionLabel: "Cek stok",
    });
  }
  if (input.lowStock.length > 0) {
    alerts.push({
      id: "low-stock",
      severity: "info",
      title: `${input.lowStock.length} bahan di bawah minimum`,
      description: input.lowStock
        .slice(0, 3)
        .map((i) => i.name)
        .join(", "),
      source: "stok",
      actionModule: "inventory",
      actionLabel: "Cek stok",
    });
  }
  if (input.batchOpportunities > 0) {
    alerts.push({
      id: "batch-available",
      severity: "info",
      title: `${input.batchOpportunities} peluang Smart Batch`,
      description: "Produk sama bisa dibuat sekaligus.",
      source: "batch",
      actionModule: "kitchen",
      actionLabel: "Buka Production",
    });
  }
  const rank: Record<OpsSeverity, number> = { critical: 0, warning: 1, info: 2 };
  return alerts.sort((a, b) => rank[a.severity] - rank[b.severity]);
}

// ---------------------------------------------------------------------------
// KPI helpers
// ---------------------------------------------------------------------------

export const avg = (values: number[]) =>
  values.length ? values.reduce((s, v) => s + v, 0) / values.length : null;

export const pct = (part: number, total: number) => (total > 0 ? Math.round((part / total) * 100) : null);

/** Perubahan % (negatif = lebih cepat untuk metrik waktu). null bila pembanding kosong. */
export function changePct(current: number | null, baseline: number | null) {
  if (current == null || baseline == null || baseline === 0) return null;
  return Math.round(((current - baseline) / baseline) * 1000) / 10;
}

// ---------------------------------------------------------------------------
// Forecast 60 menit
// ---------------------------------------------------------------------------

export type ForecastResult =
  | { status: "insufficient"; weeksWithData: number }
  | {
      status: "ok";
      expectedMin: number;
      expectedMax: number;
      expectedAvg: number;
      weeksWithData: number;
      bar: "RENDAH" | "SEDANG" | "TINGGI";
      kitchen: "RENDAH" | "SEDANG" | "TINGGI";
    };

/** Minimal minggu (hari yang sama) yang punya order agar forecast ditampilkan. */
export const FORECAST_MIN_WEEKS = 2;

/**
 * Forecast sederhana: jumlah order pada jendela jam yang sama, hari yang sama,
 * per minggu (4 minggu terakhir). Rentang = min–maks minggu yang ber-data.
 * Level station dari rata-rata tiket per station per jendela.
 */
export function forecastNext60(samples: Array<{ orders: number; barTickets: number; foodTickets: number }>): ForecastResult {
  const withData = samples.filter((s) => s.orders > 0);
  if (withData.length < FORECAST_MIN_WEEKS) {
    return { status: "insufficient", weeksWithData: withData.length };
  }
  const orders = withData.map((s) => s.orders);
  const level = (v: number) => (v >= 12 ? "TINGGI" : v >= 5 ? "SEDANG" : "RENDAH") as "RENDAH" | "SEDANG" | "TINGGI";
  return {
    status: "ok",
    expectedMin: Math.min(...orders),
    expectedMax: Math.max(...orders),
    expectedAvg: Math.round(avg(orders) ?? 0),
    weeksWithData: withData.length,
    bar: level(avg(withData.map((s) => s.barTickets)) ?? 0),
    kitchen: level(avg(withData.map((s) => s.foodTickets)) ?? 0),
  };
}

// ---------------------------------------------------------------------------
// Insight (hanya dari data; tidak ada sampel → tidak ada insight)
// ---------------------------------------------------------------------------

export type OpsInsight = { id: string; title: string; detail: string; recommendation: string };

export function buildInsights(input: {
  /** Order per jam (0–23) 7 hari terakhir, WIB. */
  ordersByHour7d: number[];
  /** Produk paling sering dibuat lewat batch (7 hari). */
  topBatched: { label: string; qty: number } | null;
  /** Rata-rata durasi saji per station hari ini & 7 hari (menit). */
  stationAvg: Array<{ station: OpsStation; today: number | null; week: number | null; samplesToday: number }>;
}): OpsInsight[] {
  const insights: OpsInsight[] = [];
  const total = input.ordersByHour7d.reduce((s, v) => s + v, 0);
  if (total >= 20) {
    // Jendela 2 jam tersibuk.
    let best = 0;
    let bestStart = 0;
    for (let h = 0; h < 23; h += 1) {
      const sum = input.ordersByHour7d[h] + input.ordersByHour7d[h + 1];
      if (sum > best) {
        best = sum;
        bestStart = h;
      }
    }
    const share = Math.round((best / total) * 100);
    const hh = (h: number) => `${String(h).padStart(2, "0")}:00`;
    insights.push({
      id: "peak",
      title: `Jam tersibuk ${hh(bestStart)}–${hh(bestStart + 2)}`,
      detail: `${share}% order 7 hari terakhir masuk di jam ini (${best} dari ${total}).`,
      recommendation: `Siapkan es, cup, dan bahan cepat sebelum ${hh(bestStart)}.`,
    });
  }
  if (input.topBatched && input.topBatched.qty >= 5) {
    insights.push({
      id: "top-batch",
      title: `${input.topBatched.label} paling sering di-batch`,
      detail: `${input.topBatched.qty} porsi dibuat lewat Smart Batch dalam 7 hari.`,
      recommendation: `Siapkan bahan ${input.topBatched.label} di station sebelum jam ramai.`,
    });
  }
  for (const s of input.stationAvg) {
    const change = changePct(s.today, s.week);
    if (change != null && s.samplesToday >= 5 && Math.abs(change) >= 15) {
      const slower = change > 0;
      insights.push({
        id: `trend-${s.station}`,
        title: `${stationName(s.station)} ${slower ? "lebih lambat" : "lebih cepat"} ${Math.abs(change)}% hari ini`,
        detail: `Rata-rata saji ${s.today!.toFixed(1)} mnt vs ${s.week!.toFixed(1)} mnt (7 hari).`,
        recommendation: slower
          ? `Cek beban & persiapan ${stationName(s.station)}; manfaatkan Smart Batch.`
          : "Pertahankan pola kerja hari ini.",
      });
    }
  }
  return insights.slice(0, 3);
}
