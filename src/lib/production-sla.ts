// =============================================================================
// SLA Production Hub v2 (owner, Nov 2026) — aturan murni, dipakai layar produksi.
//
//   S1 target per menu  : target tiket = waktu siap (menu_items.prep) terlama di tiket
//                         (dipasang server saat tiket dibuat, bila pengaturan aktif).
//   S2 tiga tahap       : MULAI (masuk → mulai), PRODUKSI (masuk → siap), ANTAR (siap → diterima).
//   S3 peringatan dini  : "Telat dalam 2 mnt" sebelum lewat target, bukan baru merah setelahnya.
//   S4 mode ramai       : antrean station ≥ batas → target TAMPILAN +X menit.
//
// Catatan: mode ramai hanya mengubah tampilan & urutan. Penilaian telat yang tersimpan
// (kitchen_tickets.priority saat READY, laporan kinerja) tetap memakai target tiket asli.
// =============================================================================

export type SlaLevel = "ok" | "warn" | "critical";
export type SlaStage = "mulai" | "produksi" | "antar" | "selesai";

export type SlaConfig = {
  /** Batas order menunggu sebelum MULAI ditekan. */
  startTargetMinutes: number;
  /** Batas dari SIAP sampai diterima tamu / diambil. */
  deliverTargetMinutes: number;
  /** Peringatan dini: sekian menit sebelum target produksi habis. */
  warnBeforeMinutes: number;
  /** Mode ramai: jumlah tiket aktif (menunggu + proses) per station. 0 = mati. */
  busyThreshold: number;
  /** Tambahan target tampilan saat mode ramai. */
  busyExtraMinutes: number;
};

export const DEFAULT_SLA_CONFIG: SlaConfig = {
  startTargetMinutes: 3,
  deliverTargetMinutes: 5,
  warnBeforeMinutes: 2,
  busyThreshold: 8,
  busyExtraMinutes: 3,
};

export type SlaTicket = {
  status: string;
  station?: "Bar" | "Food";
  createdAt: string;
  acceptedAt?: string | null;
  readyAt?: string | null;
  targetMinutes: number;
};

export type SlaState = {
  stage: SlaStage;
  level: SlaLevel;
  /** Teks singkat untuk kartu; null = aman, tidak perlu ditampilkan. */
  message: string | null;
  /** Target produksi efektif (menit) setelah tambahan mode ramai. */
  effectiveTargetMinutes: number;
};

const minutesSince = (iso: string, now: number) => Math.max(0, (now - new Date(iso).getTime()) / 60000);

/** Tambahan menit mode ramai per station berdasarkan antrean aktif saat ini. */
export function busyExtraByStation(
  tickets: Array<Pick<SlaTicket, "status" | "station">>,
  cfg: SlaConfig = DEFAULT_SLA_CONFIG,
): Record<"Bar" | "Food", number> {
  const active = { Bar: 0, Food: 0 };
  for (const t of tickets) {
    if ((t.status === "queue" || t.status === "cooking") && t.station) active[t.station] += 1;
  }
  const on = (n: number) => (cfg.busyThreshold > 0 && n >= cfg.busyThreshold ? cfg.busyExtraMinutes : 0);
  return { Bar: on(active.Bar), Food: on(active.Food) };
}

export function slaStateOf(
  ticket: SlaTicket,
  now: number,
  cfg: SlaConfig = DEFAULT_SLA_CONFIG,
  options: { busyExtraMinutes?: number; pickup?: boolean } = {},
): SlaState {
  const target = Math.max(1, (ticket.targetMinutes || 15) + (options.busyExtraMinutes ?? 0));
  if (ticket.status === "queue" || ticket.status === "cooking") {
    const elapsed = minutesSince(ticket.createdAt, now);
    const remaining = target - elapsed;
    // Jendela peringatan: minimal warnBefore, minimal 40% target (target pendek tetap terlihat).
    const warnWindow = Math.max(cfg.warnBeforeMinutes, target * 0.4);
    const stage: SlaStage = ticket.status === "queue" ? "mulai" : "produksi";
    if (remaining < 0) {
      return { stage, level: "critical", message: `Lewat ${Math.max(1, Math.floor(-remaining))} mnt`, effectiveTargetMinutes: target };
    }
    if (ticket.status === "queue" && elapsed >= cfg.startTargetMinutes) {
      return { stage, level: "warn", message: `Belum dimulai ${Math.floor(elapsed)} mnt`, effectiveTargetMinutes: target };
    }
    if (remaining <= warnWindow) {
      return { stage, level: "warn", message: `Telat dalam ${Math.max(1, Math.ceil(remaining))} mnt`, effectiveTargetMinutes: target };
    }
    return { stage, level: "ok", message: null, effectiveTargetMinutes: target };
  }
  if (ticket.status === "ready") {
    const since = minutesSince(ticket.readyAt ?? ticket.createdAt, now);
    const verb = options.pickup ? "diambil" : "diantar";
    if (since > cfg.deliverTargetMinutes) {
      return { stage: "antar", level: "critical", message: `Belum ${verb} ${Math.floor(since)} mnt`, effectiveTargetMinutes: target };
    }
    if (since >= Math.max(1, cfg.deliverTargetMinutes - 1)) {
      return { stage: "antar", level: "warn", message: `Segera ${verb === "diantar" ? "antar" : "serahkan"}`, effectiveTargetMinutes: target };
    }
    return { stage: "antar", level: "ok", message: null, effectiveTargetMinutes: target };
  }
  return { stage: "selesai", level: "ok", message: null, effectiveTargetMinutes: target };
}

/** Normalisasi pengaturan dari server (nilai rusak → default). */
export function normalizeSlaConfig(raw: Partial<SlaConfig> | null | undefined): SlaConfig {
  const pick = (v: unknown, fallback: number, min: number, max: number) =>
    typeof v === "number" && Number.isFinite(v) && v >= min && v <= max ? Math.round(v) : fallback;
  return {
    startTargetMinutes: pick(raw?.startTargetMinutes, DEFAULT_SLA_CONFIG.startTargetMinutes, 1, 60),
    deliverTargetMinutes: pick(raw?.deliverTargetMinutes, DEFAULT_SLA_CONFIG.deliverTargetMinutes, 1, 60),
    warnBeforeMinutes: pick(raw?.warnBeforeMinutes, DEFAULT_SLA_CONFIG.warnBeforeMinutes, 0, 30),
    busyThreshold: pick(raw?.busyThreshold, DEFAULT_SLA_CONFIG.busyThreshold, 0, 100),
    busyExtraMinutes: pick(raw?.busyExtraMinutes, DEFAULT_SLA_CONFIG.busyExtraMinutes, 0, 30),
  };
}

/** "4m" / "10 menit" / "12" → 4 / 10 / 12; kosong / tak terbaca → null. */
export function parsePrepMinutes(prep: string | null | undefined): number | null {
  const match = String(prep ?? "").trim().match(/^(\d{1,3})\s*(m|mnt|menit|min|minutes?)?$/i);
  if (!match) return null;
  const n = Number(match[1]);
  return n >= 1 && n <= 120 ? n : null;
}

/** S1: target tiket = waktu siap terlama dari menu di tiket; null bila tak ada data. */
export function menuTargetMinutes(lines: Array<{ prep?: string | null }>): number | null {
  const values = lines.map((l) => parsePrepMinutes(l.prep)).filter((v): v is number => v !== null);
  return values.length ? Math.max(...values) : null;
}
