// Aturan murni Keuangan Event (GIGS EO Fase 2, Owner 17 Nov 2026). Tanpa DB.

export const EVENT_COST_CATEGORIES = [
  "honor",
  "sound",
  "venue",
  "dekorasi",
  "promosi",
  "konsumsi",
  "keamanan",
  "perizinan",
  "transport",
  "lain",
] as const;
export type EventCostCategory = (typeof EVENT_COST_CATEGORIES)[number];

export const EVENT_COST_LABEL: Record<EventCostCategory, string> = {
  honor: "Honor penampil",
  sound: "Sound & lighting",
  venue: "Venue / panggung",
  dekorasi: "Dekorasi",
  promosi: "Promosi & desain",
  konsumsi: "Konsumsi panitia/penampil",
  keamanan: "Keamanan",
  perizinan: "Perizinan",
  transport: "Transport",
  lain: "Lain-lain",
};

export const EVENT_PAY_SOURCES = ["bank_jago", "bank_bni", "external"] as const;
export type EventPaySource = (typeof EVENT_PAY_SOURCES)[number];
export const EVENT_PAY_SOURCE_LABEL: Record<EventPaySource, string> = {
  bank_jago: "Rekening Jago",
  bank_bni: "Rekening BNI",
  external: "Uang pribadi Owner",
};

export type BudgetLineInput = { id: string; category: EventCostCategory; title: string; plannedAmount: number; status: "aktif" | "arsip" };
export type PaymentInput = { budgetLineId: string; amount: number; status: "posted" | "void" };

export type BudgetLineSummary = BudgetLineInput & { paid: number; remaining: number; over: number };
export type CategorySummary = { category: EventCostCategory; label: string; planned: number; paid: number; over: number };

/**
 * Anggaran vs realisasi. Realisasi = pembayaran berstatus `posted` saja (yang batal tidak dihitung).
 * Pos arsip tetap dihitung realisasinya (uang sudah keluar) tetapi rencananya tidak.
 */
export function budgetSummary(lines: BudgetLineInput[], payments: PaymentInput[]) {
  const paidByLine = new Map<string, number>();
  for (const p of payments) if (p.status === "posted") paidByLine.set(p.budgetLineId, (paidByLine.get(p.budgetLineId) ?? 0) + p.amount);
  const rows: BudgetLineSummary[] = lines.map((line) => {
    const planned = line.status === "aktif" ? line.plannedAmount : 0;
    const paid = paidByLine.get(line.id) ?? 0;
    return { ...line, plannedAmount: planned, paid, remaining: Math.max(0, planned - paid), over: Math.max(0, paid - planned) };
  });
  const categories: CategorySummary[] = EVENT_COST_CATEGORIES.map((category) => {
    const inCat = rows.filter((r) => r.category === category);
    const planned = inCat.reduce((s, r) => s + r.plannedAmount, 0);
    const paid = inCat.reduce((s, r) => s + r.paid, 0);
    return { category, label: EVENT_COST_LABEL[category], planned, paid, over: Math.max(0, paid - planned) };
  }).filter((c) => c.planned || c.paid);
  const planned = rows.reduce((s, r) => s + r.plannedAmount, 0);
  const paid = rows.reduce((s, r) => s + r.paid, 0);
  // Sisa = jumlah sisa per pos (lebih bayar di satu pos tidak menutup pos lain yang belum dibayar).
  const remaining = rows.reduce((s, r) => s + r.remaining, 0);
  const over = rows.reduce((s, r) => s + r.over, 0);
  return { rows, categories, totals: { planned, paid, remaining, over } };
}

export type EventProfitInput = {
  /** Penjualan bersih menu event (setelah diskon). */
  menuNetSales: number;
  /** HPP menu event; null = snapshot HPP tidak lengkap (margin tidak dihitung). */
  menuCost: number | null;
  /** Uang sponsor yang benar-benar masuk (dikurangi pembatalan). */
  sponsorIn: number;
  /** Sisa uang sponsor yang disepakati tetapi belum masuk. */
  sponsorPending: number;
  /** Realisasi biaya event (dibayar). */
  costPaid: number;
  /** Sisa anggaran yang belum dibayar. */
  costRemaining: number;
};

/**
 * Untung/rugi event. "Saat ini" = uang nyata (masuk − keluar). "Proyeksi" = bila sponsor tertagih lunas dan sisa
 * anggaran dibayar. Margin menu hanya dihitung bila HPP lengkap; bila tidak, penjualan menu dipakai apa adanya dan
 * ditandai `menuMarginKnown = false` (tidak pernah diisi 0 diam-diam).
 */
export function eventProfit(input: EventProfitInput) {
  const menuMarginKnown = input.menuCost !== null;
  const menuContribution = menuMarginKnown ? input.menuNetSales - (input.menuCost ?? 0) : input.menuNetSales;
  const income = menuContribution + input.sponsorIn;
  const current = income - input.costPaid;
  const projected = current + input.sponsorPending - input.costRemaining;
  return {
    menuContribution,
    menuMarginKnown,
    income,
    current,
    projected,
    status: current >= 0 ? ("untung" as const) : ("rugi" as const),
    projectedStatus: projected >= 0 ? ("untung" as const) : ("rugi" as const),
  };
}

// ─── Impor RAB dari platform GIGS (Owner 17 Nov 2026, "jangan kerja 2x") ────────────────────────────

/** Kategori pos dari nama pos RAB platform (kata kunci, tanpa menebak di luar daftar → "lain"). */
export function platformBudgetCategory(name: string): EventCostCategory {
  const n = name.toLowerCase();
  if (/\b(band|stand-?up|komika|comedy|mc|honor|talent|penampil|dj|akustik)\b/.test(n)) return "honor";
  if (/(sound|lighting|lampu|drum|audio)/.test(n)) return "sound";
  if (/(sewa tempat|venue|panggung|stage|tenda)/.test(n)) return "venue";
  if (/(konsumsi|komsumsi|makan|minum|catering)/.test(n)) return "konsumsi";
  if (/(dekor)/.test(n)) return "dekorasi";
  if (/(promosi|publikasi|desain|poster|iklan|dokumentasi|foto|video)/.test(n)) return "promosi";
  if (/(keamanan|security|satpam)/.test(n)) return "keamanan";
  if (/(izin|perizinan)/.test(n)) return "perizinan";
  if (/(transport|bensin|ongkir)/.test(n)) return "transport";
  return "lain";
}

/**
 * Pos cadangan/tabungan BUKAN biaya: tidak diimpor sebagai pos anggaran (bila dicatat sebagai biaya,
 * proyeksi untung/rugi event jadi salah). Platform menulisnya mis. "Save Money" — "Simpanan cadangan, bukan biaya".
 */
export function isReserveBudgetLine(name: string, purpose: string | null): boolean {
  const text = `${name} ${purpose ?? ""}`.toLowerCase();
  return /(save money|tabungan|simpanan|cadangan|buffer|dana darurat)/.test(text) || /bukan biaya/.test(text);
}
