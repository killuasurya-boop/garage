import { describe, expect, it } from "vitest";

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
      expect(lines.every((line) => line.length <= width)).toBe(true);
      const joined = lines.map((line) => line.trim()).join(" ");
      expect(joined).toContain("(salinan struk - bukan transaksi baru)");
      expect(lines.map((line) => line.trim()).join("")).toContain(receipt.invoiceWebUrl);
    }
  });
});
