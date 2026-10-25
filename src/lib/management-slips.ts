// =============================================================================
// Kertas struk manajemen (owner, Okt 2026): Slip Tutup Shift & Rekap Harian.
// Dicetak di printer thermal perangkat (58/80 mm) memakai mesin tata letak yang
// sama dengan struk pelanggan. Data dari API yang sudah ada:
//   /api/finance/cash-sessions/[id]/summary  → slip tutup shift
//   /api/finance/cash-sessions/daily         → rekap harian
// =============================================================================

import { discrepancyStatusLabel } from "@/lib/cash-discrepancy";
import {
  createLayout,
  formatJakartaDateTime,
  formatRupiah,
  formatSignedRupiah,
  type ReceiptLayoutOptions,
} from "@/lib/receipt-layout";

export interface SlipBrand {
  brandName?: string | null;
  brandTagline?: string | null;
  outletName?: string | null;
  outletCode?: string | null;
}

export interface SlipOptions extends ReceiptLayoutOptions {
  brand?: SlipBrand | null;
  /** Kolom tanda tangan Kasir / Manajer. Default tampil. */
  showSignature?: boolean | null;
  printedBy?: string | null;
  printedAt?: string | null;
}

export interface ShiftSlipInput {
  session: {
    code: string;
    status?: string | null;
    shiftLabel?: string | null;
    businessDate?: string | null;
    openedAt?: string | null;
    closedAt?: string | null;
    openingCash?: number | null;
    expectedCash?: number | null;
    actualCash?: number | null;
    discrepancy?: number | null;
    discrepancyStatus?: string | null;
    managerSignOffAt?: string | null;
    openedByName?: string | null;
    closedByName?: string | null;
    outletCode?: string | null;
  };
  counts?: { total?: number; paid?: number; refunded?: number } | null;
  sales?: {
    gross?: number;
    subtotal?: number;
    service?: number;
    tax?: number;
    discount?: number;
  } | null;
  byMethod?: Array<{ method: string; count: number; total: number }> | null;
  qrisCounted?: number | null;
  floatLeft?: number | null;
  depositAmount?: number | null;
  closingNote?: string | null;
  cashMovements?: { cashIn: number; cashOut: number } | null;
}

export interface DailyRecapRow {
  code: string;
  shiftLabel?: string | null;
  cashierName?: string | null;
  status?: string | null;
  openedAt?: string | null;
  closedAt?: string | null;
  expectedCash?: number | null;
  actualCash?: number | null;
  discrepancy?: number | null;
  counts?: { total?: number; paid?: number; refunded?: number } | null;
  sales?: { gross?: number; discount?: number; service?: number; tax?: number } | null;
  byMethod?: Array<{ method: string; count: number; total: number }> | null;
  qrisTotal?: number | null;
  qrisCounted?: number | null;
  qrisDiscrepancy?: number | null;
  depositAmount?: number | null;
}

export interface DailyRecapInput {
  date: string;
  rows: DailyRecapRow[];
  staleOpen?: Array<{ code: string; cashierName?: string | null }> | null;
  totals: {
    shifts: number;
    orders: number;
    paidOrders: number;
    gross: number;
    cash: number;
    nonCash: number;
    expectedCash: number;
    actualCash: number;
    discrepancy: number;
  };
}

const METHOD_LABELS: Record<string, string> = {
  cash: "Tunai",
  tunai: "Tunai",
  qris: "QRIS",
  transfer: "Transfer",
  debit: "Debit",
  card: "Kartu",
  points: "Poin",
};

export function paymentMethodLabel(method: string): string {
  const key = String(method ?? "").trim().toLowerCase();
  return METHOD_LABELS[key] ?? (String(method ?? "").trim() || "Lainnya");
}

function discrepancyLabel(value: number): string {
  if (value === 0) return "PAS";
  return value > 0 ? "LEBIH" : "KURANG";
}

function header(layout: ReturnType<typeof createLayout>, title: string, options: SlipOptions) {
  const brand = options.brand ?? {};
  layout.center((brand.brandName || "GARAGE").toUpperCase());
  layout.center(brand.brandTagline || "Coffee · Tebing Tinggi");
  const outlet = [brand.outletName, brand.outletCode].filter(Boolean).join(" - ");
  if (outlet) layout.center(outlet);
  layout.banner(title);
}

function footer(layout: ReturnType<typeof createLayout>, options: SlipOptions, signers: string[]) {
  if (options.showSignature !== false) {
    layout.signatures(signers);
  }
  layout.divider();
  layout.field("Dicetak", formatJakartaDateTime(options.printedAt ?? new Date().toISOString()));
  if (options.printedBy) layout.field("Oleh", options.printedBy);
  layout.center("Dokumen internal - bukan struk");
  layout.blank();
}

function mergeMethods(
  rows: Array<{ byMethod?: Array<{ method: string; count: number; total: number }> | null }>,
) {
  const map = new Map<string, { count: number; total: number }>();
  for (const row of rows) {
    for (const entry of row.byMethod ?? []) {
      const label = paymentMethodLabel(entry.method);
      const current = map.get(label) ?? { count: 0, total: 0 };
      current.count += entry.count;
      current.total += entry.total;
      map.set(label, current);
    }
  }
  return Array.from(map.entries())
    .map(([label, stats]) => ({ label, ...stats }))
    .sort((a, b) => b.total - a.total);
}

/** Slip Tutup Shift: kas, penjualan per metode, selisih, tanda tangan. */
export function buildShiftSlipContent(input: ShiftSlipInput, options: SlipOptions = {}): string {
  const layout = createLayout(options);
  const s = input.session;
  header(layout, "SLIP TUTUP SHIFT", options);

  layout.field("Shift", [s.code, s.shiftLabel].filter(Boolean).join(" - "));
  if (s.businessDate) layout.field("Tanggal", s.businessDate);
  layout.field("Kasir", s.openedByName || "-");
  layout.field("Buka", formatJakartaDateTime(s.openedAt));
  layout.field("Tutup", s.closedAt ? formatJakartaDateTime(s.closedAt) : "MASIH BUKA");
  if (s.closedByName && s.closedByName !== s.openedByName) layout.field("Ditutup", s.closedByName);
  layout.divider();

  layout.text("PENJUALAN");
  const counts = input.counts ?? {};
  layout.pair("Transaksi lunas", String(counts.paid ?? 0));
  if ((counts.refunded ?? 0) > 0) layout.pair("Void/refund/batal", String(counts.refunded));
  const sales = input.sales ?? {};
  layout.pair("Subtotal menu", formatRupiah(sales.subtotal));
  if ((sales.discount ?? 0) > 0) layout.pair("Diskon", `-${formatRupiah(sales.discount)}`);
  if ((sales.service ?? 0) > 0) layout.pair("Service", formatRupiah(sales.service));
  if ((sales.tax ?? 0) > 0) layout.pair("Pajak (PB1)", formatRupiah(sales.tax));
  layout.pair("OMZET KOTOR", formatRupiah(sales.gross));
  layout.divider();

  layout.text("PER METODE BAYAR");
  const methods = mergeMethods([{ byMethod: input.byMethod }]);
  if (methods.length === 0) layout.text("(belum ada pembayaran)");
  for (const method of methods) {
    layout.pair(`${method.label} (${method.count}x)`, formatRupiah(method.total));
  }
  layout.divider();

  layout.text("KAS LACI");
  layout.pair("Modal awal", formatRupiah(s.openingCash));
  if (input.cashMovements?.cashIn) layout.pair("Kas masuk", formatRupiah(input.cashMovements.cashIn));
  if (input.cashMovements?.cashOut) layout.pair("Kas keluar", `-${formatRupiah(input.cashMovements.cashOut)}`);
  layout.pair("Kas seharusnya", formatRupiah(s.expectedCash));
  layout.pair("Kas dihitung", s.actualCash == null ? "-" : formatRupiah(s.actualCash));
  const diff = Math.round(s.discrepancy ?? 0);
  layout.pair(`Selisih (${discrepancyLabel(diff)})`, formatSignedRupiah(diff));
  if (diff !== 0) {
    layout.field("Status", s.managerSignOffAt ? "Disetujui manajer" : s.discrepancyStatus ? discrepancyStatusLabel(s.discrepancyStatus) : "Perlu dicek");
  }
  if (input.floatLeft != null) layout.pair("Ditinggal di laci", formatRupiah(input.floatLeft));
  if (input.depositAmount != null) layout.pair("Disetor", formatRupiah(input.depositAmount));

  const qrisRecorded = methods.find((m) => m.label === "QRIS")?.total ?? 0;
  if (input.qrisCounted != null) {
    layout.divider();
    layout.text("PENCOCOKAN QRIS");
    layout.pair("QRIS tercatat", formatRupiah(qrisRecorded));
    layout.pair("QRIS di mutasi", formatRupiah(input.qrisCounted));
    layout.pair("Selisih QRIS", formatSignedRupiah(input.qrisCounted - qrisRecorded));
  }
  if (input.closingNote) {
    layout.divider();
    layout.field("Catatan", input.closingNote);
  }
  footer(layout, options, ["Kasir", "Manajer"]);
  return layout.output();
}

/** Rekap Harian Manajemen: total hari, per metode, per shift, selisih kas. */
export function buildDailyRecapContent(input: DailyRecapInput, options: SlipOptions = {}): string {
  const layout = createLayout(options);
  header(layout, "REKAP HARIAN", options);
  layout.field("Tanggal", input.date);
  layout.divider();

  const t = input.totals;
  layout.text("RINGKASAN");
  layout.pair("Jumlah shift", String(t.shifts));
  layout.pair("Transaksi lunas", String(t.paidOrders));
  layout.pair("Total order", String(t.orders));
  layout.pair("OMZET KOTOR", formatRupiah(t.gross));
  const avg = t.paidOrders > 0 ? t.gross / t.paidOrders : 0;
  layout.pair("Rata-rata/struk", formatRupiah(avg));
  const discount = input.rows.reduce((sum, row) => sum + (row.sales?.discount ?? 0), 0);
  if (discount > 0) layout.pair("Total diskon", `-${formatRupiah(discount)}`);
  const refunded = input.rows.reduce((sum, row) => sum + (row.counts?.refunded ?? 0), 0);
  if (refunded > 0) layout.pair("Void/refund/batal", String(refunded));
  layout.divider();

  layout.text("PER METODE BAYAR");
  const methods = mergeMethods(input.rows);
  if (methods.length === 0) layout.text("(belum ada pembayaran)");
  for (const method of methods) {
    layout.pair(`${method.label} (${method.count}x)`, formatRupiah(method.total));
  }
  layout.divider();

  layout.text("KAS");
  layout.pair("Kas seharusnya", formatRupiah(t.expectedCash));
  layout.pair("Kas dihitung", formatRupiah(t.actualCash));
  layout.pair(`Selisih (${discrepancyLabel(Math.round(t.discrepancy))})`, formatSignedRupiah(t.discrepancy));
  const deposit = input.rows.reduce((sum, row) => sum + (row.depositAmount ?? 0), 0);
  if (deposit > 0) layout.pair("Total disetor", formatRupiah(deposit));

  for (const row of input.rows) {
    layout.divider("=");
    layout.text(`SHIFT ${[row.code, row.shiftLabel].filter(Boolean).join(" - ")}`);
    layout.field("Kasir", row.cashierName || "-");
    layout.field("Jam", `${formatJakartaDateTime(row.openedAt)} - ${row.closedAt ? formatJakartaDateTime(row.closedAt) : "BUKA"}`);
    layout.pair("Transaksi", String(row.counts?.paid ?? 0));
    layout.pair("Omzet", formatRupiah(row.sales?.gross));
    for (const method of mergeMethods([row])) {
      layout.pair(`  ${method.label}`, formatRupiah(method.total));
    }
    layout.pair("Kas seharusnya", formatRupiah(row.expectedCash));
    layout.pair("Kas dihitung", row.actualCash == null ? "-" : formatRupiah(row.actualCash));
    const diff = Math.round(row.discrepancy ?? 0);
    layout.pair(`Selisih (${discrepancyLabel(diff)})`, formatSignedRupiah(diff));
    if (row.qrisDiscrepancy != null && row.qrisDiscrepancy !== 0) {
      layout.pair("Selisih QRIS", formatSignedRupiah(row.qrisDiscrepancy));
    }
  }

  if (input.staleOpen && input.staleOpen.length > 0) {
    layout.divider("=");
    layout.text("PERHATIAN: SHIFT BELUM DITUTUP");
    for (const stale of input.staleOpen) {
      layout.field("Shift", `${stale.code} (${stale.cashierName || "Kasir"})`);
    }
  }
  layout.divider("=");
  footer(layout, options, ["Manajer", "Owner"]);
  return layout.output();
}

/** Kertas uji: penggaris lebar + contoh semua gaya baris. */
export function buildTestPageContent(
  info: { printerLabel: string; modeLabel: string },
  options: SlipOptions = {},
): string {
  const layout = createLayout(options);
  header(layout, "TES CETAK", options);
  layout.field("Printer", info.printerLabel);
  layout.field("Koneksi", info.modeLabel);
  layout.field("Kertas", `${layout.W} kolom (${layout.W >= 48 ? "80" : "58"} mm)`);
  layout.divider();
  const ruler = Array.from({ length: layout.W }, (_, i) => String((i + 1) % 10)).join("");
  layout.rows.push(ruler);
  layout.text("Jika angka di atas muat dalam satu baris, lebar kertas sudah benar.");
  layout.divider();
  layout.pair("1x Kopi Susu Gula Aren Extra Shot Large", formatRupiah(28000));
  layout.pair("TOTAL", formatRupiah(28000));
  layout.divider();
  layout.center("Printer siap dipakai");
  layout.blank();
  return layout.output();
}

export interface CashMovementSlipInput {
  type: "out" | "in";
  category: string;
  description: string;
  amount: number;
  cashSessionCode: string;
  createdByName?: string | null;
  approvedByName?: string | null;
  movementAt?: string | null;
  refNo?: string | null;
  counterparty?: string | null;
}

/** Slip Kas Keluar / Masuk laci (bukti fisik untuk Owner). */
export function buildCashMovementSlipContent(input: CashMovementSlipInput, options: SlipOptions = {}): string {
  const layout = createLayout(options);
  header(layout, input.type === "out" ? "SLIP KAS KELUAR" : "SLIP KAS MASUK", options);
  if (input.refNo) layout.field("Ref", input.refNo);
  layout.field("Shift", input.cashSessionCode);
  layout.field("Waktu", formatJakartaDateTime(input.movementAt ?? new Date().toISOString()));
  layout.field("Kategori", input.category);
  layout.field("Ket", input.description);
  if (input.counterparty) layout.field("Pihak", input.counterparty);
  layout.field("Petugas", input.createdByName || "-");
  if (input.approvedByName) layout.field("Setuju", input.approvedByName);
  layout.divider();
  layout.pair(input.type === "out" ? "UANG KELUAR" : "UANG MASUK", formatRupiah(input.amount));
  footer(layout, options, ["Kasir", input.type === "out" ? "Penerima" : "Penyerah"]);
  return layout.output();
}

export interface SalesSummarySlipInput {
  range: { from: string; to: string };
  scope: "outlet" | "shift";
  sessionCode: string | null;
  summary: {
    gross: number;
    transactions: number;
    averageTicket: number;
    itemsSold: number;
    discount: number;
    deliveryFee: number;
    voidCount: number;
    refundCount: number;
  };
  products: Array<{ label: string; qty: number; revenue: number }>;
  paymentMethods: Array<{ label: string; revenue: number }>;
  cashiers: Array<{ label: string; revenue: number }>;
}

/** Ringkasan laporan penjualan untuk printer struk (10 produk terlaris). */
export function buildSalesSummarySlipContent(input: SalesSummarySlipInput, options: SlipOptions = {}): string {
  const layout = createLayout(options);
  header(layout, "LAPORAN PENJUALAN", options);
  layout.field(
    "Periode",
    input.range.from === input.range.to ? input.range.from : `${input.range.from} s/d ${input.range.to}`,
  );
  if (input.sessionCode) layout.field("Shift", input.sessionCode);
  layout.divider();
  const s = input.summary;
  layout.pair("OMZET", formatRupiah(s.gross));
  layout.pair("Transaksi", String(s.transactions));
  layout.pair("Rata-rata/struk", formatRupiah(s.averageTicket));
  layout.pair("Item terjual", String(s.itemsSold));
  if (s.discount > 0) layout.pair("Diskon", `-${formatRupiah(s.discount)}`);
  if (s.deliveryFee > 0) layout.pair("Ongkir", formatRupiah(s.deliveryFee));
  if (s.voidCount || s.refundCount) layout.pair("Void / refund", `${s.voidCount} / ${s.refundCount}`);
  layout.divider();
  layout.text("PER METODE BAYAR");
  if (input.paymentMethods.length === 0) layout.text("(belum ada pembayaran)");
  for (const row of input.paymentMethods) layout.pair(row.label, formatRupiah(row.revenue));
  layout.divider();
  layout.text("10 PRODUK TERLARIS");
  if (input.products.length === 0) layout.text("(belum ada penjualan)");
  for (const row of input.products.slice(0, 10)) layout.pair(`${row.qty}x ${row.label}`, formatRupiah(row.revenue));
  if (input.scope === "outlet" && input.cashiers.length > 0) {
    layout.divider();
    layout.text("PER KASIR");
    for (const row of input.cashiers) layout.pair(row.label, formatRupiah(row.revenue));
  }
  footer(layout, options, ["Manajer", "Owner"]);
  return layout.output();
}
