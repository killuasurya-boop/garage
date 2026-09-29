// Backup database lokal (PGlite) dari DALAM proses server — aman walau server
// sedang jalan (tidak menyalin folder .pglite-data yang sedang dipakai).
// Hasil: backups/auto/garage-<tanggal>-<jam>-<label>.tar.gz
// Pulihkan (server MATI): npm run db:restore -- backups/auto/<file>.tar.gz

import fs from "node:fs/promises";
import path from "node:path";

import { ensureDatabaseReady, getDatabaseDriver } from "@/db";

// harian = 1/hari (14 hari); berkala = tiap ~6 jam (±3 hari, toko buka 24 jam);
// tutupkasir = setiap sesi kas ditutup (±10 hari untuk 3 shift/hari).
const KEEP = { harian: 14, manual: 20, berkala: 12, tutupkasir: 30 } as const;
export type BackupLabel = keyof typeof KEEP;

type PgliteBackupClient = {
  dumpDataDir?: (c?: "gzip" | "auto" | "none") => Promise<Blob>;
  exec?: (sql: string) => Promise<unknown>;
  _runExclusiveTransaction?: <T>(fn: () => Promise<T>) => Promise<T>;
};

// Salinan harus diambil saat TIDAK ada query/transaksi berjalan. PGlite
// mengantrekan setiap query() / exec() / transaction() di kunci transaksi yang
// sama, jadi dump di dalam kunci itu = salinan utuh, bukan setengah transaksi.
// CHECKPOINT dulu (di luar kunci) supaya salinan tidak butuh pemulihan WAL.
async function dumpConsistent(client: PgliteBackupClient): Promise<Blob> {
  if (typeof client.exec === "function") {
    await client.exec("CHECKPOINT").catch(() => undefined);
  }
  const dump = () => client.dumpDataDir!("gzip");
  return typeof client._runExclusiveTransaction === "function"
    ? client._runExclusiveTransaction(dump)
    : dump();
}

export interface BackupInfo {
  file: string;
  label: string;
  bytes: number;
  createdAt: string;
  offsite?: OffsiteStatus | null;
}

function backupDir() {
  return process.env.GARAGE_BACKUP_DIR?.trim() || path.join(/* turbopackIgnore: true */ process.cwd(), "backups", "auto");
}

function stampParts(now: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
  return { day: `${get("year")}${get("month")}${get("day")}`, time: `${get("hour")}${get("minute")}${get("second")}` };
}

function stampToIso(file: string): string | null {
  const m = /^garage-(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})-/.exec(file);
  if (!m) return null;
  const at = new Date(`${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}+07:00`);
  return Number.isNaN(at.getTime()) ? null : at.toISOString();
}

let running: Promise<BackupInfo | null> | null = null;

/** Buat backup sekarang. Null bila driver bukan PGlite (Postgres dibackup di sisi server DB). */
export function createDbBackup(label: BackupLabel = "manual", now = new Date()): Promise<BackupInfo | null> {
  if (running) return running;
  running = (async () => {
    await ensureDatabaseReady();
    if (getDatabaseDriver() !== "pglite") return null;
    // Klien PGlite yang sama dengan server (lihat src/db/index.ts).
    const client = (globalThis as { garagePglite?: PgliteBackupClient }).garagePglite;
    if (!client || typeof client.dumpDataDir !== "function") return null;

    const blob = await dumpConsistent(client);
    const buf = Buffer.from(await blob.arrayBuffer());
    const { day, time } = stampParts(now);
    const dir = backupDir();
    await fs.mkdir(dir, { recursive: true });
    const file = `garage-${day}-${time}-${label}.tar.gz`;
    const tmp = path.join(dir, `${file}.part`);
    await fs.writeFile(tmp, buf);
    await fs.rename(tmp, path.join(dir, file));
    await prune(label);
    const offsite = await copyOffsite(file, buf, now);
    return { file, label, bytes: buf.length, createdAt: now.toISOString(), offsite };
  })().finally(() => {
    running = null;
  });
  return running;
}

// ---------------------------------------------------------------------------
// Salinan di luar laptop: setiap backup juga disalin ke folder pilihan Owner
// (setting payroll "backup".copyToDir), mis. folder Google Drive/OneDrive yang
// tersinkron atau flashdisk. Folder harus sudah ada — kalau flashdisk dicabut,
// salinan gagal dan tercatat (backup lokal tetap jadi).
// ---------------------------------------------------------------------------

const OFFSITE_KEEP = 30;
const OFFSITE_FILE_RE = /^garage-\d{8}-\d{6}-\w+\.tar\.gz$/;

export interface OffsiteStatus {
  ok: boolean;
  dir: string;
  file?: string;
  error?: string;
  at: string;
}

function offsiteStatusPath() {
  return path.join(/* turbopackIgnore: true */ backupDir(), "offsite-status.json");
}

export async function readOffsiteStatus(): Promise<OffsiteStatus | null> {
  try {
    return JSON.parse(await fs.readFile(offsiteStatusPath(), "utf8")) as OffsiteStatus;
  } catch {
    return null;
  }
}

/** Folder salinan: setting Owner, lalu GARAGE_BACKUP_OFFSITE_DIR; null = belum diatur. */
export async function offsiteDir(): Promise<string | null> {
  const { getPayrollSetting } = await import("@/lib/garage-payroll-settings");
  const cfg = (await getPayrollSetting("backup")) as { copyToDir?: string } | null;
  const dir = cfg?.copyToDir?.trim() || process.env.GARAGE_BACKUP_OFFSITE_DIR?.trim();
  return dir ? dir : null;
}

async function copyOffsite(file: string, buf: Buffer, now: Date): Promise<OffsiteStatus | null> {
  const dir = await offsiteDir();
  if (!dir) return null;
  let status: OffsiteStatus;
  try {
    if (!path.isAbsolute(dir)) throw new Error("Folder harus alamat lengkap, mis. G:/My Drive/Garage Backup");
    const stat = await fs.stat(dir).catch(() => null);
    if (!stat?.isDirectory()) throw new Error("Folder tidak ditemukan (flashdisk dicabut / Drive belum tersambung?)");
    const tmp = path.join(dir, `${file}.part`);
    await fs.writeFile(tmp, buf);
    await fs.rename(tmp, path.join(dir, file));
    const olds = (await fs.readdir(dir)).filter((n) => OFFSITE_FILE_RE.test(n)).sort().reverse().slice(OFFSITE_KEEP);
    for (const old of olds) await fs.rm(path.join(dir, old), { force: true });
    status = { ok: true, dir, file, at: now.toISOString() };
  } catch (err) {
    status = { ok: false, dir, error: (err as Error).message, at: now.toISOString() };
    console.error("[backup] salinan ke folder luar gagal:", status.error);
  }
  await fs.writeFile(offsiteStatusPath(), JSON.stringify(status, null, 2)).catch(() => undefined);
  return status;
}

async function prune(label: BackupLabel) {
  const all = await listBackups();
  const mine = all.filter((b) => b.label === label);
  for (const old of mine.slice(KEEP[label])) {
    await fs.rm(path.join(/* turbopackIgnore: true */ backupDir(), old.file), { force: true });
  }
}

/** Daftar backup, terbaru dulu. */
export async function listBackups(): Promise<BackupInfo[]> {
  let names: string[] = [];
  try {
    names = await fs.readdir(backupDir());
  } catch {
    return [];
  }
  const rows = await Promise.all(
    names
      .filter((n) => /^garage-\d{8}-\d{6}-\w+\.tar\.gz$/.test(n))
      .map(async (file) => {
        const stat = await fs.stat(path.join(/* turbopackIgnore: true */ backupDir(), file));
        return {
          file,
          label: file.replace(/^garage-\d{8}-\d{6}-/, "").replace(/\.tar\.gz$/, ""),
          bytes: stat.size,
          // Waktu dari nama file (WIB), bukan mtime — mtime berubah bila file disalin/dipulihkan.
          createdAt: stampToIso(file) ?? stat.mtime.toISOString(),
        };
      }),
  );
  return rows.sort((a, b) => b.file.localeCompare(a.file));
}

let checkedDay: string | null = null;

/**
 * Perawatan harian otomatis: sekali per hari (WIB), dipicu aktivitas absen/gajian.
 * Backup database + hapus selfie absen yang melewati masa simpan.
 */
export async function ensureDailyBackup(now = new Date()): Promise<BackupInfo | null> {
  const { day } = stampParts(now);
  if (checkedDay === day) return null;
  try {
    const { cleanupOldAttendancePhotos } = await import("@/lib/garage-absen-photos");
    const removed = await cleanupOldAttendancePhotos(now);
    if (removed.length) console.info(`[perawatan] selfie lama dihapus: ${removed.length} hari (s/d ${removed.at(-1)})`);
  } catch (err) {
    console.error("[perawatan] hapus selfie lama gagal", err);
  }
  const existing = await listBackups();
  if (existing.some((b) => b.file.startsWith(`garage-${day}-`))) {
    checkedDay = day;
    return null;
  }
  const made = await createDbBackup("harian", now);
  checkedDay = day;
  return made;
}

const PERIODIC_MS = 6 * 60 * 60 * 1000;

/**
 * Dipanggil penjadwal server (instrumentation.ts) tiap 30 menit: backup harian
 * bila hari ini belum ada, lalu backup berkala bila backup terakhir > 6 jam.
 * Toko buka 24 jam — tanpa ini data sehari penuh bisa hilang.
 */
export async function runScheduledBackup(now = new Date()): Promise<BackupInfo | null> {
  const daily = await ensureDailyBackup(now);
  if (daily) return daily;
  const [latest] = await listBackups();
  if (latest && now.getTime() - new Date(latest.createdAt).getTime() < PERIODIC_MS) return null;
  return createDbBackup("berkala", now);
}

let schedulerStarted = false;

/** Mulai penjadwal backup di proses server (sekali). Matikan: GARAGE_DISABLE_AUTO_BACKUP=true. */
export function startBackupScheduler() {
  if (schedulerStarted || process.env.GARAGE_DISABLE_AUTO_BACKUP === "true") return;
  schedulerStarted = true;
  const tick = () => {
    void runScheduledBackup()
      .then((made) => {
        if (made) console.info(`[backup] ${made.label} → ${made.file}${made.offsite?.ok ? " (+ salinan luar)" : ""}`);
      })
      .catch((err) => console.error("[backup] terjadwal gagal", err));
  };
  // Tunggu 3 menit setelah start supaya tidak bebani pemanasan halaman.
  setTimeout(tick, 3 * 60 * 1000).unref?.();
  setInterval(tick, 30 * 60 * 1000).unref?.();
}
