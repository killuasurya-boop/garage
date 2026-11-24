// Produk mandiri mitra (Owner Nov 2026): mitra mengajukan produk sendiri dari Portal Mitra.
// Aturan murni (tanpa DB) — dipakai service, route, dan UI portal/staf.
//
// Alur: mitra ajukan → "pending" (produk NONAKTIF, menu diarsipkan, tidak bisa dipesan)
//   → Owner setujui  → "approved" (link aktif, menu aktif — lewat setPartnerProductActive yang sudah ada)
//   → Owner/Manajer minta perbaikan → "revision" (+ catatan) → mitra perbaiki → "pending" lagi
//   → mitra tarik pengajuan → "withdrawn" (disembunyikan; kode produk tidak dipakai ulang).
// Produk yang didaftarkan staf memakai submission_status NULL (alur lama, tidak berubah).

export const SUBMISSION_STATUSES = ["pending", "revision", "approved", "withdrawn"] as const;
export type SubmissionStatus = (typeof SUBMISSION_STATUSES)[number];

/** Batas pengajuan terbuka (menunggu + perlu perbaikan) per mitra — mencegah antrean Owner menumpuk. */
export const MAX_OPEN_PARTNER_SUBMISSIONS = 10;
export const MAX_SUBMISSION_VARIANTS = 6;
export const MAX_PARTNER_PRICE = 10_000_000;

export const SUBMISSION_STATUS_LABEL: Record<SubmissionStatus, string> = {
  pending: "Menunggu persetujuan",
  revision: "Perlu perbaikan",
  approved: "Disetujui",
  withdrawn: "Ditarik",
};

/** Kategori yang disarankan di formulir (mitra tetap boleh mengetik kategori sendiri). */
export const PARTNER_CATEGORY_SUGGESTIONS = ["Makanan", "Minuman", "Dessert", "Snack", "Frozen", "Paket"] as const;

export type PartnerProductView = "selling" | "inactive" | SubmissionStatus;

/** Status tampilan satu produk mitra (portal & staf). */
export function partnerProductView(input: { active: boolean; submissionStatus: string | null }): PartnerProductView {
  if (input.active) return "selling";
  if (input.submissionStatus === "pending" || input.submissionStatus === "revision" || input.submissionStatus === "withdrawn") {
    return input.submissionStatus;
  }
  return "inactive";
}

/** Mitra hanya boleh mengubah / menarik pengajuan yang belum pernah disetujui. */
export function canPartnerEditSubmission(submissionStatus: string | null) {
  return submissionStatus === "pending" || submissionStatus === "revision";
}

export type SubmissionVariantInput = { label: string; unitCost: number; sellPrice: number };
export type SubmissionInput = {
  name: string;
  category: string;
  description?: string | null;
  note?: string | null;
  variants: SubmissionVariantInput[];
};

/** Masalah isian (bahasa awam, untuk ditampilkan langsung ke mitra). Kosong = boleh dikirim. */
export function partnerSubmissionProblems(input: SubmissionInput): string[] {
  const problems: string[] = [];
  const name = input.name.trim();
  if (name.length < 2) problems.push("Nama produk minimal 2 huruf.");
  if (name.length > 120) problems.push("Nama produk maksimal 120 huruf.");
  const category = input.category.trim();
  if (category.length < 2) problems.push("Pilih atau ketik kategori produk.");
  if (category.length > 60) problems.push("Kategori maksimal 60 huruf.");
  if ((input.description ?? "").trim().length > 500) problems.push("Deskripsi maksimal 500 huruf.");
  if ((input.note ?? "").trim().length > 300) problems.push("Catatan untuk Garage maksimal 300 huruf.");
  if (!input.variants.length) problems.push("Isi minimal satu harga.");
  if (input.variants.length > MAX_SUBMISSION_VARIANTS) problems.push(`Maksimal ${MAX_SUBMISSION_VARIANTS} varian per produk.`);
  const seen = new Set<string>();
  input.variants.forEach((variant, index) => {
    const label = variant.label.trim() || (input.variants.length === 1 ? "Regular" : "");
    const name = label || `Varian ${index + 1}`;
    if (!label) problems.push(`${name}: isi nama varian (mis. Kecil, Besar, Isi 4).`);
    if (label.length > 60) problems.push(`${name}: nama varian maksimal 60 huruf.`);
    const key = label.toLowerCase();
    if (label && seen.has(key)) problems.push(`Nama varian "${label}" dobel.`);
    seen.add(key);
    if (!Number.isInteger(variant.unitCost) || variant.unitCost <= 0) problems.push(`${name}: isi harga setor (rupiah bulat, lebih dari 0).`);
    if (!Number.isInteger(variant.sellPrice) || variant.sellPrice <= 0) problems.push(`${name}: isi harga jual (rupiah bulat, lebih dari 0).`);
    if (variant.unitCost > MAX_PARTNER_PRICE || variant.sellPrice > MAX_PARTNER_PRICE) problems.push(`${name}: harga terlalu besar.`);
    if (Number.isInteger(variant.unitCost) && Number.isInteger(variant.sellPrice) && variant.sellPrice > 0 && variant.sellPrice < variant.unitCost) {
      problems.push(`${name}: harga jual tidak boleh di bawah harga setor.`);
    }
  });
  return problems;
}

/** Label varian rapi: satu varian tanpa nama = "Regular". */
export function normalizedVariantLabel(label: string, total: number) {
  const trimmed = label.trim();
  return trimmed || (total === 1 ? "Regular" : trimmed);
}

/** ID varian stabil dari label (huruf kecil, a-z0-9-, maks 30, unik dalam satu produk). */
export function submissionVariantIds(labels: string[]): string[] {
  const used = new Set<string>();
  return labels.map((label, index) => {
    const base =
      label
        .toLowerCase()
        .normalize("NFKD")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 24) || `v${index + 1}`;
    let id = base;
    let n = 2;
    while (used.has(id)) id = `${base}-${n++}`;
    used.add(id);
    return id;
  });
}

/**
 * Kode produk berikutnya untuk mitra: `<KODE MITRA>-M<nn>` (M = diajukan Mitra), mis. DSM-M01.
 * Mengikuti pola kode produk staf (3–20 huruf/angka/strip); kode yang sudah terpakai dilewati.
 */
export function nextPartnerSubmissionCode(partnerCode: string, takenCodes: Iterable<string>) {
  const prefix = partnerCode.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 12) || "MTR";
  const taken = new Set([...takenCodes].map((code) => code.toUpperCase()));
  for (let n = 1; n < 1000; n += 1) {
    const code = `${prefix}-M${String(n).padStart(2, "0")}`;
    if (!taken.has(code)) return code;
  }
  throw new Error("Kode produk mitra habis.");
}

/** Bagian Garage per unit (harga jual − harga setor) — hanya informasi di formulir. */
export function garageShare(variant: { unitCost: number; sellPrice: number }) {
  return Math.max(0, variant.sellPrice - variant.unitCost);
}

// ─── Antrean pengajuan untuk Owner/Manajer (dashboard & Kelola Mitra) ────────

/** Target Owner memeriksa pengajuan; lebih lama dari ini ditandai "terlambat" (merah). */
export const SUBMISSION_REVIEW_TARGET_HOURS = 24;

/** Umur pengajuan dalam bahasa awam: "baru saja", "25 mnt lalu", "3 jam lalu", "2 hari lalu". */
export function submissionAgeLabel(submittedAt: Date | string | null, now: Date = new Date()) {
  if (!submittedAt) return "-";
  const minutes = Math.max(0, Math.floor((now.getTime() - new Date(submittedAt).getTime()) / 60_000));
  if (minutes < 2) return "baru saja";
  if (minutes < 60) return `${minutes} mnt lalu`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} jam lalu`;
  return `${Math.floor(hours / 24)} hari lalu`;
}

/** Waktu lengkap WIB untuk tooltip/keterangan, mis. "Sen, 23 Nov 20.31 WIB". */
export function submissionTimeWib(submittedAt: Date | string | null) {
  if (!submittedAt) return "-";
  const text = new Intl.DateTimeFormat("id-ID", { timeZone: "Asia/Jakarta", weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(submittedAt));
  return `${text} WIB`;
}

export function isSubmissionOverdue(submittedAt: Date | string | null, now: Date = new Date()) {
  return Boolean(submittedAt) && now.getTime() - new Date(submittedAt!).getTime() > SUBMISSION_REVIEW_TARGET_HOURS * 3_600_000;
}

export type SubmissionQueueRow = { status: string | null; submittedAt: Date | string | null };

/** Ringkasan antrean: jumlah menunggu Owner, dikembalikan ke mitra, terlambat, dan pengajuan tertua yang menunggu. */
export function summarizeSubmissionQueue(rows: SubmissionQueueRow[], now: Date = new Date()) {
  const pending = rows.filter((row) => row.status === "pending");
  const oldest = pending
    .map((row) => row.submittedAt)
    .filter((at): at is Date | string => Boolean(at))
    .sort((a, b) => new Date(a).getTime() - new Date(b).getTime())[0];
  return {
    pending: pending.length,
    revision: rows.filter((row) => row.status === "revision").length,
    overdue: pending.filter((row) => isSubmissionOverdue(row.submittedAt, now)).length,
    oldestSubmittedAt: oldest ? new Date(oldest).toISOString() : null,
  };
}

// ─── Cek kualitas foto produk (di HP mitra, sebelum unggah; hanya saran, tidak memblokir) ─

/** Menu digital menampilkan foto kotak; ukuran ideal 800×800 (sama dengan foto menu Garage). */
export const PHOTO_IDEAL_SIZE = 800;

/**
 * meanLuma = rata-rata kecerahan 0–255; p90Luma = kecerahan bagian terang (persentil 90).
 * "Gelap" dinilai dari p90: foto menu Garage bergaya gelap (rata-rata ±65) tetapi objeknya terang (p90 ≥ 82),
 * sedangkan foto kurang cahaya tidak punya bagian terang sama sekali.
 */
export type PhotoStats = { width: number; height: number; meanLuma: number; p90Luma: number };

/** Saran kualitas foto dalam bahasa awam. Kosong = foto sudah baik. */
export function photoQualityHints(stats: PhotoStats): string[] {
  const hints: string[] = [];
  const short = Math.min(stats.width, stats.height);
  const ratio = Math.max(stats.width, stats.height) / Math.max(1, short);
  if (stats.p90Luma < 75) hints.push("Foto tampak gelap. Coba foto di tempat lebih terang atau dekat jendela.");
  else if (stats.meanLuma > 215) hints.push("Foto tampak terlalu terang/pucat. Kurangi cahaya atau matikan flash.");
  if (short < 500) hints.push(`Resolusi kecil (${stats.width}×${stats.height}). Foto bisa pecah; pakai foto minimal ${PHOTO_IDEAL_SIZE}×${PHOTO_IDEAL_SIZE}.`);
  if (ratio > 1.35) hints.push("Foto tidak kotak, tepinya akan terpotong di menu. Pastikan produk ada di tengah.");
  return hints;
}
