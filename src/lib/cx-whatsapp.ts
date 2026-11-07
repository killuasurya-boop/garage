// =============================================================================
// WhatsApp CX (Customer Experience Engine V4, Nov 2026). Aman diimpor client.
// Mode tetap gratis (keputusan owner Okt 2026): link wa.me berisi teks siap kirim.
// - wa.me hanya mengisi TEKS. Tidak ada lampiran otomatis; tidak ada status
//   terkirim/dibaca — klik dicatat sebagai "dibuka", bukan "terkirim".
// - Pesan transaksi (bukti pesanan) ≠ pesan promosi. Promosi hanya untuk member
//   yang memberi izin (consent terbaru = granted) + batas frekuensi.
// =============================================================================

import { DEFAULT_GARAGE_WHATSAPP, normalizeWaNumber, waLink } from "@/lib/whatsapp-link";

const rupiah = (value: number) => `Rp${Math.round(value).toLocaleString("id-ID")}`;

/** Nomor WA kasir resmi: setting outlet bila valid, selain itu nomor resmi Garage. */
export function cashierWhatsappNumber(configured?: string | null) {
  return normalizeWaNumber(configured) || DEFAULT_GARAGE_WHATSAPP;
}

export type InvoiceConfirmationInput = {
  orderNo: string;
  invoiceNo: string;
  customerName?: string | null;
  includeName: boolean;
  tableLabel?: string | null;
  fulfillmentLabel: string;
  total: number;
  paymentMethod?: string | null;
  /** Label status pembayaran TERCATAT (Lunas/Belum Dibayar/Menunggu Konfirmasi…). */
  paymentStatusLabel: string;
  invoiceUrl: string;
};

/** Template "Kirim Bukti Pesanan ke WhatsApp Kasir" (spesifikasi CX V4 §9). */
export function buildInvoiceConfirmationMessage(input: InvoiceConfirmationInput): string {
  const name = input.includeName ? input.customerName?.trim() : null;
  return [
    "Halo Garage Coffee.",
    "",
    "Saya ingin mengonfirmasi pesanan berikut:",
    "",
    `Nomor Order: ${input.orderNo}`,
    `Nomor Invoice: ${input.invoiceNo}`,
    name ? `Nama: ${name}` : null,
    input.tableLabel ? `Meja: ${input.tableLabel}` : null,
    `Jenis Pesanan: ${input.fulfillmentLabel}`,
    `Total: ${rupiah(input.total)}`,
    `Metode Pembayaran: ${input.paymentMethod?.trim() || "Belum dipilih"}`,
    `Status Pembayaran: ${input.paymentStatusLabel}`,
    "",
    "Link Invoice:",
    input.invoiceUrl,
    "",
    "Mohon bantu cek pesanan saya.",
    "",
    "Terima kasih.",
  ]
    .filter((line): line is string => line !== null)
    .join("\n");
}

/** Bantuan bukti bayar: pelanggan melampirkan screenshot SENDIRI; kasir yang memverifikasi. */
export function buildPaymentProofMessage(input: {
  orderNo: string;
  invoiceNo: string;
  total: number;
  paymentMethod?: string | null;
  invoiceUrl: string;
}): string {
  return [
    "Halo Garage Coffee.",
    "",
    `Saya sudah melakukan pembayaran untuk Nomor Order ${input.orderNo} (Invoice ${input.invoiceNo}).`,
    `Total: ${rupiah(input.total)}`,
    `Metode: ${input.paymentMethod?.trim() || "QRIS"}`,
    "",
    "Bukti pembayaran saya lampirkan di chat ini.",
    "Mohon dicek dan dikonfirmasi ya.",
    "",
    `Link Invoice: ${input.invoiceUrl}`,
  ].join("\n");
}

export function cashierWaLink(text: string, configured?: string | null) {
  return waLink(cashierWhatsappNumber(configured), text);
}

// ---------------------------------------------------------------------------
// Kampanye WhatsApp member (dikirim MANUAL oleh staf lewat wa.me — tanpa API
// berbayar). Template tidak pernah menyebut benefit yang tidak ada di data.
// ---------------------------------------------------------------------------

export type CxCampaignKind = "welcome" | "loyalty_progress" | "voucher_reminder" | "repeat_visit" | "birthday";

export const CX_CAMPAIGN_LABEL: Record<CxCampaignKind, string> = {
  welcome: "A · Welcome member",
  loyalty_progress: "B · Progres level",
  voucher_reminder: "C · Pengingat voucher",
  repeat_visit: "D · Ajak kembali",
  birthday: "E · Ulang tahun",
};

/** Welcome = pesan layanan atas pendaftaran sendiri; sisanya promosi (butuh izin). */
export const CX_CAMPAIGN_IS_PROMO: Record<CxCampaignKind, boolean> = {
  welcome: false,
  loyalty_progress: true,
  voucher_reminder: true,
  repeat_visit: true,
  birthday: true,
};

/** Batas frekuensi promosi per member (hari) — anti spam. */
export const PROMO_MIN_GAP_DAYS = 7;

export function campaignSendBlockReason(input: {
  kind: CxCampaignKind;
  marketingConsent: boolean;
  lastPromoSentAt?: Date | string | null;
  now?: Date;
}): string | null {
  if (!CX_CAMPAIGN_IS_PROMO[input.kind]) return null;
  if (!input.marketingConsent) return "Belum memberi izin promosi WhatsApp.";
  if (input.lastPromoSentAt) {
    const last = new Date(input.lastPromoSentAt);
    const now = input.now ?? new Date();
    if (!Number.isNaN(last.getTime()) && now.getTime() - last.getTime() < PROMO_MIN_GAP_DAYS * 86_400_000) {
      return `Sudah menerima promosi dalam ${PROMO_MIN_GAP_DAYS} hari terakhir.`;
    }
  }
  return null;
}

const STOP_LINE = "Balas STOP bila tidak ingin menerima info promo lagi.";

export type CxCampaignContext = {
  name: string;
  memberCode?: string | null;
  tier: string;
  points?: number | null;
  cardUrl: string;
  menuUrl: string;
  nextTier?: string | null;
  remainingSpend?: number | null;
  voucher?: { title: string; code: string; endsAt: string | null; terms?: string[] } | null;
  offer?: { title: string; benefit: string; endsAt: string | null } | null;
};

function shortDate(value: string | null | undefined) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Jakarta" });
}

export function buildCxCampaignMessage(kind: CxCampaignKind, ctx: CxCampaignContext): string {
  const hello = `Halo ${ctx.name.trim() || "Kak"}, ini Garage Coffee.`;
  switch (kind) {
    case "welcome":
      return [
        hello,
        "",
        `Selamat datang sebagai member ${ctx.tier}!${ctx.memberCode ? ` Kode member: ${ctx.memberCode}.` : ""}`,
        ctx.voucher ? `Welcome reward kamu: ${ctx.voucher.title} (kode ${ctx.voucher.code}${shortDate(ctx.voucher.endsAt) ? `, berlaku s/d ${shortDate(ctx.voucher.endsAt)}` : ""}).` : null,
        "Kartu member digital:",
        ctx.cardUrl,
      ]
        .filter((line): line is string => line !== null)
        .join("\n");
    case "loyalty_progress":
      return [
        hello,
        "",
        `Level kamu sekarang ${ctx.tier}${ctx.points != null ? ` dengan ${ctx.points.toLocaleString("id-ID")} poin` : ""}.`,
        ctx.nextTier && ctx.remainingSpend
          ? `Tinggal belanja ${rupiah(ctx.remainingSpend)} lagi (12 bulan berjalan) untuk naik ke ${ctx.nextTier}.`
          : null,
        "Cek kartu & poin:",
        ctx.cardUrl,
        "",
        STOP_LINE,
      ]
        .filter((line): line is string => line !== null)
        .join("\n");
    case "voucher_reminder":
      return [
        hello,
        "",
        ctx.voucher
          ? `Voucher kamu "${ctx.voucher.title}" (kode ${ctx.voucher.code}) berakhir ${shortDate(ctx.voucher.endsAt) ?? "segera"}.`
          : "Kamu punya voucher yang hampir berakhir.",
        ...(ctx.voucher?.terms ?? []).map((term) => `• ${term}`),
        "Lihat menu:",
        ctx.menuUrl,
        "",
        STOP_LINE,
      ].join("\n");
    case "repeat_visit":
      return [
        hello,
        "",
        "Sudah lama tidak mampir — kami kangen!",
        ctx.offer ? `Penawaran untuk member: ${ctx.offer.title} — ${ctx.offer.benefit}${shortDate(ctx.offer.endsAt) ? ` (s/d ${shortDate(ctx.offer.endsAt)})` : ""}.` : null,
        "Lihat menu:",
        ctx.menuUrl,
        "",
        STOP_LINE,
      ]
        .filter((line): line is string => line !== null)
        .join("\n");
    case "birthday":
      return [
        hello,
        "",
        "Selamat ulang tahun! Semoga harimu menyenangkan. ☕",
        // Birthday reward hanya disebut bila ada voucher nyata untuk member ini.
        ctx.voucher
          ? `Hadiah dari kami: ${ctx.voucher.title} (kode ${ctx.voucher.code}${shortDate(ctx.voucher.endsAt) ? `, s/d ${shortDate(ctx.voucher.endsAt)}` : ""}).`
          : null,
        "",
        STOP_LINE,
      ]
        .filter((line): line is string => line !== null)
        .join("\n");
  }
}
