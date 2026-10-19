import ExcelJS from "exceljs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  seedGarageBasics,
  setupGarageTestDb,
  teardownGarageTestDb,
  type GarageTestDb,
} from "@/lib/test-helpers/garage-test-db";

// =============================================================================
// Pusat Laporan: angka laporan per modul = data sumber, dan file PDF/XLSX/CSV
// benar-benar terbentuk & bisa dibuka (XLSX dibaca ulang dengan ExcelJS).
// =============================================================================

/* eslint-disable @typescript-eslint/no-explicit-any */
let t: GarageTestDb;
let wms: any;
let reports: typeof import("@/lib/reports");
let outletId = "";
let today = "";
let milkId = "";
let riceId = "";
const USER = "user-report-test";

async function readXlsx(body: Buffer) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(body as never);
  return workbook;
}

/** Nilai sel TOTAL (baris terakhir) pada kolom berlabel `label`. */
function totalOf(sheet: ExcelJS.Worksheet, label: string) {
  let headerRow = 0;
  let col = 0;
  sheet.eachRow((row, number) => {
    row.eachCell((cell, c) => {
      if (!headerRow && cell.value === label) {
        headerRow = number;
        col = c;
      }
    });
  });
  const last = sheet.getRow(sheet.rowCount);
  expect(String(last.getCell(1).value)).toBe("TOTAL");
  expect(headerRow).toBeGreaterThan(0);
  return Number(last.getCell(col).value);
}

/** Simpan file hasil untuk dicek manual: REPORT_DUMP_DIR=/tmp/x npx vitest run … */
async function dump(file: { body: Buffer; filename: string }) {
  const dir = process.env.REPORT_DUMP_DIR;
  if (!dir) return;
  const { mkdir, writeFile } = await import("node:fs/promises");
  await mkdir(dir, { recursive: true });
  await writeFile(`${dir}/${file.filename}`, file.body);
}

function pdfPages(body: Buffer) {
  const text = body.toString("latin1");
  expect(text.startsWith("%PDF-")).toBe(true);
  expect(text.trimEnd().endsWith("%%EOF")).toBe(true);
  return (text.match(/\/Type\s*\/Page[^s]/g) ?? []).length;
}

beforeAll(async () => {
  t = await setupGarageTestDb();
  ({ outletId } = await seedGarageBasics(t, { userId: USER }));
  wms = await import("@/lib/wms-service");
  reports = await import("@/lib/reports");
  today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(new Date());
  await wms.listWmsWarehouses();
  const d = t.getDb();
  await d.insert(t.schema.wmsCategory).values([
    { name: "Bar · Susu", area: "bar" },
    { name: "Dapur · Beras", area: "dapur" },
  ]);
  milkId = (await wms.createWmsProduct({ sku: "R-MILK", name: "Susu Laporan", category: "Bar · Susu", unit: "ml", packPrice: 24_000, packQty: 1000 })).id;
  riceId = (await wms.createWmsProduct({ sku: "R-RICE", name: "Beras Laporan", category: "Dapur · Beras", unit: "gr", packPrice: 15_000, packQty: 1000 })).id;

  const exp = new Date(Date.now() + 60 * 86_400_000).toISOString();
  // Bar: 2 L susu @Rp24/ml + ongkir Rp5.000.
  const bar = await wms.createReceiving({
    supplier: "Toko Susu",
    additionalCost: 5_000,
    items: [{ productId: milkId, orderedQty: 2000, receivedQty: 2000, hpp: 24, expiredAt: exp }],
  });
  await wms.completeReceiving(bar.id);
  // Kitchen: 2 karung @ 5 kg beras, Rp15/gr, dibayar transfer.
  const kitchen = await wms.createReceiving({
    supplier: "Pasar Induk",
    paymentMethod: "Transfer",
    items: [{ productId: riceId, orderedQty: 10_000, receivedQty: 10_000, hpp: 15, buyQty: 2, packSize: 5000, buyUnit: "karung", expiredAt: exp }],
  });
  await wms.completeReceiving(kitchen.id);
  // Penjualan memakai 300 ml susu; opname/penyesuaian −50 ml.
  await wms.consumeWmsStockForSale(d, { sku: "R-MILK", qty: 300, refDoc: "SALE ORD-R1" });
  const milkStock = (await d.select().from(t.schema.wmsWarehouseStock)).find((r: any) => r.productId === milkId)!;
  await wms.adjustWmsStock({ productId: milkId, warehouseId: milkStock.warehouseId, deltaQty: -50, note: "tumpah" });

  // Penjualan: 2 order lunas (tunai + QRIS, diskon) + 1 void.
  const [session] = await d.select().from(t.schema.cashSessions);
  const orders = await d
    .insert(t.schema.orders)
    .values([
      { orderNo: "ORD-R1", outletId, channel: "Dine-in", status: "paid", subtotal: 40_000, service: 0, tax: 0, discount: 0, total: 40_000 },
      { orderNo: "ORD-R2", outletId, channel: "Takeaway", status: "paid", subtotal: 30_000, service: 0, tax: 0, discount: 5_000, total: 25_000 },
      { orderNo: "ORD-R3", outletId, channel: "Dine-in", status: "voided", subtotal: 20_000, service: 0, tax: 0, discount: 0, total: 20_000 },
    ])
    .returning();
  await d.insert(t.schema.orderItems).values([
    { orderId: orders[0].id, menuItemId: "itm-coffee", variantId: "reg", itemName: "Kopi Test", variantLabel: "Regular", unitPrice: 20_000, qty: 2, lineTotal: 40_000 },
    { orderId: orders[1].id, menuItemId: "itm-food", variantId: "reg", itemName: "Nasi Test", variantLabel: "Regular", unitPrice: 30_000, qty: 1, lineTotal: 30_000 },
    { orderId: orders[2].id, menuItemId: "itm-coffee", variantId: "reg", itemName: "Kopi Test", variantLabel: "Regular", unitPrice: 20_000, qty: 1, lineTotal: 20_000 },
  ]);
  await d.insert(t.schema.payments).values([
    { orderId: orders[0].id, cashSessionId: session.id, method: "Cash", amount: 40_000 },
    { orderId: orders[1].id, cashSessionId: session.id, method: "QRIS", amount: 25_000 },
  ]);
}, 90_000);

afterAll(async () => {
  await teardownGarageTestDb(t);
});

describe("Laporan Pembelian Bahan Baku per divisi", () => {
  it("Bar & Kitchen terpisah, total = belanja tercatat di Keuangan, file rapi", async () => {
    const range = { from: today, to: today };
    const bar = await reports.buildModuleReport({ module: "pembelian", type: "detail", range, division: "bar", outletId });
    const barDetail = bar.tables[0];
    expect(barDetail.rows).toHaveLength(1);
    expect(barDetail.rows[0]).toMatchObject({ sku: "R-MILK", supplier: "Toko Susu", qty: 2000, unitPrice: 24, extraCost: 5_000, total: 53_000 });
    expect(barDetail.totals?.total).toBe(53_000);
    expect(bar.summary.find((s) => s.label === "Tercatat di Keuangan")?.value).toBe("Rp53.000");
    expect(bar.division).toBe("Divisi Bar");

    const kitchen = await reports.buildModuleReport({ module: "pembelian", type: "detail", range, division: "kitchen", outletId });
    expect(kitchen.tables[0].rows).toHaveLength(1);
    // Satuan beli: 2 karung @ Rp75.000 (5.000 gr × Rp15).
    expect(kitchen.tables[0].rows[0]).toMatchObject({ sku: "R-RICE", qty: 2, unitPrice: 75_000, total: 150_000, paymentStatus: "Lunas · Transfer" });
    expect(String(kitchen.tables[0].rows[0].unit)).toContain("karung");
    expect(kitchen.tables[1].rows).toEqual([{ supplier: "Pasar Induk", docs: 1, lines: 1, total: 150_000 }]);

    // Nama file standar + isi XLSX/CSV/PDF.
    const monthEnd = new Date(Date.UTC(Number(today.slice(0, 4)), Number(today.slice(5, 7)), 0)).toISOString().slice(0, 10);
    const month = { from: `${today.slice(0, 7)}-01`, to: monthEnd };
    const csv = await reports.exportModuleReport({ module: "pembelian", type: "detail", range: month, division: "bar", outletId, format: "csv" });
    await dump(csv);
    expect(csv.filename).toBe(`GARAGE_PEMBELIAN_BAHAN_BAKU_BAR_${today.slice(0, 7)}.csv`);
    const csvText = csv.body.toString("utf8");
    expect(csvText.charCodeAt(0)).toBe(0xfeff);
    expect(csvText).toContain("GARAGE COFFEE");
    expect(csvText).toContain("Laporan Pembelian Bahan Baku — Divisi Bar");
    expect(csvText).toMatch(/TOTAL,.*53000/);

    const xlsx = await reports.exportModuleReport({ module: "pembelian", type: "detail", range: month, division: "kitchen", outletId, format: "xlsx" });
    await dump(xlsx);
    expect(xlsx.filename).toBe(`GARAGE_PEMBELIAN_BAHAN_BAKU_KITCHEN_${today.slice(0, 7)}.xlsx`);
    const book = await readXlsx(xlsx.body);
    expect(book.worksheets.map((s) => s.name)).toEqual(["Ringkasan", "Rincian pembelian", "Rekap per supplier", "Rekap per tanggal"]);
    const sheet = book.getWorksheet("Rincian pembelian")!;
    expect(totalOf(sheet, "Total")).toBe(150_000);
    expect(sheet.pageSetup.paperSize).toBe(9);

    const pdf = await reports.exportModuleReport({ module: "pembelian", type: "detail", range: { from: today, to: today }, division: "kitchen", outletId, format: "pdf" });
    await dump(pdf);
    expect(pdf.filename).toBe(`GARAGE_PEMBELIAN_BAHAN_BAKU_KITCHEN_${today}.pdf`);
    expect(pdfPages(pdf.body)).toBeGreaterThanOrEqual(1);
  });
});

describe("Laporan Stok", () => {
  it("stok awal + mutasi = stok akhir = stok gudang saat ini; nilai = stok × HPP", async () => {
    const report = await reports.buildModuleReport({ module: "stok", type: "posisi", range: { from: today, to: today }, division: "semua", outletId });
    const stock = report.tables[0].rows;
    const milk = stock.find((r) => r.sku === "R-MILK")!;
    expect(milk).toMatchObject({ opening: 0, stockIn: 2000, stockOut: 300, adjustment: -50, closing: 1650 });
    const products = await wms.getWmsProducts({ warehouseId: "all" });
    expect(milk.closing).toBe(Number(products.find((p: any) => p.sku === "R-MILK").onHand));
    // HPP susu = (2000×24 + 5000 ongkir) / 2000 = 26,5.
    expect(Number(milk.hpp)).toBeCloseTo(26.5, 4);
    expect(milk.value).toBe(Math.round(1650 * 26.5));
    // Mutasi detail bahan uji: susu masuk/jual/penyesuaian + beras masuk.
    const ours = report.tables[3].rows.filter((r) => String(r.sku).startsWith("R-"));
    expect(ours.map((r) => [r.sku, r.bucket, r.qtyIn, r.qtyOut])).toEqual([
      ["R-MILK", "Pembelian", 2000, null],
      ["R-RICE", "Pembelian", 10_000, null],
      ["R-MILK", "Penjualan (resep)", null, 300],
      ["R-MILK", "Opname / penyesuaian", null, 50],
    ]);

    const barOnly = await reports.buildModuleReport({ module: "stok", type: "posisi", range: { from: today, to: today }, division: "bar", outletId });
    const barSkus = barOnly.tables[0].rows.map((r) => String(r.sku));
    expect(barSkus).toContain("R-MILK");
    expect(barSkus).not.toContain("R-RICE");

    const file = await reports.exportModuleReport({ module: "stok", type: "posisi", range: { from: today, to: today }, division: "semua", outletId, format: "xlsx" });
    await dump(file);
    expect(file.filename).toBe(`GARAGE_LAPORAN_STOK_${today}.xlsx`);
    const book = await readXlsx(file.body);
    expect(totalOf(book.getWorksheet("Posisi stok")!, "Nilai persediaan")).toBe(Number(report.tables[0].totals?.value));
  });
});

describe("Laporan Produksi", () => {
  it("varians pemakaian = waste + selisih opname terhadap kebutuhan resep", async () => {
    const report = await reports.buildModuleReport({ module: "produksi", type: "ringkasan", range: { from: today, to: today }, division: "bar", outletId });
    const usage = report.tables[2].rows.find((r) => r.sku === "R-MILK")!;
    expect(usage).toMatchObject({ recipe: 300, planned: 300, adjustment: 50, actual: 350 });
    expect(Number(usage.variancePct)).toBeCloseTo((50 / 300) * 100, 4);
    const file = await reports.exportModuleReport({ module: "produksi", type: "ringkasan", range: { from: today, to: today }, division: "bar", outletId, format: "pdf" });
    await dump(file);
    expect(file.filename).toBe(`GARAGE_LAPORAN_PRODUKSI_BAR_${today}.pdf`);
    expect(pdfPages(file.body)).toBeGreaterThanOrEqual(1);
  });
});

describe("Laporan Penjualan", () => {
  it("omzet, penjualan bersih, diskon, void, metode bayar & detail transaksi akurat", async () => {
    const report = await reports.buildModuleReport({ module: "penjualan", type: "day", range: { from: today, to: today }, division: "semua", outletId });
    const value = (label: string) => report.summary.find((s) => s.label === label)?.value;
    expect(value("Omzet (dibayar)")).toBe("Rp65.000");
    expect(value("Penjualan bersih")).toBe("Rp65.000");
    expect(value("Diskon")).toBe("Rp5.000");
    expect(value("Void / batal")).toBe("1 · Rp20.000");
    const methods = report.tables.find((tb) => tb.title === "Metode pembayaran")!;
    expect(methods.rows.map((r) => [r.label, r.revenue])).toEqual([
      ["Tunai", 40_000],
      ["QRIS", 25_000],
    ]);
    const detail = report.tables.find((tb) => tb.title === "Detail transaksi")!;
    expect(detail.rows).toHaveLength(2);
    expect(detail.totals?.total).toBe(65_000);
    expect(report.tables.find((tb) => tb.title === "Diskon")!.rows).toHaveLength(1);

    const file = await reports.exportModuleReport({ module: "penjualan", type: "day", range: { from: today, to: today }, division: "semua", outletId, format: "pdf" });
    await dump(file);
    expect(file.filename).toBe(`GARAGE_LAPORAN_PENJUALAN_${today}.pdf`);
    expect(pdfPages(file.body)).toBeGreaterThanOrEqual(1);
    const xlsx = await reports.exportModuleReport({ module: "penjualan", type: "day", range: { from: today, to: today }, division: "semua", outletId, format: "xlsx" });
    await dump(xlsx);
    const book = await readXlsx(xlsx.body);
    expect(totalOf(book.getWorksheet("Detail transaksi")!, "Total")).toBe(65_000);
  });
});

describe("Laporan Keuangan", () => {
  it("laba rugi & rekonsiliasi kas terbentuk dengan nama file standar", async () => {
    const pnl = await reports.exportModuleReport({ module: "keuangan", type: "pnl", range: { from: today, to: today }, division: "semua", outletId, format: "xlsx" });
    await dump(pnl);
    expect(pnl.filename).toBe(`GARAGE_LAPORAN_LABA_RUGI_${today}.xlsx`);
    const book = await readXlsx(pnl.body);
    expect(book.worksheets[0].getCell("A1").value).toBe("GARAGE COFFEE");

    const rec = await reports.buildModuleReport({ module: "keuangan", type: "rekonsiliasi", range: { from: today, to: today }, division: "semua", outletId });
    expect(rec.title).toBe("Laporan Rekonsiliasi Kas & QRIS");
    // Shift seed masih terbuka → belum masuk rekonsiliasi.
    expect(rec.tables[0].rows).toHaveLength(0);

    const pay = await reports.buildModuleReport({ module: "keuangan", type: "pembayaran-supplier", range: { from: today, to: today }, division: "semua", outletId });
    expect(pay.tables[0].totals?.total).toBe(53_000 + 150_000);
  });

  it("jenis laporan tak dikenal ditolak", async () => {
    await expect(
      reports.exportModuleReport({ module: "stok", type: "ngawur", range: { from: today, to: today }, division: "semua", outletId, format: "csv" }),
    ).rejects.toThrow(/tidak dikenal/);
  });
});
