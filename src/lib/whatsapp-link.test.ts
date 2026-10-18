import { describe, expect, it } from "vitest";

import { parseBankAccounts } from "@/lib/bank-accounts";
import { buildGarageOrderNotice, buildInvoiceWhatsappMessage, normalizeWaNumber } from "@/lib/whatsapp-link";

const order = {
  orderNo: "QR-0012",
  tableLabel: "Meja 07",
  customerName: "Rina",
  total: 45_000,
  items: [
    { itemName: "Kopi Susu", variantLabel: "Cold", qty: 2, lineTotal: 30_000 },
    { itemName: "Kentang", variantLabel: "Regular", qty: 1, lineTotal: 15_000 },
  ],
  invoiceUrl: "https://garage.id/invoice/abc",
};

describe("pesan WhatsApp", () => {
  it("invoice pelanggan berisi item, total, dan link", () => {
    const text = buildInvoiceWhatsappMessage(order);
    expect(text).toContain("Order: QR-0012");
    expect(text).toContain("- 2x Kopi Susu Cold: Rp30.000");
    expect(text).toContain("- 1x Kentang: Rp15.000");
    expect(text).toContain("Total: Rp45.000");
    expect(text).toContain("Invoice & tracking: https://garage.id/invoice/abc");
  });

  it("notifikasi ke WA Garage menyebut status bukti transfer", () => {
    const withProof = buildGarageOrderNotice({ ...order, paymentMethod: "Bank Transfer", fulfillment: "dine-in" }, true);
    expect(withProof).toContain("Order: QR-0012 (Meja 07)");
    expect(withProof).toContain("sudah saya unggah");
    expect(buildGarageOrderNotice({ ...order, fulfillment: "delivery" }, false)).toContain("(Delivery)");
  });

  it("nomor WA aktif: format Indonesia saja", () => {
    expect(normalizeWaNumber("0812-3456-7890")).toBe("6281234567890");
    expect(normalizeWaNumber("+62 812 3456 7890")).toBe("6281234567890");
    expect(normalizeWaNumber("0614567890")).toBe("");
    expect(normalizeWaNumber("12345")).toBe("");
  });

  it("rekening transfer dari pengaturan", () => {
    const list = parseBankAccounts("BNI | 1234567890 | GARAGE Coffee\nbca|9876543210\nbaris tanpa nomor\n");
    expect(list).toEqual([
      { id: "BNI-0", bank: "BNI", number: "1234567890", holder: "GARAGE Coffee" },
      { id: "BCA-1", bank: "BCA", number: "9876543210", holder: "GARAGE Coffee & Motor" },
    ]);
  });
});
