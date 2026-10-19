import { afterEach, describe, expect, it, vi } from "vitest";

import {
  chunkBytes,
  DEFAULT_DEVICE_PRINTER_CONFIG,
  deviceColumns,
  escPosJob,
  loadDevicePrinterConfig,
  normalizeDevicePrinterConfig,
  saveDevicePrinterConfig,
  stripControlCodes,
  toPrinterText,
} from "@/lib/device-printer";
import {
  buildDailyRecapContent,
  buildShiftSlipContent,
  buildTestPageContent,
} from "@/lib/management-slips";
import { createLayout, paperColumns, wrapText } from "@/lib/receipt-layout";
import { buildKitchenChitContent, buildThermalContent } from "@/lib/thermal-receipt";

const lines = (content: string) => content.split("\r\n");
const longest = (content: string) =>
  Math.max(...lines(stripControlCodes(content)).map((line) => line.length));

// Reset, margin kiri 0, area cetak 384 dot (58 mm), Font A.
const BASE_58 = [0x1b, 0x40, 0x1d, 0x4c, 0x00, 0x00, 0x1d, 0x57, 0x80, 0x01, 0x1b, 0x4d, 0x00];
const BOLD = [0x1b, 0x45, 0x01, 0x1b, 0x47, 0x01];
const TALL = [0x1d, 0x21, 0x01];

describe("escPosJob", () => {
  it("header: reset + area cetak + Font A + tebal + tinggi 2×, lalu isi + umpan kertas", () => {
    const bytes = Array.from(escPosJob("AB", { feedLines: 2, bold: true, textSize: "besar" }));
    expect(bytes).toEqual([...BASE_58, ...BOLD, ...TALL, 0x41, 0x42, 0x0a, 0x0a]);
  });

  it("kertas 80 mm = area 576 dot; huruf normal tanpa tebal", () => {
    const bytes = Array.from(escPosJob("A", { feedLines: 0, paper: "80", bold: false, textSize: "normal" }));
    expect(bytes).toEqual([0x1b, 0x40, 0x1d, 0x4c, 0x00, 0x00, 0x1d, 0x57, 0x40, 0x02, 0x1b, 0x4d, 0x00, 0x41]);
  });

  it("potong kertas & salinan berulang (header di tiap salinan)", () => {
    const bytes = Array.from(escPosJob("A", { feedLines: 0, cut: true, copies: 2, bold: false }));
    const one = [...BASE_58, 0x41, 0x1d, 0x56, 0x42, 0x00];
    expect(bytes).toEqual([...one, ...one]);
  });

  it("tanda baca tipografi jadi ASCII; emoji tetap '?'", () => {
    expect(toPrinterText("salinan — bukan · 2×…")).toBe("salinan - bukan - 2x...");
    const bytes = Array.from(escPosJob("—☕", { feedLines: 0, bold: false }));
    expect(bytes.slice(BASE_58.length)).toEqual([0x2d, 63]);
  });

  it("kode buka laci tetap ikut terkirim", () => {
    const bytes = Array.from(escPosJob("X\x1B\x70\x00\x19\xFA", { feedLines: 0, bold: false }));
    expect(bytes.slice(BASE_58.length + 1)).toEqual([0x1b, 0x70, 0x00, 0x19, 0xfa]);
  });
});

describe("stripControlCodes & chunkBytes", () => {
  it("membuang kode laci untuk dialog print", () => {
    expect(stripControlCodes("TOTAL\r\n\x1B\x70\x00\x19\xFA")).toBe("TOTAL\r\n");
  });

  it("potongan BLE tidak melebihi ukuran", () => {
    const chunks = chunkBytes(new Uint8Array(250), 100);
    expect(chunks.map((c) => c.length)).toEqual([100, 100, 50]);
  });
});

describe("konfigurasi per perangkat", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("nilai tidak valid dinormalkan", () => {
    const config = normalizeDevicePrinterConfig({ mode: "fax", paper: "100", baudRate: 1, feedLines: 99, columns: 500 });
    expect(config).toMatchObject({ mode: "auto", paper: "58", baudRate: 9600, feedLines: 10, columns: 64 });
  });

  it("kolom ikut kertas 58/80 mm", () => {
    expect(deviceColumns({ ...DEFAULT_DEVICE_PRINTER_CONFIG, paper: "58" })).toBe(32);
    expect(deviceColumns({ ...DEFAULT_DEVICE_PRINTER_CONFIG, paper: "80" })).toBe(48);
    expect(deviceColumns({ ...DEFAULT_DEVICE_PRINTER_CONFIG, paper: "80", columns: 42 })).toBe(42);
  });

  it("localStorage error tidak membuat aplikasi gagal", () => {
    vi.stubGlobal("window", {
      localStorage: {
        getItem: () => {
          throw new Error("blocked");
        },
        setItem: () => {
          throw new Error("blocked");
        },
      },
    });
    expect(loadDevicePrinterConfig()).toEqual(DEFAULT_DEVICE_PRINTER_CONFIG);
    expect(saveDevicePrinterConfig({ ...DEFAULT_DEVICE_PRINTER_CONFIG, mode: "serial" }).mode).toBe("serial");
  });

  it("simpan lalu muat ulang", () => {
    const store = new Map<string, string>();
    vi.stubGlobal("window", {
      localStorage: {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => store.set(key, value),
      },
    });
    saveDevicePrinterConfig({ ...DEFAULT_DEVICE_PRINTER_CONFIG, mode: "ble", paper: "80", deviceLabel: "RPP02N" });
    expect(loadDevicePrinterConfig()).toMatchObject({ mode: "ble", paper: "80", deviceLabel: "RPP02N" });
  });
});

describe("tata letak mengikuti lebar kertas", () => {
  it("paperColumns dibatasi 24–64, default 32", () => {
    expect(paperColumns(undefined)).toBe(32);
    expect(paperColumns(10)).toBe(24);
    expect(paperColumns(100)).toBe(64);
  });

  it("wrapText tidak pernah melebihi lebar", () => {
    const out = wrapText("Americano Cranberry Extra Shot Supercalifragilistic", 12);
    expect(Math.max(...out.map((l) => l.length))).toBeLessThanOrEqual(12);
    expect(out.join(" ").replace(/\s/g, "")).toBe("AmericanoCranberryExtraShotSupercalifragilistic");
  });

  it("pair: nilai kanan utuh, label panjang dibungkus", () => {
    const layout = createLayout({ width: 32 });
    layout.pair("1x Kopi Susu Gula Aren Extra Shot Large Less Ice", "Rp 128.000");
    expect(layout.rows.every((row) => row.length <= 32)).toBe(true);
    expect(layout.rows.at(-1)?.endsWith("Rp 128.000")).toBe(true);
  });

  const receipt = {
    invoiceNo: "INV-20261012-0001",
    orderNo: "POS-0001",
    createdAt: "2026-10-12T05:00:00.000Z",
    cashier: { name: "Kasir Satu" },
    items: [
      { name: "Butterscotch Sea Salt Iced Coffee Latte Extra Large", variant: "Cold", qty: 2, unitPrice: 28000, lineTotal: 56000 },
      { name: "Nasi Goreng", qty: 1, unitPrice: 20000, lineTotal: 20000 },
    ],
    subtotal: 76000,
    total: 76000,
    settings: { outletAddress: "Jl. Sudirman No. 123, Tebing Tinggi, Sumatera Utara" },
  };

  it.each([32, 48])("struk pelanggan %i kolom: tidak ada baris melebihi lebar, nama item tidak terpotong", (width) => {
    const content = buildThermalContent(receipt, { width });
    expect(longest(content)).toBeLessThanOrEqual(width);
    const flat = lines(content).map((l) => l.trim()).join(" ");
    for (const word of ["Butterscotch", "Sea", "Salt", "Iced", "Coffee", "Latte", "Extra", "Large"]) {
      expect(flat).toContain(word);
    }
    expect(content).toContain("Rp 56.000");
  });

  it("default tetap 32 kolom (kompatibel)", () => {
    expect(longest(buildThermalContent(receipt))).toBeLessThanOrEqual(32);
  });

  it.each([32, 48])("chit dapur %i kolom", (width) => {
    const content = buildKitchenChitContent(
      {
        orderNo: "POS-1",
        tableLabel: "Meja 07",
        items: [{ name: "Indomie Goreng", qty: 1, station: "Dapur" }],
      },
      { width },
    );
    expect(lines(content)[0]).toBe("=".repeat(width));
  });
});

describe("kertas manajemen", () => {
  const shift = {
    session: {
      code: "SH-20261012-1",
      shiftLabel: "Shift 1",
      openedAt: "2026-10-12T01:00:00.000Z",
      closedAt: "2026-10-12T09:00:00.000Z",
      openingCash: 200000,
      expectedCash: 950000,
      actualCash: 940000,
      discrepancy: -10000,
      openedByName: "Kasir Satu",
    },
    counts: { total: 30, paid: 28, refunded: 2 },
    sales: { gross: 1250000, subtotal: 1200000, service: 0, tax: 0, discount: 15000 },
    byMethod: [
      { method: "cash", count: 20, total: 750000 },
      { method: "qris", count: 8, total: 500000 },
    ],
    qrisCounted: 495000,
    depositAmount: 740000,
    floatLeft: 200000,
  };

  it.each([32, 48])("slip tutup shift %i kolom memuat kas, selisih, metode & tanda tangan", (width) => {
    const content = buildShiftSlipContent(shift, { width });
    expect(longest(content)).toBeLessThanOrEqual(width);
    expect(content).toContain("SLIP TUTUP SHIFT");
    expect(content).toContain("Selisih (KURANG)");
    expect(content).toContain("-Rp 10.000");
    expect(content).toContain("Tunai (20x)");
    expect(content).toContain("QRIS (8x)");
    expect(content).toContain("Selisih QRIS");
    expect(content).toContain("Manajer");
  });

  it("tanda tangan bisa dimatikan", () => {
    expect(buildShiftSlipContent(shift, { showSignature: false })).not.toContain("Manajer");
  });

  it.each([32, 48])("rekap harian %i kolom", (width) => {
    const content = buildDailyRecapContent(
      {
        date: "2026-10-12",
        rows: [
          {
            code: "SH-1",
            shiftLabel: "Shift 1",
            cashierName: "Kasir Satu",
            openedAt: shift.session.openedAt,
            closedAt: shift.session.closedAt,
            expectedCash: 950000,
            actualCash: 940000,
            discrepancy: -10000,
            counts: { paid: 28, refunded: 2 },
            sales: { gross: 1250000, discount: 15000 },
            byMethod: shift.byMethod,
          },
        ],
        staleOpen: [{ code: "SH-0", cashierName: "Kasir Lama" }],
        totals: {
          shifts: 1,
          orders: 30,
          paidOrders: 28,
          gross: 1250000,
          cash: 750000,
          nonCash: 500000,
          expectedCash: 950000,
          actualCash: 940000,
          discrepancy: -10000,
        },
      },
      { width },
    );
    expect(longest(content)).toBeLessThanOrEqual(width);
    expect(content).toContain("REKAP HARIAN");
    expect(content).toContain("Rp 44.643"); // rata-rata per struk
    expect(content).toContain("SHIFT BELUM DITUTUP");
  });

  it("tes cetak: penggaris selebar kertas", () => {
    const content = buildTestPageContent({ printerLabel: "RPP02N", modeLabel: "Bluetooth" }, { width: 48 });
    expect(lines(content)).toContain("123456789012345678901234567890123456789012345678");
  });
});
