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
  return { rows, categories, totals: { planned, paid, remaining: Math.max(0, planned - paid), over: Math.max(0, paid - planned) } };
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
