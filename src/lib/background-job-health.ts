// =============================================================================
// Kesehatan proses otomatis server (sweeper tiap menit di instrumentation-node) — Owner 16 Nov 2026.
// Dulu kegagalan hanya ditulis ke log (console.warn) sehingga Owner tidak tahu bila, misalnya, penutupan otomatis
// jam layanan mitra berhenti jalan. Sekarang:
// - setiap proses dicatat "terakhir berhasil" / "gagal berturut-turut" (di memori proses aplikasi);
// - gagal JOB_ALERT_AFTER_FAILURES kali berturut-turut → satu notifikasi ke Owner (paling sering 1×/jam per proses);
// - pulih setelah alarm → satu notifikasi "Pulih".
// Detail error hanya di log server; pesan ke Owner tidak membawa teks error mentah (SQL/stack).
// =============================================================================

export const JOB_ALERT_AFTER_FAILURES = 3;

export const BACKGROUND_JOBS = {
  partner_sla: "Eskalasi pesanan mitra (belum diterima / siap belum diambil)",
  partner_hours: "Jam layanan mitra (tutup & buka otomatis)",
  partner_settlement: "Pengingat setoran mitra harian",
  event_lineup_tasks: "Pengingat tugas panitia event",
} as const;

export type BackgroundJob = keyof typeof BACKGROUND_JOBS;

export type JobState = {
  consecutiveFailures: number;
  lastOkAt: string | null;
  lastErrorAt: string | null;
  /** Waktu kegagalan pertama dari rangkaian gagal yang sedang berjalan. */
  failingSince: string | null;
  /** Alarm "gagal" sudah dikirim untuk rangkaian ini (dipakai untuk mengirim "pulih" sekali). */
  alerted: boolean;
};

export const EMPTY_JOB_STATE: JobState = { consecutiveFailures: 0, lastOkAt: null, lastErrorAt: null, failingSince: null, alerted: false };

export type JobAlert = { state: "failing" | "recovered"; since: string; failures: number };

/** Transisi murni: hasil satu putaran proses → status baru + alarm (bila perlu). */
export function nextJobState(prev: JobState, ok: boolean, now: Date): { state: JobState; alert: JobAlert | null } {
  const at = now.toISOString();
  if (ok) {
    const alert = prev.alerted && prev.failingSince ? { state: "recovered" as const, since: prev.failingSince, failures: prev.consecutiveFailures } : null;
    return { state: { consecutiveFailures: 0, lastOkAt: at, lastErrorAt: prev.lastErrorAt, failingSince: null, alerted: false }, alert };
  }
  const failures = prev.consecutiveFailures + 1;
  const failingSince = prev.failingSince ?? at;
  const shouldAlert = failures >= JOB_ALERT_AFTER_FAILURES && !prev.alerted;
  return {
    state: { consecutiveFailures: failures, lastOkAt: prev.lastOkAt, lastErrorAt: at, failingSince, alerted: prev.alerted || shouldAlert },
    alert: shouldAlert ? { state: "failing", since: failingSince, failures } : null,
  };
}

export type JobHealthRow = {
  job: BackgroundJob;
  label: string;
  status: "ok" | "failing" | "unknown";
  lastOkAt: string | null;
  lastErrorAt: string | null;
  consecutiveFailures: number;
};

/** Baris kesehatan untuk layar Owner/Manajer. "unknown" = belum pernah jalan sejak server terakhir dimulai. */
export function jobHealthRows(states: Partial<Record<BackgroundJob, JobState>>): JobHealthRow[] {
  return (Object.keys(BACKGROUND_JOBS) as BackgroundJob[]).map((job) => {
    const state = states[job] ?? EMPTY_JOB_STATE;
    // Gagal 1–2× masih dianggap normal (bisa sesaat); ≥ batas = bermasalah; belum pernah berhasil = belum ada data.
    const status = state.consecutiveFailures >= JOB_ALERT_AFTER_FAILURES ? "failing" : state.lastOkAt ? "ok" : "unknown";
    return {
      job,
      label: BACKGROUND_JOBS[job],
      status,
      lastOkAt: state.lastOkAt,
      lastErrorAt: state.lastErrorAt,
      consecutiveFailures: state.consecutiveFailures,
    };
  });
}

/** Isi notifikasi Owner (murni). Dedup: gagal paling sering 1×/jam per proses; pulih sekali per rangkaian. */
export function jobAlertNotification(job: BackgroundJob, alert: JobAlert, now: Date) {
  const label = BACKGROUND_JOBS[job];
  if (alert.state === "recovered") {
    const minutes = Math.max(1, Math.round((now.getTime() - new Date(alert.since).getTime()) / 60_000));
    return {
      kind: "system_recovered",
      severity: "info" as const,
      title: `Pulih: ${label}`,
      body: `Proses otomatis berjalan normal lagi (bermasalah ±${minutes} menit).`,
      dedupKey: `job:${job}:recovered:${alert.since}`,
    };
  }
  return {
    kind: "system_alert",
    severity: "urgent" as const,
    title: `Proses otomatis bermasalah: ${label}`,
    body: `Gagal ${alert.failures} kali berturut-turut sejak ${new Date(alert.since).toLocaleTimeString("id-ID", { timeZone: "Asia/Jakarta", hour: "2-digit", minute: "2-digit" })} WIB. Detail ada di log server; hubungi pengelola sistem bila tidak pulih.`,
    dedupKey: `job:${job}:failing:${now.toISOString().slice(0, 13)}`,
  };
}
