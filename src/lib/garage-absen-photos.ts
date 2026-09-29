// Payroll V2 — pembersihan selfie absen lama (storage/attendance/<YYYY-MM-DD>/).
// Retensi dari setting security.photoRetentionDays (default 90 hari). Dijalankan
// sekali sehari bersama backup harian (lihat ensureDailyBackup).

import fs from "node:fs/promises";
import path from "node:path";

import { jakartaDateKey } from "@/lib/attendance";
import { PAYROLL_KEYS, getPayrollSetting } from "@/lib/garage-payroll-settings";

export function attendancePhotoRoot() {
  return path.join(process.cwd(), "storage", "attendance");
}

/** Hapus folder tanggal yang lebih lama dari masa simpan. Return tanggal yang dihapus. */
export async function cleanupOldAttendancePhotos(now = new Date(), root = attendancePhotoRoot()): Promise<string[]> {
  const security = (await getPayrollSetting(PAYROLL_KEYS.security)) as { photoRetentionDays?: number } | null;
  const days = Math.max(30, Math.floor(security?.photoRetentionDays ?? 90)); // minimal 30 hari (bukti koreksi/sengketa)
  const cutoff = jakartaDateKey(new Date(now.getTime() - days * 86_400_000));

  let entries: string[] = [];
  try {
    entries = await fs.readdir(root);
  } catch {
    return [];
  }
  const removed: string[] = [];
  for (const name of entries) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(name) || name >= cutoff) continue;
    await fs.rm(path.join(root, name), { recursive: true, force: true });
    removed.push(name);
  }
  return removed.sort();
}
