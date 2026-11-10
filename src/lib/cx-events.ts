// =============================================================================
// Event analytics CX (invoice → member funnel). Aman diimpor client.
// Data minimal: nama event + order (diresolusi server dari token) + customer
// (dari sesi member, bila ada). TIDAK PERNAH menyimpan nomor WA, PIN, token
// invoice, IP, atau isi pesan.
// =============================================================================

export const CX_EVENTS = [
  "invoice_viewed",
  "member_offer_viewed",
  "member_register_clicked",
  "member_registered",
  "member_login_completed",
  "member_card_opened",
  "voucher_viewed",
  "voucher_redeemed",
  "whatsapp_order_clicked",
  "whatsapp_payment_help_clicked",
  "invoice_shared",
  "invoice_pdf_saved",
] as const;

export type CxEvent = (typeof CX_EVENTS)[number];

/** Event yang boleh dikirim browser. member_registered/voucher_redeemed dicatat server. */
export const CLIENT_CX_EVENTS: readonly CxEvent[] = [
  "invoice_viewed",
  "member_offer_viewed",
  "member_register_clicked",
  "member_login_completed",
  "member_card_opened",
  "voucher_viewed",
  "whatsapp_order_clicked",
  "whatsapp_payment_help_clicked",
  "invoice_shared",
  "invoice_pdf_saved",
];

export function isClientCxEvent(value: unknown): value is CxEvent {
  return typeof value === "string" && (CLIENT_CX_EVENTS as readonly string[]).includes(value);
}

/** Event "lihat" dihitung sekali per order per jendela ini (refresh tidak menggandakan). */
export const CX_DEDUPE_MINUTES = 30;

export const CX_EVENT_LABEL: Record<CxEvent, string> = {
  invoice_viewed: "Invoice dibuka",
  member_offer_viewed: "Penawaran member dilihat",
  member_register_clicked: "Klik daftar member",
  member_registered: "Daftar member dari invoice",
  member_login_completed: "Login member dari invoice",
  member_card_opened: "Kartu member dibuka",
  voucher_viewed: "Voucher dilihat",
  voucher_redeemed: "Voucher dipakai",
  whatsapp_order_clicked: "Klik WA bukti pesanan (dibuka, bukan terkirim)",
  whatsapp_payment_help_clicked: "Klik WA bukti bayar (dibuka, bukan terkirim)",
  invoice_shared: "Invoice dibagikan",
  invoice_pdf_saved: "Simpan PDF / cetak",
};

/** Kirim event tanpa menunggu & tanpa mengganggu UI (sendBeacon bila ada). */
export function trackCxEvent(token: string, event: CxEvent) {
  if (typeof window === "undefined") return;
  try {
    const url = `/api/invoice/${encodeURIComponent(token)}/events`;
    const body = JSON.stringify({ event });
    if (navigator.sendBeacon) {
      navigator.sendBeacon(url, new Blob([body], { type: "application/json" }));
      return;
    }
    void fetch(url, { method: "POST", body, headers: { "Content-Type": "application/json" }, keepalive: true, credentials: "include" });
  } catch {
    // analytics tidak boleh mengganggu pelanggan
  }
}
