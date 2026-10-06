import { describe, expect, it } from "vitest";

import {
  DEFAULT_THRESHOLDS,
  computeBep,
  computeCapitalRecovery,
  computeDayFigure,
  computePayrollRecon,
  dayRecoveryValue,
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
    deliveryFees: 0,
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
    purchases: { bar: 0, dapur: 0, umum: 0 },
    payments: {},
    settlementFees: 0,
    capitalIn: 0,
    capitalOut: 0,
    ...partial,
  };
}

describe("computeDayFigure", () => {
  it("ongkir delivery dicatat terpisah: tidak menambah net sales / gross profit, kas tetap masuk", () => {
    const figure = computeDayFigure(
      raw({ netSales: 100_000, deliveryFees: 10_000, payments: { QRIS: 110_000 } }),
      config,
    );
    expect(figure.netSales).toBe(100_000);
    expect(figure.deliveryFees).toBe(10_000);
    expect(figure.grossSales).toBe(100_000);
    expect(figure.cashIn).toBe(110_000);
  });

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

  it("upah karyawan 'accrue': upah harian standar tanpa absensi, upah aktual bila ada (tidak dobel)", () => {
    const accrueWage = {
      ...config,
      costItems: config.costItems.map((item) => (item.code === "GAJI" ? { ...item, treatment: "accrue" as const } : item)),
    };
    // Tanpa penjualan & absensi: net profit = −(upah 450rb + akru 63rb).
    const idle = computeDayFigure(raw({}), accrueWage);
    expect(idle.payroll).toBe(450_000);
    expect(idle.operatingExpense).toBe(63_000);
    expect(idle.netProfit).toBe(-513_000);
    expect(idle.costLines["Gaji karyawan"]).toBe(450_000);
    // Rincian biaya selalu menjumlah ke net profit.
    const lineTotal = Object.values(idle.costLines).reduce((sum, value) => sum + value, 0);
    expect(idle.netSales - idle.cogs - lineTotal).toBe(idle.netProfit);

    // Absensi mencatat upah aktual 380rb + fee 12rb → aktual dipakai, bukan 450rb.
    const actual = computeDayFigure(raw({ netSales: 1_000_000, payrollWages: 380_000, payrollFee: 12_000 }), accrueWage);
    expect(actual.payroll).toBe(392_000);
    expect(actual.costLines["Gaji karyawan (absensi)"]).toBe(380_000);
    expect(actual.costLines["Gaji karyawan"]).toBeUndefined();

    // BEP tidak menghitung upah dua kali.
    expect(fixedCostDaily(accrueWage)).toBe(513_000);
    // Sebelum tanggal mulai bisnis: tidak ada upah standar.
    expect(computeDayFigure(raw({ date: "2026-08-31" }), accrueWage).payroll).toBe(0);
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
    // Upah harian dari item GAJI (450rb) + akru 63rb. Save Money tidak ikut.
    expect(fixedDaily).toBe(513_000);
    const bep = computeBep({ totals, trailing: totals, fixedDaily, monthDays: 30 });
    expect(bep.available).toBe(true);
    if (!bep.available) return;
    expect(bep.contributionMarginPct).toBe(60);
    expect(bep.dailyTarget).toBe(855_000);
    expect(bep.periodAchievementPct).toBe(233.9);
    expect(bep.periodStatus).toBe("ABOVE");
  });

  it("tanpa item GAJI, upah harian jatuh ke Payroll Master ÷ 30", () => {
    const noWage = { ...config, costItems: config.costItems.filter((item) => item.code !== "GAJI") };
    // Payroll master 16,2jt ÷ 30 = 540rb + akru 63rb.
    expect(fixedCostDaily(noWage)).toBe(603_000);
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
    expect(result.roiPct).toBeLessThan(0);
  });

  it("contoh owner: modal 500jt, kembali 100jt, laba 10jt/bulan → 20%, sisa 400jt, ± 40 bulan, ROI 20%", () => {
    const result = computeCapitalRecovery({
      capital: [{ date: "2026-01-01", type: "injection", amount: 500_000_000 }],
      cumulativeNetProfit: 100_000_000,
      recentNetProfits: Array(30).fill(10_000_000 / 30),
      startDate: "2026-01-01",
      todayKey: "2026-10-01",
      method: "net_profit",
    });
    expect(result.recoveryPct).toBe(20);
    expect(result.remaining).toBe(400_000_000);
    expect(result.roiPct).toBe(20);
    expect(result.avgMonthlyNetProfit).toBeCloseTo(10_000_000, -2);
    expect(result.estimatedPaybackMonths).toBeCloseTo(40, 0);
    expect(result.methodLabel).toBe("Laba bersih");
  });
});

describe("dayRecoveryValue (metode balik modal)", () => {
  const day = {
    date: "2026-10-01",
    netProfit: 500_000,
    reserveAllocation: 100_000,
    cashIn: 3_000_000 + 10_000_000, // penjualan + setoran modal
    cashOut: 2_000_000 + 1_000_000, // operasional + penarikan modal
    channels: { Cash: 3_000_000, Modal: 10_000_000 },
  };
  const withdrawals = new Map([["2026-10-01", 1_000_000]]);

  it("laba bersih = net profit apa adanya", () => {
    expect(dayRecoveryValue(day, "net_profit", withdrawals)).toBe(500_000);
  });

  it("laba bersih setelah Save Money dikurangi cadangan", () => {
    expect(dayRecoveryValue(day, "net_profit_after_reserve", withdrawals)).toBe(400_000);
  });

  it("cashflow operasional tidak menghitung modal masuk/keluar", () => {
    expect(dayRecoveryValue(day, "operating_cashflow", withdrawals)).toBe(1_000_000);
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

describe("Konsep owner: Omzet − Biaya tetap − Belanja bahan gudang = Profit bersih", () => {
  const owner: FinanceConfig = {
    ...config,
    cogsBasis: "purchase",
    categories: [
      ...config.categories,
      { name: "COGS", groupKey: "cogs_purchase", costClass: "variable", costItemCode: null },
      { name: "Belanja Bar", groupKey: "cogs_purchase", costClass: "variable", costItemCode: null },
      { name: "Belanja Umum", groupKey: "cogs_purchase", costClass: "variable", costItemCode: null },
    ],
    costItems: config.costItems.map((item) => (item.code === "GAJI" ? { ...item, treatment: "accrue" as const } : item)),
  };

  it("belanja Bar/Dapur/Umum = biaya bahan; HPP resep & susut hanya info", () => {
    const figure = computeDayFigure(
      raw({
        netSales: 3_000_000,
        cogs: 900_000,
        shrinkage: 40_000,
        purchases: { bar: 600_000, dapur: 400_000, umum: 50_000 },
        expenses: { "Belanja Bar": 600_000, "Belanja Dapur": 400_000, "Belanja Umum": 50_000 },
      }),
      owner,
    );
    expect(figure.cogs).toBe(1_050_000);
    expect(figure.purchaseBar).toBe(600_000);
    expect(figure.purchaseDapur).toBe(400_000);
    expect(figure.cogsRecipe).toBe(900_000);
    // 3jt − belanja 1,05jt − upah 450rb − akru 63rb.
    expect(figure.netProfit).toBe(3_000_000 - 1_050_000 - 450_000 - 63_000);
    // Uang belanja tetap tercatat keluar kas (bukan dobel di laba).
    expect(figure.cashOut).toBe(1_050_000);
  });

  it("bayar hutang lama / expense Belanja manual tanpa penerimaan gudang tidak mengurangi profit", () => {
    const base = computeDayFigure(raw({ netSales: 1_000_000 }), owner);
    const paid = computeDayFigure(raw({ netSales: 1_000_000, expenses: { "Belanja Dapur": 750_000, COGS: 300_000 } }), owner);
    expect(paid.netProfit).toBe(base.netProfit);
    expect(paid.cashOut).toBe(1_050_000);
  });

  it("belanja sebelum tanggal mulai usaha = stok awal (modal), bukan biaya", () => {
    const figure = computeDayFigure(raw({ date: "2026-08-31", purchases: { bar: 5_000_000, dapur: 0, umum: 0 } }), owner);
    expect(figure.cogs).toBe(0);
    expect(figure.purchaseBar).toBe(0);
    expect(figure.netProfit).toBe(0);
  });

  it("BEP mode belanja memakai margin 30 hari terakhir", () => {
    const bigBuyDay = sumFigures([computeDayFigure(raw({ netSales: 500_000, purchases: { bar: 2_000_000, dapur: 0, umum: 0 } }), owner)]);
    const trailing = sumFigures([computeDayFigure(raw({ netSales: 10_000_000, purchases: { bar: 3_000_000, dapur: 0, umum: 0 } }), owner)]);
    const bep = computeBep({ totals: bigBuyDay, trailing, fixedDaily: 513_000, monthDays: 30, preferTrailing: true });
    expect(bep.available).toBe(true);
    if (bep.available) expect(bep.cmSource).toBe("trailing_30d");
  });

  it("target profit bersih jadi patokan balik modal", () => {
    const result = computeCapitalRecovery({
      capital: [{ date: "2026-10-01", type: "injection", amount: 300_000_000 }],
      cumulativeNetProfit: 12_000_000,
      recentNetProfits: [400_000],
      startDate: "2026-10-01",
      todayKey: "2026-10-10",
      targetMonthly: 24_000_000,
      monthToDateActual: 6_000_000,
      activeDaysInMonth: 10,
      monthDays: 31,
      openingStockPurchases: 8_000_000,
    });
    expect(result.target).not.toBeNull();
    const target = result.target!;
    // Sisa 288jt ÷ 24jt/bulan = 12 bulan.
    expect(target.paybackMonths).toBe(12);
    expect(target.monthToDateTarget).toBe(Math.round((24_000_000 / 31) * 10));
    expect(target.status).toBe("BELOW");
    expect(result.openingStockPurchases).toBe(8_000_000);
    // Tanpa target → null.
    expect(computeCapitalRecovery({ capital: [], cumulativeNetProfit: 0, recentNetProfits: [], startDate: "2026-10-01", todayKey: "2026-10-01" }).target).toBeNull();
  });
});
