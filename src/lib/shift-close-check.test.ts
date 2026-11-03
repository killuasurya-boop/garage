import { describe, expect, it } from "vitest";

import { isCashMethod, shiftCloseCheckItems, type ShiftCloseCheckData } from "@/lib/shift-close-check";

const base: ShiftCloseCheckData = {
  unpaidThisShift: { count: 0, total: 0, orderNos: [] },
  unpaidOlder: { count: 0, total: 0 },
  pendingCashMovements: { count: 0, amount: 0 },
  methodCorrections: 0,
  paymentReverts: 0,
  nonCash: [],
  cash: null,
};

describe("panel cek tutup shift (Tahap 1.7)", () => {
  it("tanpa pengecualian = siap; kas kecil selalu dijelaskan terpisah", () => {
    const result = shiftCloseCheckItems(base, { activeTables: 0, pendingQr: 0 });
    expect(result.ready).toBe(true);
    expect(result.items.map((item) => item.key)).toEqual(["petty"]);
  });

  it("semua pengecualian tampil jelas dengan teks (bukan hanya warna)", () => {
    const result = shiftCloseCheckItems(
      {
        ...base,
        unpaidThisShift: { count: 2, total: 85_000, orderNos: ["POS-1", "QR-2"] },
        unpaidOlder: { count: 1, total: 20_000 },
        pendingCashMovements: { count: 1, amount: 50_000 },
        methodCorrections: 1,
        paymentReverts: 1,
      },
      { activeTables: 3, pendingQr: 1 },
    );
    expect(result.ready).toBe(false);
    expect(result.warnCount).toBe(5);
    const titles = result.items.map((item) => item.title).join(" | ");
    expect(titles).toMatch(/2 transaksi belum lunas/);
    expect(titles).toMatch(/1 tagihan dari shift sebelumnya/);
    expect(titles).toMatch(/1 pesanan QR menunggu kasir/);
    expect(titles).toMatch(/3 meja masih aktif/);
    expect(titles).toMatch(/1 kas keluar\/masuk menunggu persetujuan/);
    expect(titles).toMatch(/1 koreksi metode · 1 lunas dibatalkan/);
    expect(result.items.find((item) => item.key === "unpaid")?.detail).toContain("POS-1, QR-2");
  });

  it("blind count: tanpa data kas tidak ada angka tunai / kas seharusnya", () => {
    const result = shiftCloseCheckItems(
      { ...base, nonCash: [{ method: "QRIS", count: 3, total: 90_000 }] },
      { activeTables: 0, pendingQr: 0 },
    );
    const text = JSON.stringify(result.items);
    expect(text).not.toMatch(/Tunai|seharusnya/);
    expect(text).toMatch(/QRIS/);
    expect(text).toMatch(/tidak ada verifikasi otomatis/);
  });

  it("Owner/Manajer melihat tunai + kas seharusnya", () => {
    const result = shiftCloseCheckItems(
      { ...base, cash: { count: 4, total: 120_000, expectedCash: 220_000 } },
      { activeTables: 0, pendingQr: 0 },
    );
    expect(result.items.find((item) => item.key === "cash")?.title).toMatch(/kas seharusnya/);
  });

  it("metode tunai dikenali", () => {
    expect(isCashMethod("Cash")).toBe(true);
    expect(isCashMethod("tunai")).toBe(true);
    expect(isCashMethod("QRIS")).toBe(false);
  });
});
