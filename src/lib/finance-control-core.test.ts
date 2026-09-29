import { describe, expect, it } from "vitest";

import {
  DEFAULT_THRESHOLDS,
  computeBep,
  computeCapitalRecovery,
  computeDayFigure,
  computePayrollRecon,
  fixedCostDaily,
  resolvePeriod,
  sumFigures,
  type DayRaw,
  type FinanceConfig,
} from "./finance-control-core";

const config: FinanceConfig = {
  businessStartDate: "2026-09-01",
  openingCash: { amount: 0, date: "2026-09-01", isSet: false },
  revenueTargetDaily: null,
  thresholds: DEFAULT_THRESHOLDS,
  costItems: [
    { code: "LISTRIK", name: "Token listrik", dailyAmount: 35_000, costClass: "semi_variable", treatment: "accrue", active: true, sortOrder: 1 },
    { code: "GAJI", name: "Gaji karyawan", dailyAmount: 450_000, costClass: "fixed", treatment: "budget_only", active: true, sortOrder: 2 },
    { code: "SEWA", name: "Sewa lapak", dailyAmount: 28_000, costClass: "fixed", treatment: "accrue", active: true, sortOrder: 3 },
    { code: "SAVE", name: "Save Money", dailyAmount: 100_000, costClass: "reserve", treatment: "reserve", active: true, sortOrder: 4 },
  ],
  payrollPositions: [
    { position: "Barista 1", monthlySalary: 2_000_000, headcount: 1, active: true },
    { position: "Barista 2", monthlySalary: 2_000_000, headcount: 1, active: true },
    { position: "Waiter 1", monthlySalary: 1_500_000, headcount: 1, active: true },
    { position: "Waiter 2", monthlySalary: 1_500_000, headcount: 1, active: true },
    { position: "Koki 1", monthlySalary: 2_000_000, headcount: 1, active: true },
    { position: "Asisten Koki", monthlySalary: 1_500_000, headcount: 1, active: true },
    { position: "Jaga Malam", monthlySalary: 2_000_000, headcount: 1, active: true },
    { position: "Kasir", monthlySalary: 1_200_000, headcount: 1, active: true },
    { position: "Manajer", monthlySalary: 2_500_000, headcount: 1, active: true },
  ],
  categories: [
    { name: "Listrik", groupKey: "opex", costClass: "semi_variable", costItemCode: "LISTRIK" },
    { name: "Gaji Karyawan", groupKey: "payroll_payout", costClass: "fixed", costItemCode: null },
    { name: "Belanja Dapur", groupKey: "cogs_purchase", costClass: "variable", costItemCode: null },
    { name: "Save Money", groupKey: "reserve", costClass: "reserve", costItemCode: "SAVE" },
    { name: "Payroll", groupKey: "payroll", costClass: "fixed", costItemCode: null },
  ],
  capital: [{ date: "2026-09-01", type: "injection", amount: 500_000_000 }],
};

function raw(partial: Partial<DayRaw>): DayRaw {
  return {
    date: "2026-09-23",
    orderCount: 0,
    netSales: 0,
    discount: 0,
    refund: 0,
    voidCount: 0,
    voidAmount: 0,
    cogs: 0,
    shrinkage: 0,
    lineSales: 0,
    coveredLineSales: 0,
    payrollWages: 0,
    payrollFee: 0,
    expenses: {},
    payments: {},
    settlementFees: 0,
    capitalIn: 0,
    capitalOut: 0,
    ...partial,
  };
}

describe("computeDayFigure", () => {
  it("menghitung P&L: net sales − HPP − payroll − opex = net profit", () => {
    const figure = computeDayFigure(
      raw({ netSales: 2_000_000, discount: 50_000, refund: 20_000, cogs: 700_000, payrollWages: 400_000, payrollFee: 10_000 }),
      config,
    );
    expect(figure.grossSales).toBe(2_070_000);
    expect(figure.grossProfit).toBe(1_300_000);
    expect(figure.payroll).toBe(410_000);
    // Akru: listrik 35rb + sewa 28rb. Gaji = budget_only, Save Money = reserve.
    expect(figure.operatingExpense).toBe(63_000);
    expect(figure.netProfit).toBe(1_300_000 - 410_000 - 63_000);
    expect(figure.reserveAllocation).toBe(100_000);
  });

  it("Save Money, payout gaji, dan belanja bahan tidak mengurangi net profit (tanpa double counting)", () => {
    const base = computeDayFigure(raw({ netSales: 1_000_000 }), config);
    const withCashOnly = computeDayFigure(
      raw({
        netSales: 1_000_000,
        expenses: { "Save Money": 100_000, "Gaji Karyawan": 500_000, "Belanja Dapur": 300_000, Listrik: 35_000 },
      }),
      config,
    );
    expect(withCashOnly.netProfit).toBe(base.netProfit);
    expect(withCashOnly.cashOut).toBe(935_000);
    expect(withCashOnly.linkedActual.LISTRIK).toBe(35_000);
  });

  it("HPP aktual = HPP resep + susut gudang; BEP tetap memakai HPP resep", () => {
    const figure = computeDayFigure(raw({ netSales: 1_000_000, cogs: 300_000, shrinkage: 25_000 }), config);
    expect(figure.cogsRecipe).toBe(300_000);
    expect(figure.cogsShrinkage).toBe(25_000);
    expect(figure.cogs).toBe(325_000);
    expect(figure.grossProfit).toBe(675_000);
    expect(figure.variableCost).toBe(300_000);
  });

  it("expense kategori Payroll manual masuk payroll P&L", () => {
    const figure = computeDayFigure(raw({ expenses: { Payroll: 83_333 } }), config);
    expect(figure.payroll).toBe(83_333);
  });

  it("modal bukan revenue: capital injection hanya menambah cash in", () => {
    const figure = computeDayFigure(raw({ capitalIn: 500_000_000 }), config);
    expect(figure.netSales).toBe(0);
    expect(figure.cashIn).toBe(500_000_000);
    expect(figure.channels.Modal).toBe(500_000_000);
  });

  it("tidak mengakru biaya sebelum tanggal mulai bisnis", () => {
    const figure = computeDayFigure(raw({ date: "2026-08-31" }), config);
    expect(figure.operatingExpense).toBe(0);
    expect(figure.fixedCost).toBe(0);
  });
});

describe("computeBep", () => {
  it("BEP = biaya tetap ÷ contribution margin", () => {
    const figure = computeDayFigure(raw({ netSales: 2_000_000, cogs: 800_000 }), config);
    const totals = sumFigures([figure]);
    const fixedDaily = fixedCostDaily(config);
    // Payroll master 16,2jt ÷ 30 = 540rb + akru 63rb.
    expect(fixedDaily).toBe(603_000);
    const bep = computeBep({ totals, trailing: totals, fixedDaily, monthDays: 30 });
    expect(bep.available).toBe(true);
    if (!bep.available) return;
    expect(bep.contributionMarginPct).toBe(60);
    expect(bep.dailyTarget).toBe(1_005_000);
    expect(bep.periodAchievementPct).toBe(199);
    expect(bep.periodStatus).toBe("ABOVE");
  });

  it("tidak mengarang BEP bila belum ada penjualan", () => {
    const totals = sumFigures([computeDayFigure(raw({}), config)]);
    const bep = computeBep({ totals, trailing: totals, fixedDaily: 603_000, monthDays: 30 });
    expect(bep.available).toBe(false);
  });
});

describe("computePayrollRecon", () => {
  it("master 16,2jt vs input harian 450rb × 30 = selisih 2,7jt → PERLU REVIEW", () => {
    const recon = computePayrollRecon({
      config,
      monthToDate: sumFigures([]),
      monthDays: 30,
      daysElapsed: 23,
    });
    expect(recon.masterMonthly).toBe(16_200_000);
    expect(recon.projectedMonthly).toBe(13_500_000);
    expect(recon.variance).toBe(2_700_000);
    expect(recon.status).toBe("PERLU REVIEW");
  });
});

describe("computeCapitalRecovery", () => {
  it("menghitung persentase kembali modal dan estimasi payback", () => {
    const result = computeCapitalRecovery({
      capital: config.capital,
      cumulativeNetProfit: 310_000_000,
      recentNetProfits: Array(30).fill(1_000_000),
      startDate: "2026-01-01",
      todayKey: "2026-09-23",
    });
    expect(result.recoveryPct).toBe(62);
    expect(result.remaining).toBe(190_000_000);
    expect(result.estimatedPaybackMonths).toBeCloseTo(6.3, 1);
  });

  it("tanpa laba positif, estimasi payback kosong (tidak dikarang)", () => {
    const result = computeCapitalRecovery({
      capital: config.capital,
      cumulativeNetProfit: -5_000_000,
      recentNetProfits: [-100_000],
      startDate: "2026-09-01",
      todayKey: "2026-09-23",
    });
    expect(result.recoveryPct).toBe(0);
    expect(result.estimatedPaybackMonths).toBeNull();
  });
});

describe("resolvePeriod", () => {
  it("bulan ini dibandingkan dengan tanggal yang sama bulan lalu", () => {
    const period = resolvePeriod("this_month", "2026-09-23");
    expect(period.fromKey).toBe("2026-09-01");
    expect(period.prevFromKey).toBe("2026-08-01");
    expect(period.prevToKey).toBe("2026-08-23");
  });

  it("31 Maret → pembanding dibatasi akhir Februari", () => {
    const period = resolvePeriod("this_month", "2026-03-31");
    expect(period.prevToKey).toBe("2026-02-28");
  });

  it("custom tidak boleh melewati hari ini", () => {
    const period = resolvePeriod("custom", "2026-09-23", { from: "2026-09-20", to: "2026-10-05" });
    expect(period.toKey).toBe("2026-09-23");
    expect(period.days).toBe(4);
  });
});
