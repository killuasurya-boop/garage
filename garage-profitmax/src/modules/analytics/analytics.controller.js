const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const calculators = require('../../utils/calculators');
const redis = require('../../config/redis');

exports.getDashboardOverview = async (req, res, next) => {
  try {
    const cacheKey = `dashboard:overview:${new Date().toISOString().slice(0, 10)}`;
    if (redis && redis.status === 'ready') {
      const cached = await redis.get(cacheKey);
      if (cached) return res.json(JSON.parse(cached));
    }
    // In a real application, we'd query transactions for today & this month.
    // For this demonstration, we use the business config targets and placeholders.
    const config = await prisma.businessConfig.findFirst();
    
    // BEP calculation setup
    const overheads = await prisma.overheadConfig.findMany({ where: { isActive: true } });
    const fixedCost = overheads.reduce((sum, o) => sum + o.amount, 0);

    const avgSellingPrice = config.avgTicketSize;
    const avgVariableCost = avgSellingPrice * (config.hppPercentageTarget / 100);

    const bepResult = calculators.calculateBEP(fixedCost, avgSellingPrice, avgVariableCost);

    const payload = {
      revenueToday: 3750000,
      revenueThisMonth: 112500000,
      revenueLastMonth: 98000000,
      
      grossProfitToday: 3750000 * (1 - config.hppPercentageTarget / 100),
      netProfitThisMonth: 40141667, // Example static based on PRD

      totalCapital: config.totalInitialCapital,
      capitalRecovered: 80283334,
      bepProgressPercent: 40.1,
      estimatedBepDate: '2026-11-01',

      urgentPriceItems: [], // Usually fetched from Menu where margin < 30
      
      totalTransactionsToday: 87,
      avgTicketSizeToday: 28500,
      stockAlerts: [] // Ingredients below minimumStock
    };

    if (redis && redis.status === 'ready') {
      await redis.setex(cacheKey, 300, JSON.stringify(payload)); // Cache for 5 mins
    }

    res.json(payload);
  } catch (error) {
    next(error);
  }
};

exports.getBepRoi = async (req, res, next) => {
  try {
    const config = await prisma.businessConfig.findFirst();
    const overheads = await prisma.overheadConfig.findMany({ where: { isActive: true } });
    const fixedCost = overheads.reduce((sum, o) => sum + o.amount, 0);

    const avgSellingPrice = config.avgTicketSize;
    const avgVariableCost = avgSellingPrice * (config.hppPercentageTarget / 100);

    const bepResult = calculators.calculateBEP(fixedCost, avgSellingPrice, avgVariableCost);
    
    // Hardcoded static net profit for demo matching PRD
    const netProfitPerMonth = 40141667; 
    
    const roiPercentageAnnual = calculators.calculateROI(netProfitPerMonth * 12, config.totalInitialCapital);
    const bepInMonths = calculators.calculateCapitalRecovery(config.totalInitialCapital, netProfitPerMonth);

    res.json({
      bepDailyUnits: Math.ceil(bepResult.bepUnits / 30),
      bepDailyRevenue: Math.ceil(bepResult.bepRevenue / 30),
      bepMonthlyRevenue: bepResult.bepRevenue,
      
      totalInvestment: config.totalInitialCapital,
      netProfitPerMonth,
      roiPercentageAnnual,
      bepInMonths,
      
      projectedRevenue12months: config.monthlyTargetRevenue * 12,
      projectedNetProfit12months: netProfitPerMonth * 12,
      
      scenarios: [
        { visitors: 100, dailyRevenue: 2500000, monthlyNet: 22000000, bepMonths: 9.1 },
        { visitors: 150, dailyRevenue: 3750000, monthlyNet: 40141667, bepMonths: 4.98 },
        { visitors: 200, dailyRevenue: 5000000, monthlyNet: 58000000, bepMonths: 3.45 }
      ]
    });
  } catch (error) {
    next(error);
  }
};

exports.getHealth = async (req, res, next) => {
  try {
    // Placeholder based on PRD requirements
    res.json({
      indicators: [
        { name: "Revenue Harian", actual: 3200000, target: 3750000, status: "WARNING", color: "yellow" },
        { name: "Rata-rata Margin", actual: 55.2, target: 50, status: "HEALTHY", color: "green" },
        { name: "HPP Ratio", actual: 43.5, target: 45, status: "HEALTHY", color: "green" },
        { name: "Menu Rugi", actual: 1, target: 0, status: "DANGER", color: "red", detail: "Nugget Goreng" },
        { name: "Progress BEP", actual: 40.1, target: 100, status: "ON_TRACK", color: "blue" }
      ],
      overallStatus: "WARNING",
      recommendations: [
        "Segera naikkan harga Nugget Goreng",
        "Revenue hari ini di bawah target, aktifkan promo Happy Hour."
      ]
    });
  } catch (error) {
    next(error);
  }
};
