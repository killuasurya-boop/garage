// Aturan simpan data pelamar (Owner 19 Nov 2026) — murni, tanpa DB/IO.
//
// - Diterima / sudah jadi karyawan → berkas disimpan (pindah ke data karyawan).
// - Ditolak / Talent Pool → berkas (KTP, CV, foto, sertifikat, portfolio) dihapus 6 bulan setelah keputusan terakhir.
// - Baru / Diproses / Interview tanpa kabar 90 hari → dianggap selesai, lalu ikut aturan 6 bulan.
// Nama, posisi & status tetap disimpan sebagai riwayat.
// - Berkas unggahan yang 24 jam tidak tertaut ke lamaran mana pun = sampah → dihapus.

import { RECRUITMENT_FILE_URL } from "@/lib/garage-recruitment-data";

export const RECRUITMENT_FILE_RETENTION_DAYS = 180;
export const RECRUITMENT_STALE_DAYS = 90;
export const RECRUITMENT_ORPHAN_HOURS = 24;
/** Batas total berkas lamaran di disk; penuh → unggah ditolak (POS tetap aman). */
export const RECRUITMENT_STORAGE_CAP_BYTES = 2 * 1024 * 1024 * 1024;

const DAY = 86_400_000;
const CLOSED = new Set(["Ditolak", "Talent Pool"]);
const OPEN = new Set(["Baru", "Diproses", "Interview"]);

export type RetentionCandidate = { status: string; hiredAt: Date | null; updatedAt: Date };

/** Kapan berkas pelamar boleh dihapus (null = disimpan). */
export function candidateFilesExpireAt(c: RetentionCandidate): Date | null {
  if (c.hiredAt || c.status === "Diterima") return null;
  const last = c.updatedAt.getTime();
  if (CLOSED.has(c.status)) return new Date(last + RECRUITMENT_FILE_RETENTION_DAYS * DAY);
  if (OPEN.has(c.status)) return new Date(last + (RECRUITMENT_STALE_DAYS + RECRUITMENT_FILE_RETENTION_DAYS) * DAY);
  return null; // status tak dikenal → jangan hapus apa pun
}

export function candidateFilesExpired(c: RetentionCandidate, now: Date): boolean {
  const at = candidateFilesExpireAt(c);
  return at !== null && at.getTime() <= now.getTime();
}

/** "/api/recruitment/files/cv-…pdf" → "cv-…pdf"; selain tautan unggahan resmi → null. */
export function recruitmentFileName(url: string | null | undefined): string | null {
  if (!url || !RECRUITMENT_FILE_URL.test(url)) return null;
  return url.slice(url.lastIndexOf("/") + 1);
}

export function isOrphanUpload(mtime: Date, referenced: boolean, now: Date): boolean {
  return !referenced && now.getTime() - mtime.getTime() >= RECRUITMENT_ORPHAN_HOURS * 3_600_000;
}
