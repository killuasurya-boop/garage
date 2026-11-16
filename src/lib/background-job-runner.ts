// =============================================================================
// Menjalankan proses otomatis server dengan pencatatan kesehatan + alarm ke Owner (lihat background-job-health.ts).
// Status disimpan di memori proses aplikasi (satu kontainer app); disimpan di globalThis supaya tidak hilang saat
// modul dimuat ulang. Setelah server restart status kembali "belum ada data" sampai putaran berikutnya.
// =============================================================================
import { and, eq } from "drizzle-orm";

import { getDb } from "@/db";
import { staffProfiles } from "@/db/schema";
import { EMPTY_JOB_STATE, jobAlertNotification, jobHealthRows, nextJobState, type BackgroundJob, type JobAlert, type JobState } from "@/lib/background-job-health";

const STORE_KEY = "__garageBackgroundJobHealth";

function store(): Partial<Record<BackgroundJob, JobState>> {
  const holder = globalThis as unknown as Record<string, Partial<Record<BackgroundJob, JobState>> | undefined>;
  holder[STORE_KEY] ??= {};
  return holder[STORE_KEY]!;
}

/** Status kesehatan semua proses otomatis (untuk layar Owner/Manajer). */
export function backgroundJobHealth() {
  return jobHealthRows(store());
}

/** Catat hasil satu putaran (dipakai runner & tes). Mengembalikan alarm bila perlu dikirim. */
export function recordJobOutcome(job: BackgroundJob, ok: boolean, now = new Date()): JobAlert | null {
  const states = store();
  const { state, alert } = nextJobState(states[job] ?? EMPTY_JOB_STATE, ok, now);
  states[job] = state;
  return alert;
}

/**
 * Notifikasi "gagal" belum terkirim (mis. database notifikasi juga sedang bermasalah) → alarm dianggap belum
 * dikirim, sehingga putaran gagal berikutnya mencoba lagi (dedup per jam mencegah dobel bila ternyata sudah masuk).
 */
function markAlertUndelivered(job: BackgroundJob) {
  const states = store();
  const state = states[job];
  if (state && state.consecutiveFailures > 0) states[job] = { ...state, alerted: false };
}

/** Hanya untuk tes: kosongkan status. */
export function resetBackgroundJobHealth() {
  const states = store();
  for (const key of Object.keys(states)) delete states[key as BackgroundJob];
}

async function alertOwners(job: BackgroundJob, alert: JobAlert, now: Date) {
  const { notifyStaff } = await import("@/lib/staff-notifications");
  const note = jobAlertNotification(job, alert, now);
  const owners = await getDb()
    .select({ userId: staffProfiles.userId, outletId: staffProfiles.outletId })
    .from(staffProfiles)
    .where(and(eq(staffProfiles.role, "Owner"), eq(staffProfiles.status, "active")));
  let delivered = 0;
  for (const owner of owners) {
    // Error dilempar ke pemanggil (runner menandai alarm belum terkirim). Null = sudah ada (dedup) → dianggap terkirim.
    const row = await notifyStaff({
      outletId: owner.outletId,
      audience: "user",
      userId: owner.userId,
      kind: note.kind,
      severity: note.severity,
      title: note.title,
      body: note.body,
      url: "/partners?tab=manage",
      dedupKey: `${note.dedupKey}:${owner.userId}`,
    });
    if (row) delivered += 1;
  }
  return delivered;
}

/**
 * Jalankan satu proses otomatis. Error tidak pernah dilempar ke pemanggil (sweeper lain tetap jalan): ditulis ke log,
 * dicatat sebagai gagal, dan setelah 3× berturut-turut Owner diberi tahu.
 */
export async function runMonitoredJob<T>(
  job: BackgroundJob,
  run: () => Promise<T>,
  now = () => new Date(),
  /** Pengirim alarm (default: notifikasi Garage OS ke Owner); dapat diganti di tes. */
  deliver: (job: BackgroundJob, alert: JobAlert, at: Date) => Promise<unknown> = alertOwners,
): Promise<T | null> {
  let result: T | null = null;
  let ok = true;
  try {
    result = await run();
  } catch (error) {
    ok = false;
    console.warn(`[job:${job}] gagal:`, error instanceof Error ? error.message : error);
  }
  const at = now();
  const alert = recordJobOutcome(job, ok, at);
  if (alert) {
    try {
      await deliver(job, alert, at);
    } catch (error) {
      console.warn(`[job:${job}] notifikasi Owner gagal:`, error instanceof Error ? error.message : error);
      if (alert.state === "failing") markAlertUndelivered(job);
    }
  }
  return result;
}
