// Katalog Pusat Laporan (aman untuk klien: tanpa import server/DB).
export const REPORT_MODULES = ["penjualan", "pembelian", "stok", "produksi", "keuangan"] as const;
export type ReportModule = (typeof REPORT_MODULES)[number];

export type ReportCatalogEntry = { id: string; label: string; kind: string; division: boolean };

/** Jenis laporan per modul (UI Pusat Laporan & validasi API). */
export const REPORT_CATALOG: Record<ReportModule, { label: string; description: string; types: ReportCatalogEntry[] }> = {
  penjualan: {
    label: "Penjualan",
    description: "Omzet, penjualan bersih, produk terlaris, kasir, shift, metode bayar, diskon, void & refund, detail transaksi.",
    types: [
      { id: "day", label: "Harian", kind: "LAPORAN_PENJUALAN", division: false },
      { id: "week", label: "Mingguan", kind: "LAPORAN_PENJUALAN", division: false },
      { id: "month", label: "Bulanan", kind: "LAPORAN_PENJUALAN", division: false },
      { id: "year", label: "Tahunan", kind: "LAPORAN_PENJUALAN", division: false },
    ],
  },
  pembelian: {
    label: "Pembelian Bahan Baku",
    description: "Per divisi Bar / Kitchen: tanggal, supplier, SKU, bahan, satuan, qty, harga satuan, total, status bayar + rekap supplier & tanggal.",
    types: [{ id: "detail", label: "Rincian & rekap supplier", kind: "PEMBELIAN_BAHAN_BAKU", division: true }],
  },
  stok: {
    label: "Inventory / Stok",
    description: "Stok awal, masuk, keluar, pemakaian produksi, mutasi, opname & selisih, stok akhir, stok kritis, nilai persediaan.",
    types: [{ id: "posisi", label: "Posisi, mutasi & opname", kind: "LAPORAN_STOK", division: true }],
  },
  produksi: {
    label: "Produksi",
    description: "Porsi menu dibuat, produksi olahan, kebutuhan resep vs pemakaian aktual (varians), waste, biaya produksi.",
    types: [{ id: "ringkasan", label: "Produksi, pemakaian & waste", kind: "LAPORAN_PRODUKSI", division: true }],
  },
  keuangan: {
    label: "Keuangan",
    description: "Laba rugi, pemasukan & pengeluaran, cashflow, pembayaran supplier, rekonsiliasi kas & QRIS, payroll, HPP.",
    types: [
      { id: "pnl", label: "Laba Rugi (P&L)", kind: "LAPORAN_LABA_RUGI", division: false },
      { id: "daily", label: "Keuangan Harian", kind: "LAPORAN_KEUANGAN_HARIAN", division: false },
      { id: "cashflow", label: "Cashflow (pemasukan & pengeluaran)", kind: "LAPORAN_CASHFLOW", division: false },
      { id: "expense", label: "Pengeluaran", kind: "LAPORAN_PENGELUARAN", division: false },
      { id: "pembayaran-supplier", label: "Pembayaran Supplier", kind: "LAPORAN_PEMBAYARAN_SUPPLIER", division: false },
      { id: "rekonsiliasi", label: "Rekonsiliasi Kas & QRIS", kind: "LAPORAN_REKONSILIASI_KAS", division: false },
      { id: "payroll", label: "Payroll", kind: "LAPORAN_PAYROLL", division: false },
      { id: "hpp", label: "HPP", kind: "LAPORAN_HPP", division: false },
      { id: "product", label: "Profitabilitas Produk", kind: "LAPORAN_PROFITABILITAS_PRODUK", division: false },
      { id: "bep", label: "BEP", kind: "LAPORAN_BEP", division: false },
      { id: "capital", label: "Balik Modal", kind: "LAPORAN_BALIK_MODAL", division: false },
    ],
  },
};

export function findReportType(module: ReportModule, type: string) {
  return REPORT_CATALOG[module].types.find((entry) => entry.id === type) ?? null;
}
