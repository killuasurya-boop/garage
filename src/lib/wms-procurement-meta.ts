// Metadata pengadaan WMS yang aman dipakai di client (tanpa DB): status PO, warna, langkah.

export const PO_STATUSES = [
  "draft",
  "pending_approval",
  "approved",
  "wa_opened",
  "sent",
  "confirmed",
  "processing",
  "partial",
  "received",
  "cancelled",
] as const;
export type PoStatus = (typeof PO_STATUSES)[number];

/** Nada warna: abu = draft, biru = diproses, amber = perlu tindakan, merah = gagal/batal, hijau = selesai, ungu = verifikasi bayar. */
export type ProcTone = "gray" | "blue" | "amber" | "red" | "green" | "purple";

export const PO_STATUS_META: Record<PoStatus, { label: string; tone: ProcTone; hint: string }> = {
  draft: { label: "Draft", tone: "gray", hint: "Lengkapi lalu ajukan persetujuan." },
  pending_approval: { label: "Menunggu Persetujuan", tone: "amber", hint: "Owner/Manajer lain perlu menyetujui." },
  approved: { label: "Siap Dikirim", tone: "amber", hint: "Buat PDF lalu kirim lewat WhatsApp." },
  wa_opened: { label: "WhatsApp Dibuka", tone: "amber", hint: "Lampirkan PDF, kirim, lalu konfirmasi terkirim." },
  sent: { label: "Terkirim", tone: "blue", hint: "Tunggu konfirmasi supplier." },
  confirmed: { label: "Dikonfirmasi Supplier", tone: "blue", hint: "Supplier menyetujui pesanan." },
  processing: { label: "Diproses Supplier", tone: "blue", hint: "Barang sedang disiapkan / dikirim." },
  partial: { label: "Diterima Sebagian", tone: "amber", hint: "Sisa barang belum datang." },
  received: { label: "Selesai", tone: "green", hint: "Semua barang diterima." },
  cancelled: { label: "Dibatalkan", tone: "red", hint: "PO tidak berlaku." },
};

export function poStatusMeta(status: string) {
  return PO_STATUS_META[(PO_STATUSES as readonly string[]).includes(status) ? (status as PoStatus) : "draft"];
}

/** Langkah progress stepper (status partial/received menutup langkah "Diterima"). */
export const PO_STEPS = [
  { key: "draft", label: "Draft" },
  { key: "pending_approval", label: "Persetujuan" },
  { key: "approved", label: "Siap kirim" },
  { key: "sent", label: "Terkirim" },
  { key: "confirmed", label: "Dikonfirmasi" },
  { key: "received", label: "Diterima" },
] as const;

const STEP_INDEX: Record<PoStatus, number> = {
  draft: 0,
  pending_approval: 1,
  approved: 2,
  wa_opened: 2,
  sent: 3,
  confirmed: 4,
  processing: 4,
  partial: 5,
  received: 5,
  cancelled: -1,
};

/** Indeks langkah aktif (−1 = batal). Langkah < indeks = selesai. */
export function poStepIndex(status: string): number {
  return STEP_INDEX[(PO_STATUSES as readonly string[]).includes(status) ? (status as PoStatus) : "draft"];
}

/** PO masih boleh diubah (revisi) selama belum ada barang diterima & belum batal. */
export const PO_EDITABLE: readonly PoStatus[] = ["draft", "pending_approval", "approved", "wa_opened", "sent", "confirmed", "processing"];

export const BILL_STATUS_META: Record<string, { label: string; tone: ProcTone }> = {
  unpaid: { label: "Belum dibayar", tone: "red" },
  partial: { label: "Dibayar sebagian", tone: "amber" },
  paid: { label: "Lunas", tone: "green" },
  void: { label: "Dibatalkan", tone: "gray" },
};

export const PAYMENT_STATUS_META: Record<string, { label: string; tone: ProcTone }> = {
  pending_verification: { label: "Menunggu verifikasi", tone: "purple" },
  verified: { label: "Terverifikasi", tone: "green" },
  void: { label: "Dibatalkan", tone: "gray" },
};

export const FUND_SOURCES = ["bank_jago", "bank_bni", "petty", "external"] as const;
export type FundSource = (typeof FUND_SOURCES)[number];
export const FUND_SOURCE_LABEL: Record<FundSource, string> = {
  bank_jago: "Bank Jago",
  bank_bni: "Bank BNI",
  petty: "Kas kecil",
  external: "Uang pribadi Owner",
};

export const SUPPLIER_AREAS = ["bar", "dapur", "umum", "teknik"] as const;
export type SupplierArea = (typeof SUPPLIER_AREAS)[number];
export const SUPPLIER_AREA_LABEL: Record<SupplierArea, string> = { bar: "Bar", dapur: "Dapur", umum: "Umum", teknik: "Teknik" };

const rupiah = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 });

/** Nama file PDF: GARAGE_COFFEE_PO-20261029-AB12_CV_SUSU_SEGAR(_R1).pdf */
export function poPdfFileName(doc: string, supplierName: string, revision: number) {
  const supplier = supplierName
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/[\s-]+/g, "_")
    .toUpperCase()
    .slice(0, 40) || "SUPPLIER";
  return `GARAGE_COFFEE_${doc}_${supplier}${revision > 0 ? `_R${revision}` : ""}.pdf`;
}

/** Pesan WhatsApp PO (Mode 1 & teks pendamping Mode 2). */
export function buildPoWhatsappText(input: {
  supplierName: string;
  doc: string;
  revision: number;
  dateLabel: string;
  itemCount: number;
  estimatedTotal: number | null;
  deliveryAddress: string;
  fileName: string;
}) {
  const lines = [
    "PESANAN BARANG — GARAGE COFFEE",
    "",
    `Kepada: ${input.supplierName}`,
    `Nomor PO: ${input.doc}${input.revision > 0 ? ` (REVISI ${input.revision} — menggantikan dokumen sebelumnya)` : ""}`,
    `Tanggal: ${input.dateLabel}`,
    `Jumlah Produk: ${input.itemCount} item`,
    `Estimasi Total: ${input.estimatedTotal !== null && input.estimatedTotal > 0 ? `Rp${rupiah.format(input.estimatedTotal)} (estimasi, menunggu harga final)` : "-"}`,
    `Alamat Pengiriman: ${input.deliveryAddress || "-"}`,
    "",
    `Kami mengajukan pesanan pembelian sesuai dokumen Purchase Order terlampir (${input.fileName}).`,
    "Mohon konfirmasi ketersediaan barang, harga final, dan estimasi pengiriman.",
    "",
    "Terima kasih.",
    "Purchasing — Garage Coffee",
  ];
  return lines.join("\n");
}

/** Nomor 08… / 62… / +62… → 62… untuk wa.me. null bila tidak valid. */
export function waRecipient(phone: string | null | undefined): string | null {
  const digits = (phone ?? "").replace(/\D/g, "");
  if (digits.length < 9 || digits.length > 16) return null;
  if (digits.startsWith("0")) return `62${digits.slice(1)}`;
  if (digits.startsWith("62")) return digits;
  return null;
}
