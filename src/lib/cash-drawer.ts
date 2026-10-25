// =============================================================================
// Kas Keluar / Masuk Laci (owner, Okt 2026) — katalog kategori bersama UI &
// server. Satu sumber kebenaran untuk: arah uang, kelompok laporan, apakah
// jadi pengeluaran Finance, field wajib, dan aturan konfirmasi/persetujuan.
//
// Prinsip keuangan:
//   - Hanya kategori ber-`expenseCategory` yang jadi pengeluaran tunai Finance.
//     Kasbon → expense "Kasbon" (non_pnl). Refund, setoran, brankas TIDAK jadi biaya.
//   - Kas masuk tidak pernah jadi penjualan/pendapatan.
//   - Penjualan tunai tetap dari modul pembayaran POS, bukan dari kas masuk.
// =============================================================================

export type CashDrawerDirection = "out" | "in";

/** Kelompok ringkasan laporan shift (urutan = urutan tampil). */
export type CashDrawerGroup =
  | "operational"
  | "advance"
  | "refund"
  | "capital"
  | "return"
  | "transfer"
  | "other";

export const CASH_DRAWER_GROUP_LABELS: Record<CashDrawerGroup, string> = {
  operational: "Belanja operasional",
  advance: "Kasbon",
  refund: "Refund",
  capital: "Tambahan modal kas",
  return: "Pengembalian dana",
  transfer: "Setoran / pemindahan kas",
  other: "Lain-lain",
};

export const CASH_DRAWER_GROUP_ORDER: CashDrawerGroup[] = [
  "operational",
  "advance",
  "refund",
  "capital",
  "return",
  "transfer",
  "other",
];

export type CashDrawerField =
  | "counterparty"
  | "vendorName"
  | "receiptNo"
  | "orderRef"
  | "employee"
  | "relatedRef"
  | "depositAccount";

export type CashDrawerCategory = {
  key: string;
  label: string;
  direction: CashDrawerDirection;
  group: CashDrawerGroup;
  /** Kategori expense Finance (hanya kas keluar). null = bukan biaya. */
  expenseCategory: string | null;
  /** Ikut biaya "Belanja bahan" (sourceDoc EXP:…#area). */
  countAsPurchase?: boolean;
  fields: CashDrawerField[];
  required: CashDrawerField[];
  counterpartyLabel?: string;
  placeholder: string;
  hint: string;
  /** Selalu tampilkan ringkasan sebelum simpan. */
  alwaysConfirm?: boolean;
  /** Kasir selalu butuh persetujuan Manajer/Owner, berapa pun nominalnya. */
  requiresApproval?: boolean;
  /** Tidak dipakai lagi untuk transaksi baru (baris lama tetap terbaca). */
  retired?: boolean;
};

/** Rekening tujuan setoran (owner, 25 Okt 2026: tidak ada brankas / serah langsung ke Owner). */
export const DEPOSIT_ACCOUNTS = ["bank_jago", "bank_bni"] as const;
export type DepositAccount = (typeof DEPOSIT_ACCOUNTS)[number];
export const DEPOSIT_ACCOUNT_LABEL: Record<DepositAccount, string> = {
  bank_jago: "Rekening Jago",
  bank_bni: "Rekening BNI",
};

export const CASH_DRAWER_CATEGORIES: CashDrawerCategory[] = [
  // ─── Kas keluar ───────────────────────────────────────────────────────────
  {
    key: "belanja_bar",
    label: "Belanja Bar",
    direction: "out",
    group: "operational",
    expenseCategory: "Belanja Bar",
    countAsPurchase: true,
    fields: ["vendorName", "receiptNo"],
    required: [],
    placeholder: "Beli 2 liter susu UHT untuk bar",
    hint: "Masuk biaya belanja bahan bar.",
  },
  {
    key: "belanja_dapur",
    label: "Belanja Dapur",
    direction: "out",
    group: "operational",
    expenseCategory: "Belanja Dapur",
    countAsPurchase: true,
    fields: ["vendorName", "receiptNo"],
    required: [],
    placeholder: "Beli 1 kg bawang merah untuk dapur",
    hint: "Masuk biaya belanja bahan dapur.",
  },
  {
    key: "air_es",
    label: "Beli Air/Es",
    direction: "out",
    group: "operational",
    expenseCategory: "Beli Air",
    fields: ["vendorName", "receiptNo"],
    required: [],
    placeholder: "Beli 1 galon air mineral untuk operasional",
    hint: "Biaya operasional (air galon, es batu).",
  },
  {
    key: "transport",
    label: "Transportasi/Parkir",
    direction: "out",
    group: "operational",
    expenseCategory: "Transport",
    fields: ["counterparty"],
    required: [],
    counterpartyLabel: "Dibayar ke / dipakai oleh",
    placeholder: "Parkir saat pembelian bahan dapur",
    hint: "Biaya operasional transport & parkir.",
  },
  {
    key: "perlengkapan",
    label: "Perlengkapan Operasional",
    direction: "out",
    group: "operational",
    expenseCategory: "Operasional",
    fields: ["vendorName", "receiptNo"],
    required: [],
    placeholder: "Beli 1 pak kantong plastik & tisu",
    hint: "Biaya operasional (plastik, tisu, sabun).",
  },
  {
    key: "kasbon",
    label: "Kasbon Karyawan",
    direction: "out",
    group: "advance",
    expenseCategory: "Kasbon",
    fields: ["employee"],
    required: ["employee"],
    placeholder: "Kasbon untuk kebutuhan mendesak",
    hint: "Bukan biaya. Masuk kasbon karyawan & dipotong otomatis saat gajian.",
    alwaysConfirm: true,
  },
  {
    key: "refund_pelanggan",
    label: "Pengembalian Dana Pelanggan",
    direction: "out",
    group: "refund",
    expenseCategory: null,
    fields: ["orderRef", "counterparty"],
    required: ["orderRef"],
    counterpartyLabel: "Nama pelanggan",
    placeholder: "Kembalikan kelebihan bayar pelanggan",
    hint: "Bukan biaya. Wajib nomor order; refund order lewat menu Refund POS jangan dicatat ulang.",
    alwaysConfirm: true,
    requiresApproval: true,
  },
  {
    key: "setoran",
    label: "Setoran ke Rekening Bank",
    direction: "out",
    group: "transfer",
    expenseCategory: null,
    fields: ["depositAccount", "counterparty", "receiptNo"],
    required: ["depositAccount", "counterparty"],
    counterpartyLabel: "Disetor oleh",
    placeholder: "Setor tunai ke Rekening Jago",
    hint: "Bukan biaya — uang pindah ke rekening. Status \"dalam perjalanan\" sampai Owner/Manajer lain mengonfirmasi bukti setor.",
    alwaysConfirm: true,
    requiresApproval: true,
  },
  {
    key: "brankas",
    label: "Pemindahan ke Brankas",
    direction: "out",
    group: "transfer",
    expenseCategory: null,
    fields: ["counterparty"],
    required: [],
    counterpartyLabel: "Saksi / pemegang kunci",
    placeholder: "Pindahkan pecahan besar ke brankas",
    hint: "Tidak dipakai lagi — Garage tidak memakai brankas. Gunakan Setoran ke Rekening Bank.",
    alwaysConfirm: true,
    retired: true,
  },
  {
    key: "lain_keluar",
    label: "Pengeluaran Lain-lain",
    direction: "out",
    group: "other",
    expenseCategory: "Lain-lain",
    fields: ["counterparty", "receiptNo"],
    required: ["counterparty"],
    counterpartyLabel: "Penerima uang",
    placeholder: "Bayar jasa angkut galon",
    hint: "Biaya lain-lain. Jelaskan alasan di deskripsi.",
  },
  // ─── Kas masuk ────────────────────────────────────────────────────────────
  {
    key: "modal",
    label: "Tambahan Modal Kas",
    direction: "in",
    group: "capital",
    expenseCategory: null,
    fields: ["counterparty"],
    required: ["counterparty"],
    counterpartyLabel: "Pemberi uang",
    placeholder: "Tambahan modal laci dari Owner",
    hint: "Bukan pendapatan penjualan.",
  },
  {
    key: "kembalian",
    label: "Tambahan Uang Kembalian",
    direction: "in",
    group: "capital",
    expenseCategory: null,
    fields: ["counterparty"],
    required: ["counterparty"],
    counterpartyLabel: "Pemberi uang",
    placeholder: "Tambahan uang pecahan untuk kembalian",
    hint: "Bukan pendapatan penjualan.",
  },
  {
    key: "bayar_kasbon",
    label: "Pengembalian Kasbon",
    direction: "in",
    group: "advance",
    expenseCategory: null,
    fields: ["employee"],
    required: ["employee"],
    placeholder: "Cicilan pengembalian kasbon tunai",
    hint: "Mengurangi sisa kasbon karyawan. Bukan pendapatan.",
    alwaysConfirm: true,
  },
  {
    key: "sisa_belanja",
    label: "Pengembalian Dana Belanja",
    direction: "in",
    group: "return",
    expenseCategory: null,
    fields: ["relatedRef", "counterparty"],
    required: [],
    counterpartyLabel: "Dikembalikan oleh",
    placeholder: "Pengembalian sisa uang belanja bahan",
    hint: "Isi nomor ref kas keluar asal supaya biaya belanjanya ikut berkurang.",
  },
  {
    key: "penggantian",
    label: "Penggantian Pengeluaran",
    direction: "in",
    group: "return",
    expenseCategory: null,
    fields: ["counterparty", "relatedRef"],
    required: ["counterparty"],
    counterpartyLabel: "Pemberi penggantian",
    placeholder: "Owner mengganti uang parkir yang dibayar dari laci",
    hint: "Bukan pendapatan penjualan.",
  },
  {
    key: "lain_masuk",
    label: "Penerimaan Tunai Lainnya",
    direction: "in",
    group: "other",
    expenseCategory: null,
    fields: ["counterparty"],
    required: ["counterparty"],
    counterpartyLabel: "Pemberi uang",
    placeholder: "Uang titipan untuk dibayarkan ke kurir",
    hint: "Bukan penjualan. Pembayaran pelanggan wajib lewat POS.",
  },
];

const BY_KEY = new Map(CASH_DRAWER_CATEGORIES.map((category) => [category.key, category]));

// Kategori lama (sebelum Okt 2026) disimpan sebagai label bebas.
const LEGACY_LABELS: Record<string, string> = {
  "belanja bar": "belanja_bar",
  "belanja dapur": "belanja_dapur",
  "beli air/es": "air_es",
  transport: "transport",
  kasbon: "kasbon",
  "tambah uang kecil": "kembalian",
  "setoran owner": "modal",
  operasional: "perlengkapan",
};

export function cashDrawerCategory(key: string | null | undefined): CashDrawerCategory | null {
  return key ? BY_KEY.get(key) ?? null : null;
}

export function cashDrawerCategoriesFor(direction: CashDrawerDirection) {
  return CASH_DRAWER_CATEGORIES.filter((category) => category.direction === direction && !category.retired);
}

/** Kelompok laporan untuk baris lama & baru (fallback: lain-lain). */
export function cashDrawerGroupOf(row: { categoryKey?: string | null; category: string }): CashDrawerGroup {
  const key = row.categoryKey ?? LEGACY_LABELS[row.category.trim().toLowerCase()] ?? null;
  return cashDrawerCategory(key)?.group ?? "other";
}

export const CASH_DRAWER_FIELD_LABELS: Record<CashDrawerField, string> = {
  counterparty: "Pihak terkait",
  vendorName: "Toko / pemasok",
  receiptNo: "No. nota / bukti",
  orderRef: "No. order terkait",
  employee: "Karyawan",
  relatedRef: "Ref kas keluar asal",
  depositAccount: "Rekening tujuan",
};

export type CashDrawerStatus = "recorded" | "pending_approval" | "rejected" | "voided";

export const CASH_DRAWER_STATUS_LABELS: Record<string, string> = {
  recorded: "Tercatat",
  pending_approval: "Menunggu persetujuan",
  rejected: "Ditolak",
  voided: "Dibatalkan",
};

/** "50.000" / "Rp50.000" / "50000" → 50000. NaN bila bukan angka bulat positif. */
export function parseRupiahInput(raw: string): number {
  const digits = raw.replace(/[^\d]/g, "");
  if (!digits) return Number.NaN;
  return Number(digits);
}

export function formatRupiahInput(raw: string): string {
  const value = parseRupiahInput(raw);
  if (!Number.isFinite(value)) return "";
  return new Intl.NumberFormat("id-ID").format(value);
}

/** Kasir perlu persetujuan Manajer/Owner untuk transaksi ini? */
export function cashDrawerNeedsApproval(
  category: CashDrawerCategory,
  amount: number,
  threshold: number,
): boolean {
  return Boolean(category.requiresApproval) || amount >= threshold;
}

/** Saldo laci: kas keluar mengurangi, kas masuk menambah. */
export function cashDrawerDelta(direction: CashDrawerDirection, amount: number) {
  return direction === "out" ? -amount : amount;
}

/**
 * Kunci katalog atau label (termasuk label lama) → kategori, hanya bila arahnya
 * cocok. null = kategori tidak sesuai jenis transaksi.
 */
export function resolveCashDrawerCategory(
  direction: CashDrawerDirection,
  keyOrLabel: string,
): CashDrawerCategory | null {
  const raw = keyOrLabel.trim();
  if (!raw) return null;
  const lower = raw.toLowerCase();
  const found =
    BY_KEY.get(raw) ??
    CASH_DRAWER_CATEGORIES.find((category) => category.direction === direction && category.label.toLowerCase() === lower) ??
    cashDrawerCategory(LEGACY_LABELS[lower]) ??
    (lower === "lain-lain" ? cashDrawerCategory(direction === "out" ? "lain_keluar" : "lain_masuk") : null);
  return found && found.direction === direction ? found : null;
}
