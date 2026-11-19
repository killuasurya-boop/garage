// Penyimpanan berkas pelamar (storage/recruitment): lokasi, batas total, dan sapuan harian
// (berkas sampah > 24 jam + berkas pelamar yang masa simpannya habis). Aturan murni di recruitment-retention.ts.

import { readdir, stat, unlink } from "node:fs/promises";
import path from "node:path";

import { and, eq, inArray } from "drizzle-orm";

import { ensureDatabaseReady } from "@/db";
import { candidates, staffProfiles } from "@/db/schema";
import {
  candidateFilesExpired,
  isOrphanUpload,
  RECRUITMENT_STORAGE_CAP_BYTES,
  recruitmentFileName,
} from "@/lib/recruitment-retention";

export function recruitmentStorageDir() {
  const cwd = process.cwd();
  let root = cwd;
  if (path.basename(cwd).toLowerCase() === "standalone" && path.basename(path.dirname(cwd)).toLowerCase() === ".next") {
    root = path.resolve(cwd, "..", "..");
  } else if (process.env.GARAGE_PROJECT_ROOT) {
    root = path.resolve(process.env.GARAGE_PROJECT_ROOT);
  }
  return path.join(root, "storage", "recruitment");
}

async function listFiles(dir: string) {
  const names = await readdir(dir).catch(() => [] as string[]);
  const out: Array<{ name: string; size: number; mtime: Date }> = [];
  for (const name of names) {
    const info = await stat(path.join(dir, name)).catch(() => null);
    if (info?.isFile()) out.push({ name, size: info.size, mtime: info.mtime });
  }
  return out;
}

// Total ukuran di-cache 60 dtk supaya unggahan tidak menghitung ulang folder tiap kali.
let usageCache: { bytes: number; at: number } | null = null;

export async function recruitmentStorageBytes(now = Date.now()) {
  if (usageCache && now - usageCache.at < 60_000) return usageCache.bytes;
  const bytes = (await listFiles(recruitmentStorageDir())).reduce((sum, f) => sum + f.size, 0);
  usageCache = { bytes, at: now };
  return bytes;
}

export function noteRecruitmentUpload(bytes: number) {
  if (usageCache) usageCache.bytes += bytes;
}

/** true bila unggahan baru masih muat di bawah batas total. */
export async function recruitmentStorageHasRoom(incoming: number) {
  return (await recruitmentStorageBytes()) + incoming <= RECRUITMENT_STORAGE_CAP_BYTES;
}

// Satu peringatan "penyimpanan penuh" per hari per Owner.
export async function alertRecruitmentStorageFull(now = new Date()) {
  try {
    const db = await ensureDatabaseReady();
    const owners = await db
      .select({ userId: staffProfiles.userId, outletId: staffProfiles.outletId })
      .from(staffProfiles)
      .where(and(eq(staffProfiles.role, "Owner"), eq(staffProfiles.status, "active")));
    const { notifyStaff } = await import("@/lib/staff-notifications");
    const day = new Date(now.getTime() + 7 * 3_600_000).toISOString().slice(0, 10);
    for (const owner of owners) {
      await notifyStaff({
        outletId: owner.outletId,
        audience: "user",
        userId: owner.userId,
        kind: "system_alert",
        severity: "warning",
        title: "Penyimpanan berkas pelamar penuh",
        body: "Unggahan CV/foto pelamar ditolak sementara (batas 2 GB). Cek lamaran lama atau kemungkinan unggahan iseng.",
        url: "/recruitment",
        dedupKey: `recruitment-storage-full:${day}:${owner.userId}`,
      }).catch(() => null);
    }
  } catch (error) {
    console.warn("[recruitment] gagal mengirim peringatan penyimpanan:", error instanceof Error ? error.message : "gagal");
  }
}

const FILE_COLUMNS = ["cvUrl", "photoUrl", "ktpUrl", "certificateUrl", "portfolioUrl"] as const;

/**
 * Sapuan harian: (1) hapus berkas pelamar yang masa simpannya habis + kosongkan tautan & hasil baca CV,
 * (2) hapus berkas unggahan yang > 24 jam tidak tertaut ke lamaran mana pun. Aman diulang.
 */
export async function sweepRecruitmentFiles(now = new Date()) {
  const db = await ensureDatabaseReady();
  const dir = recruitmentStorageDir();
  const rows = await db
    .select({
      id: candidates.id,
      status: candidates.status,
      hiredAt: candidates.hiredAt,
      updatedAt: candidates.updatedAt,
      statusChangedAt: candidates.statusChangedAt,
      cvUrl: candidates.cvUrl,
      photoUrl: candidates.photoUrl,
      ktpUrl: candidates.ktpUrl,
      certificateUrl: candidates.certificateUrl,
      portfolioUrl: candidates.portfolioUrl,
      cvParsedData: candidates.cvParsedData,
    })
    .from(candidates);

  const referenced = new Set<string>();
  const expiredIds: string[] = [];
  const expiredFiles: string[] = [];
  for (const row of rows) {
    const names = FILE_COLUMNS.map((col) => recruitmentFileName(row[col])).filter((n): n is string => Boolean(n));
    const hasData = names.length > 0 || row.cvParsedData !== null;
    if (hasData && candidateFilesExpired(row, now)) {
      expiredIds.push(row.id);
      expiredFiles.push(...names);
    } else {
      for (const n of names) referenced.add(n);
    }
  }

  // Tautan dikosongkan dulu, baru berkas dihapus: bila hapus gagal, sapuan berikutnya membersihkannya sebagai sampah.
  if (expiredIds.length) {
    await db
      .update(candidates)
      .set({ cvUrl: null, photoUrl: null, ktpUrl: null, certificateUrl: null, portfolioUrl: null, cvParsedData: null })
      .where(inArray(candidates.id, expiredIds));
  }
  let removedExpired = 0;
  for (const name of expiredFiles) {
    if (referenced.has(name)) continue;
    if (await unlink(path.join(dir, name)).then(() => true, () => false)) removedExpired += 1;
  }

  let removedOrphans = 0;
  for (const file of await listFiles(dir)) {
    if (!isOrphanUpload(file.mtime, referenced.has(file.name), now)) continue;
    if (await unlink(path.join(dir, file.name)).then(() => true, () => false)) removedOrphans += 1;
  }
  usageCache = null;

  if (expiredIds.length || removedOrphans) {
    const { createAuditLog } = await import("@/lib/garage-service");
    await createAuditLog({
      actor: "Sistem",
      action: "Hapus berkas pelamar (aturan simpan)",
      object: `${expiredIds.length} pelamar · ${removedExpired + removedOrphans} berkas`,
      device: "Jadwal harian",
      metadata: { module: "recruitment", expiredCandidates: expiredIds.length, removedExpired, removedOrphans },
    });
  }
  return { expiredCandidates: expiredIds.length, removedExpired, removedOrphans };
}
