// =============================================================================
// WhatsApp tanpa biaya (keputusan owner Okt 2026): kasir/kurir/pelanggan membuka
// link wa.me berisi pesan siap kirim — tidak memakai WhatsApp Cloud API berbayar.
// File ini aman di-import dari client component (tanpa dependency server).
// =============================================================================

export const DEFAULT_GARAGE_WHATSAPP = "6285121552341";

/** "0812-3456 7890" / "+62812…" / "62812…" → "62812…". Kosong bila tidak valid. */
export function normalizeWaNumber(raw: string | null | undefined): string {
  const digits = String(raw ?? "").replace(/\D/g, "");
  if (!digits) return "";
  let normalized = digits;
  if (normalized.startsWith("0")) normalized = `62${normalized.slice(1)}`;
  else if (normalized.startsWith("8")) normalized = `62${normalized}`;
  if (!/^628\d{7,12}$/.test(normalized)) return "";
  return normalized;
}

/** Link wa.me; null bila nomor tidak valid (tombol disembunyikan/disabled). */
export function waLink(phone: string | null | undefined, text?: string): string | null {
  const number = normalizeWaNumber(phone);
  if (!number) return null;
  return text ? `https://wa.me/${number}?text=${encodeURIComponent(text)}` : `https://wa.me/${number}`;
}

export type CustomerWhatsappKind =
  | "awaiting_payment"
  | "paid"
  | "in_production"
  | "ready_pickup"
  | "on_the_way"
  | "delivered"
  | "rejected";

export type CustomerWhatsappOrder = {
  orderNo: string;
  customerName?: string | null;
  total: number;
  deliveryFee?: number | null;
  fulfillment?: string | null;
  paymentMethod?: string | null;
  rejectionReason?: string | null;
  courierName?: string | null;
  trackingUrl?: string | null;
  autoRejectMinutes?: number | null;
};

const rupiah = (value: number) => `Rp${Math.round(value).toLocaleString("id-ID")}`;

export const CUSTOMER_WHATSAPP_LABEL: Record<CustomerWhatsappKind, string> = {
  awaiting_payment: "Minta pembayaran",
  paid: "Pembayaran diterima",
  in_production: "Sedang dibuat",
  ready_pickup: "Siap diambil",
  on_the_way: "Dalam pengantaran",
  delivered: "Sudah sampai",
  rejected: "Pesanan ditolak",
};

/** Pesan WA ke pelanggan sesuai status — bahasa ramah, singkat, tanpa singkatan aneh. */
export function buildCustomerWhatsappMessage(order: CustomerWhatsappOrder, kind: CustomerWhatsappKind): string {
  const name = order.customerName?.trim() || "Kak";
  const type = order.fulfillment === "delivery" ? "Delivery" : order.fulfillment === "takeaway" ? "Take away" : "Pesanan";
  const head = `Halo ${name}, ini Garage Coffee & Motor.`;
  const ref = `Pesanan ${order.orderNo} (${type})`;
  const track = order.trackingUrl ? `\nLacak pesanan: ${order.trackingUrl}` : "";
  const fee = order.deliveryFee ? ` (sudah termasuk ongkir ${rupiah(order.deliveryFee)})` : "";
  switch (kind) {
    case "awaiting_payment": {
      const limit = order.autoRejectMinutes ? `\nMohon dibayar dalam ${order.autoRejectMinutes} menit, setelah itu pesanan otomatis dibatalkan.` : "";
      const method = order.fulfillment === "delivery" ? "QRIS" : order.paymentMethod || "QRIS/Transfer";
      return `${head}\n${ref} menunggu pembayaran ${method} sebesar ${rupiah(order.total)}${fee}.${limit}\nKirim bukti bayar di chat ini ya. Terima kasih 🙏${track}`;
    }
    case "paid":
      return `${head}\nPembayaran ${ref} sudah kami terima. Pesanan segera kami siapkan.${track}`;
    case "in_production":
      return `${head}\n${ref} sedang dimasak/diracik oleh tim kami.${track}`;
    case "ready_pickup":
      return `${head}\n${ref} sudah siap diambil di kasir Garage. Sebutkan nomor pesanan saat mengambil ya.`;
    case "on_the_way": {
      const courier = order.courierName ? ` bersama kurir ${order.courierName}` : "";
      return `${head}\n${ref} sedang dalam perjalanan${courier}. Mohon pastikan nomor ini bisa dihubungi.${track}`;
    }
    case "delivered":
      return `${head}\n${ref} sudah sampai. Selamat menikmati, terima kasih sudah memesan di Garage!`;
    case "rejected": {
      const reason = order.rejectionReason ? `\nAlasan: ${order.rejectionReason}` : "";
      return `${head}\nMohon maaf, ${ref} tidak dapat kami proses.${reason}\nSilakan pesan ulang atau balas chat ini bila ada pertanyaan.`;
    }
  }
}

export type InvoiceWhatsappItem = { itemName: string; variantLabel?: string | null; qty: number; lineTotal: number };

export type InvoiceWhatsappInput = {
  orderNo: string;
  tableLabel?: string | null;
  customerName?: string | null;
  total: number;
  items: InvoiceWhatsappItem[];
  invoiceUrl?: string | null;
  invoicePdfUrl?: string | null;
  paymentMethod?: string | null;
};

function itemLines(items: InvoiceWhatsappItem[]) {
  return items
    .map((item) => {
      const variant = item.variantLabel && item.variantLabel !== "Regular" ? ` ${item.variantLabel}` : "";
      return `- ${item.qty}x ${item.itemName}${variant}: ${rupiah(item.lineTotal)}`;
    })
    .join("\n");
}

/** Invoice ke WA pelanggan (dipakai kasir, waiter, dan server). */
export function buildInvoiceWhatsappMessage(input: InvoiceWhatsappInput): string {
  return [
    "Invoice GARAGE Coffee & Motor",
    `Order: ${input.orderNo}`,
    input.tableLabel ? `Lokasi: ${input.tableLabel}` : null,
    "",
    itemLines(input.items),
    "",
    `Total: ${rupiah(input.total)}`,
    input.paymentMethod ? `Bayar: ${input.paymentMethod}` : null,
    input.invoiceUrl ? `Invoice & tracking: ${input.invoiceUrl}` : null,
    !input.invoiceUrl && input.invoicePdfUrl ? `PDF Invoice: ${input.invoicePdfUrl}` : null,
    "Terima kasih. Simpan link ini untuk order ulang dan rewards member.",
  ]
    .filter((line): line is string => line !== null)
    .join("\n");
}

/** Pesanan menu digital → WA Garage: ringkasan + status bukti transfer. */
export function buildGarageOrderNotice(
  input: InvoiceWhatsappInput & { customerPhone?: string | null; fulfillment?: string | null },
  proofUploaded: boolean,
): string {
  const type =
    input.fulfillment === "delivery" ? "Delivery" : input.fulfillment === "takeaway" ? "Take away" : input.tableLabel || "Dine in";
  return [
    `Halo Garage, saya ${input.customerName?.trim() || "pelanggan"} sudah memesan lewat menu digital.`,
    `Order: ${input.orderNo} (${type})`,
    input.customerPhone ? `WA saya: ${input.customerPhone}` : null,
    "",
    itemLines(input.items),
    "",
    `Total: ${rupiah(input.total)}`,
    `Metode: ${input.paymentMethod || "Transfer"}`,
    proofUploaded
      ? "Bukti transfer sudah saya unggah di aplikasi (cek di POS)."
      : "Bukti transfer saya lampirkan di chat ini.",
    input.invoiceUrl ? `Invoice: ${input.invoiceUrl}` : null,
    "Mohon dikonfirmasi ya, terima kasih 🙏",
  ]
    .filter((line): line is string => line !== null)
    .join("\n");
}

export type InvitationWhatsappInput = {
  guestName: string;
  eventTitle: string;
  dateLabel: string;
  timeLabel: string;
  venue: string;
  url: string;
};

/** Pesan undangan pribadi (dibagikan manual oleh petugas lewat wa.me). */
export function buildInvitationWhatsappMessage(input: InvitationWhatsappInput): string {
  return [
    `Halo ${input.guestName},`,
    "",
    `Dengan senang hati kami mengundang Anda ke *${input.eventTitle}*.`,
    `📅 ${input.dateLabel}`,
    `🕒 ${input.timeLabel}`,
    `📍 ${input.venue}`,
    "",
    "Mohon konfirmasi kehadiran lewat undangan pribadi Anda:",
    input.url,
    "",
    "Link ini khusus untuk Anda, mohon tidak dibagikan. Terima kasih — Garage Coffee",
  ].join("\n");
}
