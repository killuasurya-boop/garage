import { describe, expect, it } from "vitest";

import { candidateFilesExpireAt, candidateFilesExpired, isOrphanUpload, recruitmentFileName } from "@/lib/recruitment-retention";

const DAY = 86_400_000;
const base = new Date("2026-01-01T00:00:00Z");
const at = (days: number) => new Date(base.getTime() + days * DAY);

describe("aturan simpan berkas pelamar (Owner 19 Nov 2026)", () => {
  it("Diterima / sudah karyawan → tidak pernah dihapus", () => {
    expect(candidateFilesExpireAt({ status: "Diterima", hiredAt: null, updatedAt: base })).toBeNull();
    expect(candidateFilesExpireAt({ status: "Ditolak", hiredAt: base, updatedAt: base })).toBeNull();
  });

  it("Ditolak / Talent Pool → 6 bulan (180 hari) setelah keputusan terakhir", () => {
    for (const status of ["Ditolak", "Talent Pool"]) {
      const c = { status, hiredAt: null, updatedAt: base };
      expect(candidateFilesExpired(c, at(179))).toBe(false);
      expect(candidateFilesExpired(c, at(180))).toBe(true);
    }
  });

  it("Baru / Diproses / Interview tanpa kabar → 90 hari dianggap selesai + 180 hari", () => {
    for (const status of ["Baru", "Diproses", "Interview"]) {
      const c = { status, hiredAt: null, updatedAt: base };
      expect(candidateFilesExpired(c, at(269))).toBe(false);
      expect(candidateFilesExpired(c, at(270))).toBe(true);
    }
  });

  it("status tak dikenal → aman, tidak dihapus", () => {
    expect(candidateFilesExpireAt({ status: "Lain", hiredAt: null, updatedAt: base })).toBeNull();
  });

  it("nama berkas hanya dari tautan unggahan resmi", () => {
    expect(recruitmentFileName("/api/recruitment/files/ktp-1763500000000-abcdef12.jpg")).toBe("ktp-1763500000000-abcdef12.jpg");
    expect(recruitmentFileName("https://contoh.com/cv.pdf")).toBeNull();
    expect(recruitmentFileName("/api/recruitment/files/../../etc/passwd")).toBeNull();
    expect(recruitmentFileName(null)).toBeNull();
  });

  it("unggahan tak tertaut dianggap sampah setelah 24 jam", () => {
    const now = new Date(base.getTime() + 24 * 3_600_000);
    expect(isOrphanUpload(base, false, now)).toBe(true);
    expect(isOrphanUpload(new Date(now.getTime() - 3_600_000), false, now)).toBe(false);
    expect(isOrphanUpload(base, true, now)).toBe(false);
  });
});
