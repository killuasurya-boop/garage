// Garage Financial Control — Fase 5 Intelligence (server): product
// profitability, forecast, What-If, CEO brief. Membaca data aktual; hasil
// proyeksi tidak pernah ditulis ke tabel transaksi.
import { and, desc, eq, gte, lt, sql } from "drizzle-orm";

import { getDb } from "@/db";
import { financeScenarios, inventoryItems, menuRecipes, orderItems, orders } from "@/db/schema";
import {
  BEP_STATUS_LABEL,
  addDays,
  eachDay,
  fixedCostDaily,
  jakartaDateKey,
  jakartaDayStart,
  longDayLabel,
  resolvePeriod,
  sumFigures,
  type PeriodKey,
} from "@/lib/finance-control-core";
import { getDayFigures, getFinanceControlDashboard, loadFinanceConfig } from "@/lib/finance-control";
import {
  baseScenarioLines,
  buildCeoBrief,
  computeForecast,
  computeScenario,
  type ScenarioInput,
} from "@/lib/finance-intelligence-core";
import type { GarageSession } from "@/lib/server-auth";
import { loadBusinessDayPolicy } from "@/lib/business-date-policy";

// ─── Product profitability (PRD §39) ────────────────────────────────────────

export async function getProductProfitability(fromKey: string, toKey: string) {
  const db = getDb();
  const policy = await loadBusinessDayPolicy(db);
  const start = jakartaDayStart(fromKey, policy);
  const end = jakartaDayStart(addDays(toKey, 1), policy);

  const [salesRows, recipeRows] = await Promise.all([
    db
      .select({
        menuItemId: orderItems.menuItemId,
        variantId: orderItems.variantId,
        itemName: orderItems.itemName,
        variantLabel: orderItems.variantLabel,
        qty: sql<number>`coalesce(sum(${orderItems.qty}), 0)::int`,
        revenue: sql<string>`coalesce(sum(${orderItems.lineTotal}), 0)::bigint`,
      })
      .from(orderItems)
      .innerJoin(orders, eq(orderItems.orderId, orders.id))
      .where(and(eq(orders.status, "paid"), gte(orders.createdAt, start), lt(orders.createdAt, end)))
      .groupBy(orderItems.menuItemId, orderItems.variantId, orderItems.itemName, orderItems.variantLabel),
    db
      .select({
        menuItemId: menuRecipes.menuItemId,
        variantId: menuRecipes.variantId,
        cost: sql<string>`coalesce(sum(${menuRecipes.qty} * coalesce(${inventoryItems.unitCost}, 0) * (1 + greatest(${menuRecipes.wastePct}, 0) / 100.0)), 0)::float8`,
        pricedLines: sql<number>`count(*) filter (where ${inventoryItems.unitCost} > 0)::int`,
      })
      .from(menuRecipes)
      .leftJoin(inventoryItems, eq(menuRecipes.inventorySku, inventoryItems.sku))
      .where(eq(menuRecipes.status, "active"))
      .groupBy(menuRecipes.menuItemId, menuRecipes.variantId),
  ]);

  // Biaya resep per porsi: baris varian spesifik + baris "all" (sama dgn engine HPP).
  const recipe = new Map(recipeRows.map((row) => [`${row.menuItemId}::${row.variantId}`, row]));
  const rows = salesRows
    .filter((row) => row.qty > 0)
    .map((row) => {
      const specific = recipe.get(`${row.menuItemId}::${row.variantId}`);
      const general = recipe.get(`${row.menuItemId}::all`);
      const unitCost = Math.round(Number(specific?.cost ?? 0) + Number(general?.cost ?? 0));
      const hasRecipe = Number(specific?.pricedLines ?? 0) + Number(general?.pricedLines ?? 0) > 0;
      const revenue = Number(row.revenue);
      const avgPrice = Math.round(revenue / row.qty);
      const hpp = unitCost * row.qty;
      const contribution = revenue - hpp;
      return {
        key: `${row.menuItemId ?? row.itemName}::${row.variantId}`,
        name:
          row.variantLabel && !["", "-", "reguler", "regular", "default", "standar"].includes(row.variantLabel.trim().toLowerCase())
            ? `${row.itemName} · ${row.variantLabel}`
            : row.itemName,
        sellingPrice: avgPrice,
        unitHpp: hasRecipe ? unitCost : null,
        grossProfitPerUnit: hasRecipe ? avgPrice - unitCost : null,
        marginPct: hasRecipe && avgPrice > 0 ? Math.round(((avgPrice - unitCost) / avgPrice) * 1000) / 10 : null,
        qty: row.qty,
        revenue,
        hpp: hasRecipe ? hpp : null,
        contribution: hasRecipe ? contribution : null,
        hasRecipe,
      };
    })
    .sort((a, b) => (b.contribution ?? -Infinity) - (a.contribution ?? -Infinity) || b.revenue - a.revenue);

  const measured = rows.filter((row) => row.hasRecipe);
  return {
    rows,
    totals: {
      revenue: rows.reduce((sum, row) => sum + row.revenue, 0),
      contribution: measured.reduce((sum, row) => sum + (row.contribution ?? 0), 0),
      qty: rows.reduce((sum, row) => sum + row.qty, 0),
      withoutRecipe: rows.length - measured.length,
    },
  };
}

// ─── Forecast (PRD §56) ─────────────────────────────────────────────────────

export async function getFinanceForecast(input: { horizon: number; growthPct?: number | null }) {
  const config = await loadFinanceConfig();
  const todayKey = jakartaDateKey(new Date(), config.businessDay);
  const from = addDays(todayKey, -59);
  const loadFrom = config.businessStartDate < from ? config.businessStartDate : from;
  const figures = await getDayFigures(loadFrom, todayKey, config, todayKey);
  const recentFrom = addDays(todayKey, -29);
  const recent = figures.filter((f) => f.date >= recentFrom);
  const previous = figures.filter((f) => f.date >= from && f.date < recentFrom);
  const recovered = figures.filter((f) => f.date >= config.businessStartDate).reduce((s, f) => s + f.netProfit, 0);

  return computeForecast({
    base: {
      recent: sumFigures(recent),
      previous: sumFigures(previous),
      activeDays: recent.filter((f) => f.netSales > 0).length,
      previousActiveDays: previous.filter((f) => f.netSales > 0).length,
      fixedCostDaily: fixedCostDaily(config),
      capitalInitial: config.capital.filter((tx) => tx.type === "injection").reduce((s, tx) => s + tx.amount, 0),
      capitalRecovered: recovered,
    },
    horizon: input.horizon,
    todayKey,
    growthOverridePct: input.growthPct,
  });
}

// ─── What-If (PRD §38) ──────────────────────────────────────────────────────

export async function getScenarioBase(period: PeriodKey = "this_month") {
  const config = await loadFinanceConfig();
  const todayKey = jakartaDateKey(new Date(), config.businessDay);
  const resolved =
    period === "custom" ? resolvePeriod("7d", todayKey) : resolvePeriod(period, todayKey);
  const figures = await getDayFigures(resolved.fromKey, resolved.toKey, config, todayKey);
  return { period: resolved, lines: baseScenarioLines(sumFigures(figures)) };
}

export async function runScenario(input: { period: PeriodKey; params: ScenarioInput }) {
  const base = await getScenarioBase(input.period);
  return { period: base.period, ...computeScenario(base.lines, input.params) };
}

export async function saveScenario(
  input: { name: string; period: PeriodKey; params: ScenarioInput },
  garage: GarageSession,
) {
  const result = await runScenario(input);
  const [row] = await getDb()
    .insert(financeScenarios)
    .values({
      name: input.name,
      params: { period: input.period, ...input.params },
      result: result as unknown as Record<string, unknown>,
      createdBy: garage.user.id,
      createdByName: garage.user.name,
    })
    .returning();
  return { id: row.id, name: row.name, createdAt: row.createdAt.toISOString(), result };
}

export async function listScenarios(limit = 12) {
  const rows = await getDb().select().from(financeScenarios).orderBy(desc(financeScenarios.createdAt)).limit(limit);
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    params: row.params,
    createdByName: row.createdByName,
    createdAt: row.createdAt.toISOString(),
    netProfit: Number((row.result as { projected?: { netProfit?: number } }).projected?.netProfit ?? 0),
    revenue: Number((row.result as { projected?: { revenue?: number } }).projected?.revenue ?? 0),
  }));
}

export async function deleteScenario(id: string) {
  await getDb().delete(financeScenarios).where(eq(financeScenarios.id, id));
}

// ─── CEO brief (PRD §57) ────────────────────────────────────────────────────

export async function getCeoBrief() {
  const [today, month] = await Promise.all([
    getFinanceControlDashboard({ period: "today" }),
    getFinanceControlDashboard({ period: "this_month" }),
  ]);
  const products = await getProductProfitability(month.period.fromKey, month.period.toKey);
  const top = products.rows.find((row) => row.contribution !== null);
  const attention =
    today.alerts.find((alert) => alert.level === "critical") ??
    today.alerts.find((alert) => alert.level === "watch") ??
    null;

  return buildCeoBrief({
    dateLabel: longDayLabel(today.todayKey),
    revenueToday: today.kpis.revenue.value,
    revenueChangePct: today.kpis.revenue.changePct,
    netProfitToday: today.kpis.netProfit.value,
    netProfitMonth: month.kpis.netProfit.value,
    bepPct: today.todayBep.available ? today.todayBep.periodAchievementPct : null,
    bepStatusLabel: today.todayBep.available ? BEP_STATUS_LABEL[today.todayBep.periodStatus] : null,
    cashflowNetMonth: month.cashflow.operatingNet,
    cashStatus:
      today.kpis.cash.status === "BELUM DISET"
        ? "saldo awal belum diisi"
        : `${today.kpis.cash.status}${today.kpis.cash.runwayDays !== null ? ` (±${today.kpis.cash.runwayDays} hari biaya)` : ""}`,
    recoveryPct: today.capital.recoveryPct,
    paybackMonths: today.capital.estimatedPaybackMonths,
    healthLevel: today.health.level,
    mainAttention: attention?.message ?? null,
    topProduct: top ? { name: top.name, contribution: top.contribution ?? 0 } : null,
  });
}

// ─── AI Financial Assistant (PRD §60 Fase 5) ────────────────────────────────

/**
 * Ringkasan ringkas Financial Control untuk konteks GARAGE AI. Hanya angka dari
 * engine (aktual) + forecast berlabel PROYEKSI. Gagal → null (AI tetap jalan).
 */
export async function getFinanceControlAiSummary() {
  try {
    const [today, month, forecast] = await Promise.all([
      getFinanceControlDashboard({ period: "today" }),
      getFinanceControlDashboard({ period: "this_month" }),
      getFinanceForecast({ horizon: 3 }),
    ]);
    const products = await getProductProfitability(month.period.fromKey, month.period.toKey);
    const bep = (b: typeof today.bep) =>
      b.available
        ? { target: b.periodTarget, actual: b.periodActual, achievementPct: b.periodAchievementPct, status: BEP_STATUS_LABEL[b.periodStatus] }
        : { unavailable: b.reason };

    return {
      answerRules: [
        "Jawab pertanyaan CEO (omzet, laba sebenarnya, BEP, biaya terbesar, cashflow, modal kembali, estimasi balik modal) dari data ini.",
        "Bedakan tegas AKTUAL vs PROYEKSI. Forecast & estimasi payback selalu disebut proyeksi.",
        "Jangan mengarang angka. Bila datanya null/unavailable, katakan belum tersedia dan sebutkan penyebabnya.",
        "Modal bukan revenue; Save Money = cadangan, bukan expense; HPP dari resep, belanja bahan hanya cashflow.",
        "Revenue = net sales (tanpa pajak). Rupiah ditulis format Indonesia, mis. Rp2.850.000.",
      ],
      today: {
        date: today.todayKey,
        revenue: today.kpis.revenue.value,
        revenueChangeVsYesterdayPct: today.kpis.revenue.changePct,
        netProfit: today.kpis.netProfit.value,
        hpp: today.pnl.cogs,
        bep: bep(today.todayBep),
      },
      monthToDate: {
        label: month.period.label,
        revenue: month.pnl.netSales,
        grossProfit: month.pnl.grossProfit,
        payroll: month.pnl.payroll,
        operatingExpense: month.pnl.operatingExpense,
        netProfit: month.pnl.netProfit,
        netMarginPct: month.pnl.netMarginPct,
        revenueChangeVsLastMonthPct: month.kpis.revenue.changePct,
        bep: bep(month.bep),
        biggestCosts: month.expenses.lines.slice(0, 5),
        budgets: month.expenses.budgets,
        cashflowOperational: month.cashflow.operatingNet,
        capitalInjectedThisMonth: month.cashflow.capitalIn,
        channels: month.channels,
      },
      cash: {
        current: today.kpis.cash.current,
        status: today.kpis.cash.status,
        runwayDays: today.kpis.cash.runwayDays,
        openingCashSet: today.dataQuality.openingCashSet,
      },
      capitalRecovery: today.capital,
      health: today.health,
      insights: today.insights,
      alerts: today.alerts,
      payrollReconciliation: today.payrollRecon,
      closing: today.closing,
      dataQuality: today.dataQuality,
      topProducts: products.rows
        .filter((row) => row.contribution !== null)
        .slice(0, 5)
        .map((row) => ({ name: row.name, qty: row.qty, marginPct: row.marginPct, contribution: row.contribution })),
      productsWithoutRecipe: products.rows.filter((row) => !row.hasRecipe).map((row) => row.name).slice(0, 10),
      forecast: {
        label: forecast.label,
        reliable: forecast.reliable,
        notes: forecast.notes,
        assumptions: forecast.assumptions,
        months: forecast.months.map((m) => ({ label: m.label, revenue: m.revenue, netProfit: m.netProfit, recoveryPct: m.recoveryPct })),
      },
      pages: {
        dashboard: "/control/financial",
        closing: "/control/financial/closing",
        intelligence: "/control/financial/intelligence",
        settings: "/control/financial/settings",
      },
    };
  } catch (error) {
    console.error("[finance-control/ai-summary]", error);
    return null;
  }
}

// ─── Paket halaman Intelligence ─────────────────────────────────────────────

export async function getFinanceIntelligence(input: { period: PeriodKey; from?: string | null; to?: string | null; horizon: number }) {
  const todayKey = jakartaDateKey(new Date(), await loadBusinessDayPolicy());
  const period = resolvePeriod(input.period, todayKey, { from: input.from, to: input.to });
  const [products, forecast, brief, scenarioBase, scenarios] = await Promise.all([
    getProductProfitability(period.fromKey, period.toKey),
    getFinanceForecast({ horizon: input.horizon }),
    getCeoBrief(),
    getScenarioBase(input.period === "today" || input.period === "custom" ? "7d" : input.period),
    listScenarios(),
  ]);
  return { generatedAt: new Date().toISOString(), period, days: eachDay(period.fromKey, period.toKey).length, products, forecast, brief, scenarioBase, scenarios };
}

export type FinanceIntelligence = Awaited<ReturnType<typeof getFinanceIntelligence>>;
