import { describe, expect, it } from "vitest";

import {
  buildCxCampaignMessage,
  buildInvoiceConfirmationMessage,
  buildPaymentProofMessage,
  campaignSendBlockReason,
  cashierWhatsappNumber,
  cashierWaLink,
} from "@/lib/cx-whatsapp";
import { CLIENT_CX_EVENTS, isClientCxEvent } from "@/lib/cx-events";
import { DEFAULT_GARAGE_WHATSAPP } from "@/lib/whatsapp-link";

const base = {
  orderNo: "POS-3979046443",
  invoiceNo: "INV-POS-3979046443",
  customerName: "Andi",
  includeName: true,
  tableLabel: "Meja 38",
  fulfillmentLabel: "Dine In",
  total: 95_000,
  paymentMethod: "QRIS",
  paymentStatusLabel: "Menunggu Konfirmasi",
  invoiceUrl: "https://garagecoffee.id/invoice/abc",
};

describe("pesan WhatsApp invoice", () => {
  it("mengikuti template + data asli", () => {
    const text = buildInvoiceConfirmationMessage(base);
    expect(text).toContain("Nomor Order: POS-3979046443");
    expect(text).toContain("Nomor Invoice: INV-POS-3979046443");
    expect(text).toContain("Nama: Andi");
    expect(text).toContain("Meja: Meja 38");
    expect(text).toContain("Total: Rp95.000");
    expect(text).toContain("Status Pembayaran: Menunggu Konfirmasi");
    expect(text).toContain("https://garagecoffee.id/invoice/abc");
  });

  it("nama tidak disertakan tanpa persetujuan", () => {
    expect(buildInvoiceConfirmationMessage({ ...base, includeName: false })).not.toContain("Andi");
  });

  it("bukti bayar tidak mengklaim lunas", () => {
    const text = buildPaymentProofMessage(base);
    expect(text).toContain("Bukti pembayaran saya lampirkan");
    expect(text).not.toMatch(/lunas|berhasil/i);
  });

  it("nomor kasir: setting valid dipakai, selain itu nomor resmi Garage", () => {
    expect(cashierWhatsappNumber("0812-3456-7890")).toBe("6281234567890");
    expect(cashierWhatsappNumber("abc")).toBe(DEFAULT_GARAGE_WHATSAPP);
    expect(cashierWaLink("Halo", "")).toBe(`https://wa.me/${DEFAULT_GARAGE_WHATSAPP}?text=Halo`);
  });
});

describe("kampanye WhatsApp", () => {
  const now = new Date("2026-11-06T10:00:00Z");
  it("promosi wajib izin + batas frekuensi; welcome = layanan", () => {
    expect(campaignSendBlockReason({ kind: "repeat_visit", marketingConsent: false, now })).toMatch(/izin/);
    expect(
      campaignSendBlockReason({ kind: "repeat_visit", marketingConsent: true, lastPromoSentAt: new Date(now.getTime() - 2 * 86_400_000), now }),
    ).toMatch(/7 hari/);
    expect(campaignSendBlockReason({ kind: "repeat_visit", marketingConsent: true, now })).toBeNull();
    expect(campaignSendBlockReason({ kind: "welcome", marketingConsent: false, now })).toBeNull();
  });

  it("ulang tahun tanpa voucher nyata = ucapan saja (tidak menjanjikan hadiah)", () => {
    const text = buildCxCampaignMessage("birthday", { name: "Andi", tier: "Gold", cardUrl: "u", menuUrl: "m" });
    expect(text).toContain("Selamat ulang tahun");
    expect(text).not.toMatch(/hadiah|gratis|diskon/i);
    expect(text).toContain("STOP");
  });

  it("repeat visit tanpa penawaran tidak mengarang promo", () => {
    const text = buildCxCampaignMessage("repeat_visit", { name: "Andi", tier: "Silver", cardUrl: "u", menuUrl: "m" });
    expect(text).not.toMatch(/diskon|gratis|penawaran/i);
  });
});

describe("event analytics", () => {
  it("event sensitif server-side tidak bisa dikirim browser", () => {
    expect(isClientCxEvent("member_registered")).toBe(false);
    expect(isClientCxEvent("voucher_redeemed")).toBe(false);
    expect(isClientCxEvent("invoice_viewed")).toBe(true);
    expect(isClientCxEvent("drop table")).toBe(false);
    expect(CLIENT_CX_EVENTS.length).toBeGreaterThan(5);
  });
});
