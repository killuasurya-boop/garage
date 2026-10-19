import { describe, expect, it } from "vitest";

import { parseReceiptQrLine, stripReceiptQr } from "@/lib/receipt-layout";
import { buildKitchenChitContent, buildThermalContent } from "@/lib/thermal-receipt";

describe("Nomor meja di struk thermal", () => {
  it("struk pelanggan dine-in mencetak MEJA 06 (format kanonik), takeaway tidak", () => {
    const dineIn = buildThermalContent({ orderNo: "POS-1", tableLabel: "Meja 6", items: [] });
    expect(dineIn).toContain("MEJA 06");
    const takeaway = buildThermalContent({ orderNo: "POS-2", tableLabel: "Takeaway", items: [] });
    expect(takeaway).not.toContain("MEJA");
  });

  it("chit dapur/bar memakai banner meja besar", () => {
    const chit = buildKitchenChitContent({
      orderNo: "POS-3",
      tableLabel: "Meja 12",
      createdAt: new Date().toISOString(),
      items: [{ name: "Kopi", qty: 1, station: "Bar" }],
    } as never);
    expect(chit).toContain(">>> MEJA 12 <<<");
  });
});

describe("chit dapur/bar — nama pemesan", () => {
  it("mencetak NAMA di bawah banner meja, melewati placeholder Guest Customer", () => {
    const base = {
      orderNo: "POS-1",
      tableLabel: "Meja 07",
      items: [{ name: "Nasi Goreng", qty: 2, station: "Dapur" }],
    };
    const withName = buildKitchenChitContent({ ...base, customerName: "Andi" });
    expect(withName).toContain("NAMA: ANDI");
    expect(withName.indexOf("MEJA")).toBeLessThan(withName.indexOf("NAMA: ANDI"));
    expect(buildKitchenChitContent({ ...base, customerName: "Guest Customer" })).not.toContain("NAMA:");
  });
});

describe("chit delivery", () => {
  it("mencetak DELIVERY, alamat utuh (dipecah baris) dan No. WA", () => {
    const address = "Jl. Sudirman No. 12, Kel. Pasar Baru — Patokan: depan masjid pagar hijau";
    const chit = buildKitchenChitContent({
      orderNo: "POS-9",
      tableLabel: "Delivery",
      orderType: "delivery",
      customerName: "Rina",
      customerPhone: "6281234567890",
      deliveryAddress: address,
      items: [{ name: "Kopi Susu", qty: 2, station: "Bar" }],
    });
    expect(chit).toContain("*** DELIVERY ***");
    expect(chit).toContain("WA    : 6281234567890");
    const joined = chit
      .split("\r\n")
      .filter((l) => l.startsWith("Antar: ") || l.startsWith("       "))
      .map((l) => l.slice(7))
      .join("");
    expect(joined).toContain(address);
  });
});

describe("Struk khusus Delivery", () => {
  it("mencetak blok DELIVERY (nama, WA, alamat utuh, kurir) dan ongkir terpisah", () => {
    const content = buildThermalContent({
      orderNo: "QR-9",
      tableLabel: "Delivery",
      items: [{ name: "Nasi Goreng", qty: 2, unitPrice: 20_000, lineTotal: 40_000 }],
      subtotal: 40_000,
      total: 45_000,
      delivery: {
        customerName: "Rina",
        customerPhone: "081234567890",
        address: "Jl. Sudirman No. 12, dekat Masjid Raya — Patokan: pagar hijau",
        courierName: "Andi Kurir",
        fee: 5_000,
      },
    });
    expect(content).toContain("*** DELIVERY ***");
    expect(content).toContain("Nama  : Rina");
    expect(content).toContain("WA    : 081234567890");
    expect(content).toContain("pagar hijau");
    expect(content).toContain("Kurir : Andi Kurir");
    expect(content).toMatch(/Ongkir delivery\s+Rp\s?5\.000/);
    for (const line of content.split("\r\n")) expect(line.length).toBeLessThanOrEqual(32);
  });

  it("order biasa tanpa blok delivery", () => {
    const content = buildThermalContent({ orderNo: "POS-1", items: [], total: 10_000 });
    expect(content).not.toContain("DELIVERY");
    expect(content).not.toContain("Ongkir");
  });
});

describe("struk cetak ulang — tidak ada teks terpotong", () => {
  const receipt = {
    orderNo: "POS-20261019-0263",
    items: [{ name: "Ayam Penyet", qty: 1, price: 19_000 }],
    subtotal: 19_000,
    total: 19_000,
    isReprint: true,
    invoiceWebUrl: "https://garagecoffee.id/invoice/UHs3xCyuA-btvsgcThy1x9Qk2Lm8",
  };

  it("catatan salinan dibungkus utuh, link invoice utuh, setiap baris ≤ lebar kertas", () => {
    for (const width of [30, 32, 48]) {
      const content = buildThermalContent(receipt as never, { width });
      const lines = content.split("\r\n");
      // Baris penanda QR digambar printer, bukan dicetak sebagai teks.
      expect(lines.filter((line) => parseReceiptQrLine(line) === null).every((line) => line.length <= width)).toBe(true);
      const joined = lines.map((line) => line.trim()).join(" ");
      expect(joined).toContain("(salinan struk - bukan transaksi baru)");
      expect(lines.map((line) => line.trim()).join("")).toContain(receipt.invoiceWebUrl);
    }
  });
});

describe("QR cek pesanan di struk", () => {
  const base = {
    orderNo: "POS-1",
    items: [{ name: "Latte", qty: 1, price: 20_000 }],
    subtotal: 20_000,
    total: 20_000,
  };

  it("mencetak penanda QR + keterangan bila ada link invoice", () => {
    const content = buildThermalContent({ ...base, invoiceWebUrl: "https://garagecoffee.id/invoice/abc" } as never);
    const lines = content.split("\r\n");
    expect(lines.some((line) => line.includes("SCAN UNTUK CEK PESANAN"))).toBe(true);
    expect(lines.map(parseReceiptQrLine).filter(Boolean)).toEqual(["https://garagecoffee.id/invoice/abc"]);
    expect(stripReceiptQr(content)).not.toContain("[[QR:");
    const text = stripReceiptQr(content).split("\r\n").map((line) => line.trim()).join("");
    expect(text).toContain("https://garagecoffee.id/invoice/abc");
  });

  it("tanpa link invoice tidak ada QR", () => {
    const content = buildThermalContent(base as never);
    expect(content).not.toContain("[[QR:");
    expect(content).not.toContain("SCAN UNTUK CEK PESANAN");
  });
});

describe("chit Bar/Dapur detail", () => {
  it("mencetak tambahan, target, petugas cetak, catatan dan total item", () => {
    const content = buildKitchenChitContent({
      orderNo: "POS-9",
      queueNo: 4,
      tableLabel: "Meja 01",
      orderType: "QR Table",
      createdAt: "2026-10-19T20:24:00.000Z",
      addonSequence: 2,
      targetMinutes: 12,
      printedBy: "Rina",
      printedAt: "2026-10-19T20:30:00.000Z",
      orderNote: "Pedas sedang, tanpa bawang goreng untuk semua porsi",
      items: [
        { name: "Ayam Penyet", qty: 2, station: "Dapur", note: "sambal dipisah" },
        { name: "Nasi", qty: 1, station: "Dapur" },
      ],
    } as never);
    expect(content).toContain("TAMBAHAN KE-2");
    expect(content).toContain("Tipe  : Menu digital");
    expect(content).toMatch(/Target: 12 mnt \(03[.:]36\)/);
    expect(content).toMatch(/Cetak : 03[.:]30 Rina/);
    expect(content).toContain("Jumlah: 3 item (2 menu)");
    expect(content).toContain("Catatan order:");
    expect(content).not.toContain("Kasir : -");
    expect(content.split("\r\n").every((line) => line.length <= 32)).toBe(true);
  });
});
