// Garage Financial Control — Fase 5 Intelligence (PRD §38, §39, §56, §57).
// Kalkulasi murni. Semua hasil proyeksi berlabel PROYEKSI dan tidak pernah
// dicampur dengan angka aktual.

import { addDays, daysInMonth, formatRupiah, monthLabel, type FigureTotals } from "./finance-control-core";

// ─── Forecast (PRD §56) ─────────────────────────────────────────────────────

export const FORECAST_HORIZONS = [1, 3, 6, 12] as const;
export type ForecastHorizon = (typeof FORECAST_HORIZONS)[number];

export type ForecastBase = {
  /** 30 hari terakhir. */
  recent: FigureTotals;
  /** 30 hari sebelumnya (untuk tren). */
  previous: FigureTotals;
  /** Jumlah hari dengan penjualan di 30 hari terakhir. */
  activeDays: number;
  previousActiveDays: number;
  fixedCostDaily: number;
  capitalInitial: number;
  capitalRecovered: number;
};

export type ForecastMonth = {
  month: string;
  label: string;
  days: number;
  revenue: number;
  cogs: number;
  variableCost: number;
  fixedCost: number;
  netProfit: number;
  cumulativeRecovered: number;
  recoveryPct: number;
};

export type ForecastResult = {
  label: "PROYEKSI";
  horizon: number;
  reliable: boolean;
  notes: string[];
  assumptions: {
    avgDailyRevenue: number;
    monthlyGrowthPct: number;
    growthSource: "tren_30_hari" | "manual" | "flat";
    cogsRatioPct: number;
    variableRatioPct: number;
    fixedCostDaily: number;
  };
  months: ForecastMonth[];
  totals: { revenue: number; netProfit: number };
  paybackMonth: string | null;
};

const MAX_GROWTH = 0.2;

export function computeForecast(input: {
  base: ForecastBase;
  horizon: number;
  todayKey: string;
  growthOverridePct?: number | null;
}): ForecastResult {
  const { base } = input;
  const notes: string[] = [];
  const avgDailyRevenue = base.activeDays > 0 ? base.recent.netSales / 30 : 0;
  const cogsRatio = base.recent.netSales > 0 ? base.recent.cogs / base.recent.netSales : 0;
  const variableRatio =
    base.recent.netSales > 0 ? Math.max(0, base.recent.variableCost - base.recent.cogs) / base.recent.netSales : 0;

  let growth = 0;
  let growthSource: ForecastResult["assumptions"]["growthSource"] = "flat";
  if (input.growthOverridePct !== null && input.growthOverridePct !== undefined) {
    growth = Math.max(-0.5, Math.min(0.5, input.growthOverridePct / 100));
    growthSource = "manual";
  } else if (base.activeDays >= 14 && base.previousActiveDays >= 14 && base.previous.netSales > 0) {
    growth = Math.max(-MAX_GROWTH, Math.min(MAX_GROWTH, base.recent.netSales / base.previous.netSales - 1));
    growthSource = "tren_30_hari";
  } else {
    notes.push("Data 60 hari belum cukup untuk membaca tren — pertumbuhan diasumsikan 0%.");
  }

  const reliable = base.activeDays >= 14;
  if (!reliable) notes.push(`Baru ${base.activeDays} hari ada penjualan dalam 30 hari terakhir — proyeksi masih kasar.`);
  if (base.recent.lineSales > 0 && base.recent.coveredLineSales / base.recent.lineSales < 0.8) {
    notes.push("Resep belum lengkap — HPP proyeksi kemungkinan terlalu rendah.");
  }

  const months: ForecastMonth[] = [];
  let cursor = addDays(`${input.todayKey.slice(0, 7)}-01`, 32).slice(0, 7);
  let cumulative = base.capitalRecovered;
  let paybackMonth: string | null = base.capitalInitial > 0 && cumulative >= base.capitalInitial ? "sudah" : null;

  for (let index = 1; index <= input.horizon; index += 1) {
    const firstDay = `${cursor}-01`;
    const days = daysInMonth(firstDay);
    const revenue = Math.round(avgDailyRevenue * Math.pow(1 + growth, index) * days);
    const cogs = Math.round(revenue * cogsRatio);
    const variableCost = Math.round(revenue * variableRatio);
    const fixedCost = base.fixedCostDaily * days;
    const netProfit = revenue - cogs - variableCost - fixedCost;
    cumulative += netProfit;
    if (!paybackMonth && base.capitalInitial > 0 && cumulative >= base.capitalInitial) paybackMonth = cursor;
    months.push({
      month: cursor,
      label: monthLabel(firstDay),
      days,
      revenue,
      cogs,
      variableCost,
      fixedCost,
      netProfit,
      cumulativeRecovered: cumulative,
      recoveryPct:
        base.capitalInitial > 0 ? Math.max(0, Math.min(100, Math.round((cumulative / base.capitalInitial) * 1000) / 10)) : 0,
    });
    cursor = addDays(`${cursor}-01`, 32).slice(0, 7);
  }

  return {
    label: "PROYEKSI",
    horizon: input.horizon,
    reliable,
    notes,
    assumptions: {
      avgDailyRevenue: Math.round(avgDailyRevenue),
      monthlyGrowthPct: Math.round(growth * 1000) / 10,
      growthSource,
      cogsRatioPct: Math.round(cogsRatio * 1000) / 10,
      variableRatioPct: Math.round(variableRatio * 1000) / 10,
      fixedCostDaily: base.fixedCostDaily,
    },
    months,
    totals: {
      revenue: months.reduce((sum, m) => sum + m.revenue, 0),
      netProfit: months.reduce((sum, m) => sum + m.netProfit, 0),
    },
    paybackMonth,
  };
}

// ─── What-If (PRD §38) ──────────────────────────────────────────────────────

export type ScenarioInput = {
  revenuePct: number;
  hppPct: number;
  payrollPct: number;
  advertisingPct: number;
  expensePct: number;
};

export type ScenarioLines = {
  revenue: number;
  cogs: number;
  payroll: number;
  advertising: number;
  otherExpense: number;
  nonOperating: number;
  netProfit: number;
  netMarginPct: number | null;
  bep: number | null;
};

export const EMPTY_SCENARIO: ScenarioInput = { revenuePct: 0, hppPct: 0, payrollPct: 0, advertisingPct: 0, expensePct: 0 };

export const ADVERTISING_LINES = ["Iklan", "Marketing"];

function linesFrom(parts: Omit<ScenarioLines, "netProfit" | "netMarginPct" | "bep">): ScenarioLines {
  const netProfit =
    parts.revenue - parts.cogs - parts.payroll - parts.advertising - parts.otherExpense - parts.nonOperating;
  const cm = parts.revenue > 0 ? (parts.revenue - parts.cogs) / parts.revenue : null;
  const nonHpp = parts.payroll + parts.advertising + parts.otherExpense + parts.nonOperating;
  return {
    ...parts,
    netProfit,
    netMarginPct: parts.revenue > 0 ? Math.round((netProfit / parts.revenue) * 1000) / 10 : null,
    // Untuk simulasi, semua biaya selain HPP diperlakukan sebagai biaya tetap.
    bep: cm && cm > 0 ? Math.round(nonHpp / cm) : null,
  };
}

export function baseScenarioLines(totals: FigureTotals): ScenarioLines {
  const advertising = ADVERTISING_LINES.reduce((sum, name) => sum + (totals.costLines[name] ?? 0), 0);
  return linesFrom({
    revenue: totals.netSales,
    cogs: totals.cogs,
    payroll: totals.payroll,
    advertising,
    otherExpense: Math.max(0, totals.operatingExpense - advertising),
    nonOperating: totals.nonOperatingExpense,
  });
}

/**
 * Skenario: revenue mengubah volume (HPP ikut volume), hppPct mengubah biaya
 * bahan per porsi, sisanya mengubah pos biaya masing-masing.
 */
export function computeScenario(base: ScenarioLines, input: ScenarioInput) {
  const f = (pct: number) => 1 + Math.max(-100, Math.min(500, pct)) / 100;
  const projected = linesFrom({
    revenue: Math.round(base.revenue * f(input.revenuePct)),
    cogs: Math.round(base.cogs * f(input.revenuePct) * f(input.hppPct)),
    payroll: Math.round(base.payroll * f(input.payrollPct)),
    advertising: Math.round(base.advertising * f(input.advertisingPct)),
    otherExpense: Math.round(base.otherExpense * f(input.expensePct)),
    nonOperating: base.nonOperating,
  });
  return {
    label: "PROYEKSI" as const,
    actual: base,
    projected,
    delta: {
      revenue: projected.revenue - base.revenue,
      netProfit: projected.netProfit - base.netProfit,
    },
  };
}

export type ScenarioResult = ReturnType<typeof computeScenario>;

// ─── CEO Financial Brief (PRD §57) ─────────────────────────────────────────

export type BriefInput = {
  dateLabel: string;
  revenueToday: number;
  revenueChangePct: number | null;
  netProfitToday: number;
  netProfitMonth: number;
  bepPct: number | null;
  bepStatusLabel: string | null;
  cashflowNetMonth: number;
  cashStatus: string;
  recoveryPct: number;
  paybackMonths: number | null;
  healthLevel: string;
  mainAttention: string | null;
  topProduct: { name: string; contribution: number } | null;
};

export function buildCeoBrief(input: BriefInput) {
  const pct = (value: number) => `${new Intl.NumberFormat("id-ID", { maximumFractionDigits: 1 }).format(value)}%`;
  const lines = [
    "GARAGE CEO FINANCIAL BRIEF",
    input.dateLabel,
    "",
    `Revenue hari ini: ${formatRupiah(input.revenueToday)}${
      input.revenueChangePct !== null ? ` (${input.revenueChangePct > 0 ? "+" : ""}${pct(input.revenueChangePct)} vs kemarin)` : ""
    }`,
    `Net profit hari ini: ${formatRupiah(input.netProfitToday)}`,
    `Net profit bulan ini: ${formatRupiah(input.netProfitMonth)}`,
    `BEP hari ini: ${input.bepPct !== null ? `${pct(input.bepPct)} — ${input.bepStatusLabel}` : "belum bisa dihitung"}`,
    `Cashflow operasional bulan ini: ${input.cashflowNetMonth >= 0 ? "Positif" : "Negatif"} (${formatRupiah(input.cashflowNetMonth)})`,
    `Posisi kas: ${input.cashStatus}`,
    `Capital recovery: ${pct(input.recoveryPct)}${
      input.paybackMonths !== null ? ` · estimasi balik modal ±${new Intl.NumberFormat("id-ID").format(input.paybackMonths)} bulan (proyeksi)` : ""
    }`,
    `Financial health: ${input.healthLevel}`,
    ...(input.topProduct ? [`Produk kontribusi terbesar bulan ini: ${input.topProduct.name} (${formatRupiah(input.topProduct.contribution)})`] : []),
    "",
    `Main attention: ${input.mainAttention ?? "Tidak ada — semua indikator dalam batas."}`,
  ];
  return { text: lines.join("\n"), lines };
}
