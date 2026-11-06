// Aturan & label bersama sistem Persetujuan (dipakai server + UI).
// Aman diimport dari komponen client — tidak ada dependensi server.

export type ApprovalCategory =
  | "void"
  | "refund"
  | "diskon"
  | "pengeluaran"
  | "selisih_kas"
  | "stok"
  | "dokumen"
  | "lainnya";

export type ApprovalStatus = "pending" | "approved" | "rejected" | "expired" | "superseded";

// Prefix ID approval → kategori. ID dibuat server dengan pola APP-<KODE>-<ref>.
const CATEGORY_BY_PREFIX: Array<[string, ApprovalCategory]> = [
  ["APP-VOID-", "void"],
  // Production Hub V4: batal sebagian item bill BELUM lunas (dieksekusi = pisah bill + void bill pisahan).
  ["APP-PCX-", "void"],
  ["APP-RFD-", "refund"],
  ["APP-DISC-", "diskon"],
  ["APP-EXP-", "pengeluaran"],
  ["APP-CASH-", "selisih_kas"],
  ["APP-OPN-", "stok"],
  ["APP-ADJ-", "stok"],
  // Batch 7: versi dokumen/SOP baru baru berlaku setelah disetujui.
  ["APP-DOC-", "dokumen"],
];

// Fallback untuk baris lama/seed yang ID-nya tidak mengikuti pola prefix.
const CATEGORY_BY_TYPE: Record<string, ApprovalCategory> = {
  "void transaksi": "void",
  "batal item (belum bayar)": "void",
  refund: "refund",
  "refund item": "refund",
  "diskon manual": "diskon",
  expense: "pengeluaran",
  pengeluaran: "pengeluaran",
  "selisih kas closing": "selisih_kas",
  "selisih kas": "selisih_kas",
  "stock adjustment": "stok",
  "penyesuaian stok": "stok",
};

export function approvalCategoryOf(row: { id: string; type: string }): ApprovalCategory {
  for (const [prefix, category] of CATEGORY_BY_PREFIX) {
    if (row.id.startsWith(prefix)) return category;
  }
  return CATEGORY_BY_TYPE[row.type.trim().toLowerCase()] ?? "lainnya";
}

export const APPROVAL_CATEGORY_LABEL: Record<ApprovalCategory, string> = {
  void: "Batal order (void)",
  refund: "Refund item",
  diskon: "Diskon manual",
  pengeluaran: "Pengeluaran",
  selisih_kas: "Selisih kas",
  stok: "Penyesuaian stok",
  dokumen: "Dokumen / SOP",
  lainnya: "Lainnya",
};

export const APPROVAL_STATUS_LABEL: Record<string, string> = {
  pending: "Menunggu",
  approved: "Disetujui",
  rejected: "Ditolak",
  expired: "Kedaluwarsa",
  superseded: "Digantikan (sumber sudah berubah)",
};

export const APPROVAL_RISK_LABEL: Record<string, string> = {
  high: "Risiko tinggi",
  medium: "Risiko sedang",
  low: "Risiko rendah",
};

export function approvalStatusLabel(status: string) {
  return APPROVAL_STATUS_LABEL[status] ?? status;
}

export function approvalRiskLabel(risk: string) {
  return APPROVAL_RISK_LABEL[risk.toLowerCase()] ?? risk;
}

// ─── Alasan batal / refund order ─────────────────────────────
// Kasir wajib memilih salah satu kode; "lainnya" wajib disertai catatan.

export const ORDER_CANCEL_REASONS = [
  { code: "salah_input", label: "Salah input kasir" },
  { code: "pelanggan_batal", label: "Pelanggan batal pesan" },
  { code: "menu_habis", label: "Menu / bahan habis" },
  { code: "komplain_kualitas", label: "Komplain kualitas / rasa" },
  { code: "pesanan_ganda", label: "Pesanan tercatat ganda" },
  { code: "terlalu_lama", label: "Pesanan terlalu lama" },
  { code: "lainnya", label: "Lainnya (tulis catatan)" },
] as const;

export type OrderCancelReasonCode = (typeof ORDER_CANCEL_REASONS)[number]["code"];

export const ORDER_CANCEL_REASON_CODES = ORDER_CANCEL_REASONS.map((r) => r.code) as [
  OrderCancelReasonCode,
  ...OrderCancelReasonCode[],
];

export function orderCancelReasonLabel(code: string) {
  return ORDER_CANCEL_REASONS.find((r) => r.code === code)?.label ?? code;
}

/** Gabungkan kode alasan + catatan jadi satu kalimat untuk audit & approval. */
export function composeCancelReason(code: string, note?: string | null) {
  const label = code === "lainnya" ? "Lainnya" : orderCancelReasonLabel(code);
  const trimmed = note?.trim();
  return trimmed ? `${label} — ${trimmed}` : label;
}

export function validateCancelReason(code: string, note?: string | null): string | null {
  if (!ORDER_CANCEL_REASON_CODES.includes(code as OrderCancelReasonCode)) {
    return "Pilih alasan pembatalan.";
  }
  if (code === "lainnya" && (note?.trim().length ?? 0) < 3) {
    return "Alasan \"Lainnya\" wajib diberi catatan minimal 3 karakter.";
  }
  return null;
}

// ─── Template alasan keputusan Manajer ───────────────────────

export const APPROVE_REASON_TEMPLATES = [
  "Sesuai SOP",
  "Sudah dicek Manajer",
  "Bukti lengkap",
  "Pelanggan mendesak, dampak kecil",
];

export const REJECT_REASON_TEMPLATES = [
  "Nominal terlalu besar — perlu bukti tambahan",
  "Bukti transaksi tidak lengkap",
  "Di luar aturan outlet",
  "Pelanggan belum konfirmasi",
  "Diskon / voucher tidak sesuai SOP",
];

// Data tambahan yang disimpan di approvals.payload.
export type RefundPayloadItem = {
  orderItemId: string;
  itemName: string;
  variantLabel: string;
  qty: number;
  unitPrice: number;
};

export type ApprovalPayload = {
  orderId?: string;
  orderNo?: string;
  reasonCode?: string;
  note?: string | null;
  refundAmount?: number;
  items?: RefundPayloadItem[];
  cashSessionId?: string;
  expenseId?: string;
  /** Approval expense 2 tingkat (PRD Finance §46): review Manajer sebelum keputusan Owner. */
  managerReview?: { by: string; name: string; at: string };
  /** Diskon manual: nominal maksimum yang disetujui & kasir peminta. */
  discountAmount?: number;
  /** ID user pemohon (Better Auth `user.id`). Baris PCX lama (sebelum Nov 2026) berisi nama "Nama / Peran". */
  requestedBy?: string;
  /** Nama tampilan pemohon ("Nama / Peran"), hanya untuk tampilan/audit. */
  requestedByName?: string;
  /** APP-DOC: versi dokumen yang diajukan untuk berlaku. */
  documentId?: string;
  versionId?: string;
  documentVersion?: number;
  documentTitle?: string;
  sha256?: string;
  /** APP-PCX: bill pisahan yang sudah dibuat (pelaksanaan diulang tidak memisah dua kali). */
  splitChildId?: string;
};
