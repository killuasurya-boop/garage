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
    }).catch(() => null);
    if (row) delivered += 1;
  }
  return delivered;
}

/**
 * Jalankan satu proses otomatis. Error tidak pernah dilempar ke pemanggil (sweeper lain tetap jalan): ditulis ke log,
 * dicatat sebagai gagal, dan setelah 3× berturut-turut Owner diberi tahu.
 */
export async function runMonitoredJob<T>(job: BackgroundJob, run: () => Promise<T>, now = () => new Date()): Promise<T | null> {
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
      await alertOwners(job, alert, at);
    } catch (error) {
      console.warn(`[job:${job}] notifikasi Owner gagal:`, error instanceof Error ? error.message : error);
    }
  }
  return result;
}
