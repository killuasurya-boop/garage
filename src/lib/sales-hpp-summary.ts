// Ringkasan penjualan per kategori & produk dengan HPP produk (Owner 24 Nov 2026).
// Murni (tanpa DB) — dipakai laporan tutup shift dan Laporan Harian Rekening Bersama.
//
// HPP = HPP per produk yang tersimpan di varian (`menu_variants.base_cost`): resep untuk menu, harga modal untuk retail,
// harga setor untuk produk mitra. Bukan persen tebakan. Varian ber-HPP 0 dihitung 0 dan ditandai "HPP belum diisi".

export type SalesUnit = "cup" | "porsi" | "pcs";

/** HPP & laba hanya untuk Owner dan Manajer (Owner 24 Nov 2026); Kasir melihat qty & omzet saja. */
export function canSeeProductHpp(role: string | null | undefined) {
  return role === "Owner" || role === "Manajer";
}

export type SalesLine = {
  menuItemId: string | null;
  variantId: string | null;
  itemName: string;
  variantLabel: string | null;
  category: string | null;
  /** Stasiun produk: bar | dapur | none (diserahkan kasir). */
  station: string | null;
  /** menu | retail | bundle | partner */
  productType: string | null;
  qty: number;
  /** Total baris sebelum diskon level order (Rp). */
  revenue: number;
  /** HPP per unit dari varian; null/0 = belum diisi. */
  unitHpp: number | null;
};

export type SalesCategoryRow = {
  name: string;
  unit: SalesUnit;
  qty: number;
  revenue: number;
  hpp: number;
  grossProfit: number;
  /** Qty yang HPP-nya belum diisi (dihitung 0). */
  missingHppQty: number;
};

export type SalesProductRow = {
  key: string;
  name: string;
  category: string;
  unit: SalesUnit;
  qty: number;
  revenue: number;
  unitHpp: number | null;
  hpp: number;
  grossProfit: number;
};

export type SalesHppSummary = {
  categories: SalesCategoryRow[];
  products: SalesProductRow[];
  totals: { qty: number; revenue: number; hpp: number; grossProfit: number; missingHppProducts: number };
};

const PLAIN_VARIANTS = new Set(["", "-", "reguler", "regular", "default", "standar"]);

/** Satuan hitung: minuman Bar = cup, Dapur & produk mitra = porsi, selain itu (rokok, mineral) = pcs. */
export function salesUnitFor(line: Pick<SalesLine, "station" | "productType">): SalesUnit {
  if (line.productType === "partner") return "porsi";
  if (line.productType === "retail") return "pcs";
  if (line.station === "bar") return "cup";
  if (line.station === "dapur") return "porsi";
  return "pcs";
}

export function salesProductName(line: Pick<SalesLine, "itemName" | "variantLabel">) {
  const variant = (line.variantLabel ?? "").trim();
  return variant && !PLAIN_VARIANTS.has(variant.toLowerCase()) ? `${line.itemName} · ${variant}` : line.itemName;
}

export function summarizeSalesHpp(lines: SalesLine[]): SalesHppSummary {
  const products = new Map<string, SalesProductRow>();
  const categories = new Map<string, SalesCategoryRow>();
  for (const line of lines) {
    if (!line.qty) continue;
    const unit = salesUnitFor(line);
    const category = (line.category ?? "").trim() || "Lainnya";
    const unitHpp = line.unitHpp && line.unitHpp > 0 ? Math.round(line.unitHpp) : null;
    const hpp = (unitHpp ?? 0) * line.qty;
    const key = `${line.menuItemId ?? line.itemName}::${line.variantId ?? ""}`;
    const product = products.get(key) ?? { key, name: salesProductName(line), category, unit, qty: 0, revenue: 0, unitHpp, hpp: 0, grossProfit: 0 };
    product.qty += line.qty;
    product.revenue += line.revenue;
    product.hpp += hpp;
    product.grossProfit = product.revenue - product.hpp;
    products.set(key, product);

    const cat = categories.get(category) ?? { name: category, unit, qty: 0, revenue: 0, hpp: 0, grossProfit: 0, missingHppQty: 0 };
    cat.qty += line.qty;
    cat.revenue += line.revenue;
    cat.hpp += hpp;
    cat.grossProfit = cat.revenue - cat.hpp;
    if (unitHpp === null) cat.missingHppQty += line.qty;
    categories.set(category, cat);
  }
  const productRows = [...products.values()].sort((a, b) => a.category.localeCompare(b.category, "id") || b.qty - a.qty || a.name.localeCompare(b.name, "id"));
  const categoryRows = [...categories.values()].sort((a, b) => b.revenue - a.revenue || a.name.localeCompare(b.name, "id"));
  return {
    categories: categoryRows,
    products: productRows,
    totals: {
      qty: productRows.reduce((sum, row) => sum + row.qty, 0),
      revenue: productRows.reduce((sum, row) => sum + row.revenue, 0),
      hpp: productRows.reduce((sum, row) => sum + row.hpp, 0),
      grossProfit: productRows.reduce((sum, row) => sum + row.grossProfit, 0),
      missingHppProducts: productRows.filter((row) => row.unitHpp === null).length,
    },
  };
}

/** "Kopi 42 cup · Makanan 25 porsi · Rokok 3 pcs" — ringkas untuk satu baris laporan. */
export function categoryQtyText(categories: Pick<SalesCategoryRow, "name" | "qty" | "unit">[]) {
  return categories.length ? categories.map((c) => `${c.name} ${new Intl.NumberFormat("id-ID").format(c.qty)} ${c.unit}`).join(" · ") : "Belum ada penjualan";
}

// ─── Laporan Harian Rekening Bersama ─────────────────────────────────────────

/** Angka keuangan satu hari dari mesin Finance (DayFigure) yang dipakai laporan harian. */
export type DailyFinanceFigure = {
  date: string;
  orderCount: number;
  grossSales: number;
  discount: number;
  refund: number;
  netSales: number;
  payroll: number;
  operatingExpense: number;
  nonOperatingExpense: number;
  otherIncome: number;
  /** Uang masuk per metode bayar (Cash, QRIS, Transfer, …; "Modal" diabaikan). */
  channels: Record<string, number>;
  /** "locked" = angka dikunci Daily Closing. */
  source: string;
};

export type DailyBankReport = {
  date: string;
  /** Omzet, upah & biaya dari angka Daily Closing (dikunci). */
  locked: boolean;
  /** HPP produk juga dibekukan saat closing. false pada hari dikunci = HPP dihitung ulang dari HPP produk saat ini. */
  hppLocked: boolean;
  orderCount: number;
  grossSales: number;
  discount: number;
  refund: number;
  netSales: number;
  hppProducts: number;
  grossProfit: number;
  payroll: number;
  operatingExpense: number;
  operatingCost: number;
  operatingProfit: number;
  nonOperatingExpense: number;
  otherIncome: number;
  netProfit: number;
  netMarginPct: number | null;
  channels: Array<{ method: string; amount: number }>;
  sales: SalesHppSummary;
};

/**
 * Laba bersih harian versi Owner (24 Nov 2026): HPP = HPP produk × qty terjual (bukan belanja gudang).
 * Laba kotor = omzet bersih − HPP produk; biaya operasional harian = upah + biaya tetap & operasional;
 * laba bersih = laba operasional − biaya non-operasional + pendapatan lain.
 */
export function buildDailyBankReport(figure: DailyFinanceFigure, sales: SalesHppSummary, options: { hppFrozen?: boolean } = {}): DailyBankReport {
  const hppProducts = sales.totals.hpp;
  const grossProfit = figure.netSales - hppProducts;
  const operatingCost = figure.payroll + figure.operatingExpense;
  const operatingProfit = grossProfit - operatingCost;
  const netProfit = operatingProfit - figure.nonOperatingExpense + figure.otherIncome;
  const channels = Object.entries(figure.channels ?? {})
    .filter(([method, amount]) => method !== "Modal" && amount)
    .map(([method, amount]) => ({ method, amount }))
    .sort((a, b) => b.amount - a.amount);
  return {
    date: figure.date,
    locked: figure.source === "locked",
    hppLocked: figure.source === "locked" && Boolean(options.hppFrozen),
    orderCount: figure.orderCount,
    grossSales: figure.grossSales,
    discount: figure.discount,
    refund: figure.refund,
    netSales: figure.netSales,
    hppProducts,
    grossProfit,
    payroll: figure.payroll,
    operatingExpense: figure.operatingExpense,
    operatingCost,
    operatingProfit,
    nonOperatingExpense: figure.nonOperatingExpense,
    otherIncome: figure.otherIncome,
    netProfit,
    netMarginPct: figure.netSales > 0 ? Math.round((netProfit / figure.netSales) * 1000) / 10 : null,
    channels,
    sales,
  };
}

/** Teks ringkas untuk dikirim ke grup WhatsApp keuangan (urutan sama dengan PDF). */
export function dailyBankReportText(r: DailyBankReport, outletName: string) {
  const rp = (n: number) => `${n < 0 ? "-" : ""}Rp${new Intl.NumberFormat("id-ID").format(Math.abs(Math.round(n)))}`;
  const date = new Intl.DateTimeFormat("id-ID", { timeZone: "UTC", weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(new Date(`${r.date}T00:00:00Z`));
  const lines = [
    `*Laporan Harian ${outletName}*`,
    date + ` (${dailyBankStatusLabel(r).toLowerCase()})`,
    "",
    `Omzet kotor: ${rp(r.grossSales)} (${r.orderCount} order)`,
    `Diskon/refund: -${rp(r.discount + r.refund)}`,
    `Omzet bersih: ${rp(r.netSales)}`,
    `Terjual: ${categoryQtyText(r.sales.categories)}`,
    "",
    `HPP produk: -${rp(r.hppProducts)}`,
    `Laba kotor: ${rp(r.grossProfit)}`,
    `Biaya operasional harian: -${rp(r.operatingCost)} (upah ${rp(r.payroll)}, tetap & operasional ${rp(r.operatingExpense)})`,
  ];
  if (r.nonOperatingExpense) lines.push(`Biaya non-operasional: -${rp(r.nonOperatingExpense)}`);
  if (r.otherIncome) lines.push(`Pendapatan lain: ${rp(r.otherIncome)}`);
  lines.push(`*Laba bersih: ${rp(r.netProfit)}*`);
  if (r.channels.length) {
    lines.push("", "Uang masuk:");
    for (const c of r.channels) lines.push(`- ${c.method}: ${rp(c.amount)}`);
  }
  if (r.sales.totals.missingHppProducts) lines.push("", `Catatan: ${r.sales.totals.missingHppProducts} produk belum punya HPP (dihitung Rp0).`);
  return lines.join("\n");
}

/** Label status angka: Dikunci / Dikunci, HPP dihitung ulang / Sementara. */
export function dailyBankStatusLabel(r: Pick<DailyBankReport, "locked" | "hppLocked">) {
  if (!r.locked) return "Sementara";
  return r.hppLocked ? "Dikunci" : "Dikunci, HPP dihitung ulang";
}
