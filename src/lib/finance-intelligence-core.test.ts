import { describe, expect, it } from "vitest";

import { sumFigures, type DayFigure } from "./finance-control-core";
import { baseScenarioLines, buildCeoBrief, computeForecast, computeScenario } from "./finance-intelligence-core";

function totals(partial: Partial<DayFigure>) {
  const figure: DayFigure = {
    date: "2026-09-01",
    orderCount: 0,
    grossSales: 0,
    discount: 0,
    refund: 0,
    voidCount: 0,
    voidAmount: 0,
    netSales: 0,
    deliveryFees: 0,
    cogs: 0,
    cogsRecipe: 0,
    cogsShrinkage: 0,
    purchaseBar: 0,
    purchaseDapur: 0,
    purchaseUmum: 0,
    grossProfit: 0,
    payroll: 0,
    operatingExpense: 0,
    operatingProfit: 0,
    nonOperatingExpense: 0,
    otherIncome: 0,
    netProfit: 0,
    cashIn: 0,
    cashOut: 0,
    reserveAllocation: 0,
    fixedCost: 0,
    variableCost: 0,
    lineSales: 0,
    coveredLineSales: 0,
    costLines: {},
    cashOutByGroup: {},
    channels: {},
    linkedActual: {},
    source: "live",
    ...partial,
  };
  return sumFigures([figure]);
}

describe("computeScenario (What-If)", () => {
  const base = baseScenarioLines(
    totals({
      netSales: 60_000_000,
      cogs: 21_000_000,
      payroll: 16_200_000,
      operatingExpense: 5_000_000,
      costLines: { Iklan: 900_000 },
    }),
  );

  it("contoh PRD: revenue +20% → Rp72 jt, HPP ikut volume", () => {
    const result = computeScenario(base, { revenuePct: 20, hppPct: 0, payrollPct: 0, advertisingPct: 0, expensePct: 0 });
    expect(result.projected.revenue).toBe(72_000_000);
    expect(result.projected.cogs).toBe(25_200_000);
    expect(result.projected.netProfit).toBe(72_000_000 - 25_200_000 - 16_200_000 - 900_000 - 4_100_000);
    expect(result.label).toBe("PROYEKSI");
  });

  it("skenario nol = aktual (tidak mengubah data aktual)", () => {
    const result = computeScenario(base, { revenuePct: 0, hppPct: 0, payrollPct: 0, advertisingPct: 0, expensePct: 0 });
    expect(result.projected).toEqual(base);
    expect(result.delta.netProfit).toBe(0);
  });
});

describe("computeForecast", () => {
  it("run-rate 30 hari × hari per bulan, tanpa tren bila data kurang", () => {
    const result = computeForecast({
      base: {
        recent: totals({ netSales: 30_000_000, cogs: 9_000_000, variableCost: 9_000_000, lineSales: 1, coveredLineSales: 1 }),
        previous: totals({}),
        activeDays: 30,
        previousActiveDays: 0,
        fixedCostDaily: 600_000,
        capitalInitial: 500_000_000,
        capitalRecovered: 0,
      },
      horizon: 3,
      todayKey: "2026-09-23",
    });
    expect(result.months.map((m) => m.month)).toEqual(["2026-10", "2026-11", "2026-12"]);
    // Oktober 31 hari: 1 jt/hari × 31, HPP 30%, biaya tetap 600rb × 31.
    expect(result.months[0].revenue).toBe(31_000_000);
    expect(result.months[0].netProfit).toBe(31_000_000 - 9_300_000 - 18_600_000);
    expect(result.assumptions.growthSource).toBe("flat");
    expect(result.label).toBe("PROYEKSI");
  });

  it("tren dibatasi ±20%/bulan", () => {
    const result = computeForecast({
      base: {
        recent: totals({ netSales: 60_000_000 }),
        previous: totals({ netSales: 10_000_000 }),
        activeDays: 30,
        previousActiveDays: 30,
        fixedCostDaily: 0,
        capitalInitial: 0,
        capitalRecovered: 0,
      },
      horizon: 1,
      todayKey: "2026-09-23",
    });
    expect(result.assumptions.monthlyGrowthPct).toBe(20);
  });
});

describe("buildCeoBrief", () => {
  it("memuat revenue, BEP, cashflow, capital recovery, dan main attention", () => {
    const brief = buildCeoBrief({
      dateLabel: "23 September 2026",
      revenueToday: 2_850_000,
      revenueChangePct: 12.4,
      netProfitToday: 850_000,
      netProfitMonth: 12_000_000,
      bepPct: 118,
      bepStatusLabel: "BEP tercapai",
      cashflowNetMonth: 4_000_000,
      cashStatus: "AMAN",
      recoveryPct: 62,
      paybackMonths: 6.3,
      healthLevel: "SEHAT",
      mainAttention: "HPP meningkat 4,2% dibanding rata-rata 7 hari.",
      topProduct: null,
    });
    expect(brief.text).toContain("Revenue hari ini: Rp2.850.000 (+12,4% vs kemarin)");
    expect(brief.text).toContain("BEP hari ini: 118% — BEP tercapai");
    expect(brief.text).toContain("Cashflow operasional bulan ini: Positif");
    expect(brief.text).toContain("Main attention: HPP meningkat 4,2%");
  });
});
