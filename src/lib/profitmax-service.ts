import { randomUUID } from "node:crypto";

import { and, eq, gte, lt, sql } from "drizzle-orm";

import { getDb } from "@/db";
import {
  inventoryItems,
  menuItems,
  menuVariants,
  orders,
  approvals,
  appSettings,
  staffPayrolls,
  staffProfiles,
  staffSalaries,
  user,
} from "@/db/schema";
import { jakartaDayRange } from "@/lib/attendance";
import {
  calculateBundleMargin,
  calculateProfitMaxPayroll,
  enrichProfitMaxMenu,
  profitMaxActions,
  profitMaxBundles,
  profitMaxEmployees,
  profitMaxHealthIndicators,
  profitMaxIngredients,
  profitMaxMenus,
  profitMaxMetrics,
  profitMaxOverheads,
  profitMaxOverview,
  profitMaxRecipes,
  profitMaxScenarios,
} from "@/components/ceo/data/profitMaxData";
import type { GarageSession } from "@/lib/server-auth";

const profitMaxSavedCalculationsKey = "profitmax.savedCalculations";

export type ProfitMaxSavedCalculation = {
  id: string;
  type: "hpp" | "roi" | "promo" | "bundling" | "overhead";
  title: string;
  input: Record<string, unknown>;
  result: Record<string, unknown>;
  createdBy: string;
  createdByName: string;
  createdAt: string;
};

function isSavedCalculationList(value: unknown): value is ProfitMaxSavedCalculation[] {
  return Array.isArray(value);
}

type DbMenuRow = {
  code: string;
  name: string;
  category: string;
  hpp: number;
  price: number;
  status: "OK" | "NAIK" | "BARU" | "RUGI";
};

function marginStatus(price: number, hpp: number): DbMenuRow["status"] {
  const profit = price - hpp;
  const margin = price > 0 ? (profit / price) * 100 : 0;
  if (profit < 0 || margin < 0) return "RUGI";
  if (margin < 30) return "RUGI";
  if (margin < 45) return "NAIK";
  return "OK";
}

function stripMetricIcon(metric: (typeof profitMaxMetrics)[number]) {
  const { icon: _icon, ...serializable } = metric;
  return serializable;
}

function safeAverage(values: number[]) {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

async function getDbProfitMaxMenu() {
  try {
    const db = getDb();
    const rows = await db
      .select({
        itemId: menuItems.id,
        name: menuItems.name,
        category: menuItems.category,
        variantLabel: menuVariants.label,
        price: menuVariants.price,
        hpp: menuVariants.baseCost,
      })
      .from(menuVariants)
      .innerJoin(menuItems, sql`${menuItems.id} = ${menuVariants.itemId}`)
      .limit(80);

    const mapped: DbMenuRow[] = rows
      .filter((row) => Number(row.price) > 0)
      .map((row) => ({
        code: `${row.itemId}:${row.variantLabel}`,
        name: row.variantLabel && row.variantLabel !== "Default" ? `${row.name} (${row.variantLabel})` : row.name,
        category: row.category,
        hpp: Number(row.hpp ?? 0),
        price: Number(row.price ?? 0),
        status: marginStatus(Number(row.price ?? 0), Number(row.hpp ?? 0)),
      }));

    return mapped.length > 0 ? mapped : null;
  } catch (error) {
    console.warn("[profitmax] DB menu fallback:", error instanceof Error ? error.message : error);
    return null;
  }
}

async function getDbIngredients() {
  try {
    const db = getDb();
    const rows = await db
      .select({
        code: inventoryItems.sku,
        name: inventoryItems.name,
        unit: inventoryItems.unit,
        buyUnit: inventoryItems.packageSize,
        buyPrice: inventoryItems.unitCost,
        pricePerUnit: inventoryItems.unitCost,
        category: inventoryItems.category,
        stock: inventoryItems.onHand,
        minimumStock: inventoryItems.min,
      })
      .from(inventoryItems)
      .limit(80);

    return rows.length > 0
      ? rows.map((row) => ({
          ...row,
          buyPrice: Number(row.buyPrice ?? 0),
          pricePerUnit: Number(row.pricePerUnit ?? 0),
          stock: Number(row.stock ?? 0),
          minimumStock: Number(row.minimumStock ?? 0),
        }))
      : null;
  } catch (error) {
    console.warn("[profitmax] DB ingredient fallback:", error instanceof Error ? error.message : error);
    return null;
  }
}

async function getDbPayroll() {
  try {
    const db = getDb();
    const rows = await db
      .select({
        id: staffProfiles.id,
        name: user.name,
        position: staffProfiles.position,
        role: staffProfiles.role,
        baseSalary: staffSalaries.baseSalary,
        allowance: staffSalaries.allowance,
        payrollNetSalary: staffPayrolls.netSalary,
        payrollDeduction: staffPayrolls.deduction,
      })
      .from(staffProfiles)
      .innerJoin(user, sql`${user.id} = ${staffProfiles.userId}`)
      .leftJoin(staffSalaries, sql`${staffSalaries.staffId} = ${staffProfiles.id}`)
      .leftJoin(staffPayrolls, sql`${staffPayrolls.staffId} = ${staffProfiles.id}`)
      .where(sql`${staffProfiles.status} = 'active'`)
      .limit(20);

    const mapped = rows
      .filter((row) => Number(row.baseSalary ?? row.payrollNetSalary ?? 0) > 0)
      .map((row) => {
        const baseSalary = Number(row.baseSalary ?? row.payrollNetSalary ?? 0);
        const allowance = Number(row.allowance ?? 0);
        const deduction = Number(row.payrollDeduction ?? 0);
        return calculateProfitMaxPayroll({
          id: String(row.id),
          name: row.name,
          position: row.position ?? row.role,
          baseSalary,
          allowance,
          deduction,
        });
      });

    return mapped.length > 0 ? mapped : null;
  } catch (error) {
    console.warn("[profitmax] DB payroll fallback:", error instanceof Error ? error.message : error);
    return null;
  }
}

async function getDbTodayRevenue() {
  try {
    const db = getDb();
    const { start, end } = jakartaDayRange();
    const [row] = await db
      .select({ total: sql<number>`COALESCE(SUM(${orders.total}), 0)` })
      .from(orders)
      .where(and(gte(orders.createdAt, start), lt(orders.createdAt, end), sql`${orders.status} != 'void'`));
    return Number(row?.total ?? 0);
  } catch (error) {
    console.warn("[profitmax] DB revenue fallback:", error instanceof Error ? error.message : error);
    return 0;
  }
}

export async function getProfitMaxDashboardData() {
  const [dbMenu, dbIngredients, dbPayroll, todayRevenue] = await Promise.all([
    getDbProfitMaxMenu(),
    getDbIngredients(),
    getDbPayroll(),
    getDbTodayRevenue(),
  ]);

  const menuSource = dbMenu ?? profitMaxMenus;
  const menuRows = menuSource.map((menu) => {
    const maybeHandoff = menu as Partial<(typeof profitMaxMenus)[number]>;
    return enrichProfitMaxMenu({
      ...menu,
      estimatedDailySales: typeof maybeHandoff.estimatedDailySales === "number" ? maybeHandoff.estimatedDailySales : 0,
      note: typeof maybeHandoff.note === "string" ? maybeHandoff.note : "Dibaca dari menu database GARAGE.",
    });
  });
  const criticalMenus = menuRows.filter((menu) => menu.margin < 30 || menu.status === "RUGI");
  const healthyMenus = menuRows.filter((menu) => menu.margin >= 45);
  const averageMargin = safeAverage(menuRows.map((menu) => menu.margin));
  const totalPayroll = (dbPayroll ?? profitMaxEmployees.map(calculateProfitMaxPayroll)).reduce(
    (sum, employee) => sum + employee.totalSalary,
    0,
  );
  const totalOverhead = profitMaxOverheads.reduce((sum, overhead) => sum + overhead.amount, 0);
  const liveRevenue = todayRevenue > 0 ? todayRevenue : profitMaxOverview.dashboardDailyRevenue;

  const overview = {
    ...profitMaxOverview,
    dashboardDailyRevenue: liveRevenue,
    menuSkuCount: menuRows.length,
    healthyMenuCount: healthyMenus.length,
    criticalMenuCount: criticalMenus.length,
    averageMargin: Number(averageMargin.toFixed(1)),
    totalPayroll,
    totalOverhead,
  };

  return {
    generatedAt: new Date().toISOString(),
    dataSource: {
      menu: dbMenu ? "garage-db" : "handoff",
      ingredients: dbIngredients ? "garage-db" : "handoff",
      payroll: dbPayroll ? "garage-db" : "handoff",
      revenue: todayRevenue > 0 ? "garage-db" : "handoff",
    },
    overview,
    metrics: profitMaxMetrics.map(stripMetricIcon),
    menuRows,
    ingredients: dbIngredients ?? profitMaxIngredients,
    recipes: profitMaxRecipes,
    employees: dbPayroll ?? profitMaxEmployees.map(calculateProfitMaxPayroll),
    overheads: profitMaxOverheads,
    bundles: profitMaxBundles.map(calculateBundleMargin),
    scenarios: profitMaxScenarios,
    healthIndicators: profitMaxHealthIndicators,
    actions: profitMaxActions.map(({ icon: _icon, ...action }) => action),
  };
}

export async function createProfitMaxApproval(
  input: {
    actionType: "price_change" | "promo_guard" | "bundle_review" | "overhead_review" | "recipe_hpp";
    title: string;
    amount: string;
    reason: string;
    risk: "low" | "medium" | "high";
    payload?: Record<string, unknown>;
  },
  garage: GarageSession,
) {
  const approvalId = `APP-PMAX-${randomUUID()}`;
  const actor = `${garage.user.name} / ${garage.profile.role}`;
  const reason = [
    input.reason.trim(),
    `action=${input.actionType}`,
    input.payload ? `payload=${JSON.stringify(input.payload).slice(0, 900)}` : null,
  ]
    .filter(Boolean)
    .join(" | ");

  const [approval] = await getDb()
    .insert(approvals)
    .values({
      id: approvalId,
      type: `ProfitMax: ${input.title.trim()}`,
      requester: actor,
      requesterPhone: null,
      amount: input.amount.trim(),
      reason,
      risk: input.risk,
      age: "baru saja",
      status: "pending",
    })
    .returning();

  return {
    id: approval.id,
    type: approval.type,
    status: approval.status,
    risk: approval.risk,
    amount: approval.amount,
    reason: approval.reason,
    createdAt: approval.createdAt.toISOString(),
  };
}

export async function listProfitMaxSavedCalculations(garage: GarageSession) {
  const [row] = await getDb()
    .select({ valueJson: appSettings.valueJson })
    .from(appSettings)
    .where(
      and(
        eq(appSettings.outletId, garage.profile.outlet.id),
        eq(appSettings.key, profitMaxSavedCalculationsKey),
      ),
    )
    .limit(1);
  return isSavedCalculationList(row?.valueJson) ? row.valueJson : [];
}

export async function saveProfitMaxCalculation(
  input: {
    type: ProfitMaxSavedCalculation["type"];
    title: string;
    input: Record<string, unknown>;
    result: Record<string, unknown>;
  },
  garage: GarageSession,
) {
  const current = await listProfitMaxSavedCalculations(garage);
  const saved: ProfitMaxSavedCalculation = {
    id: `PMAX-CALC-${randomUUID()}`,
    type: input.type,
    title: input.title.trim(),
    input: input.input,
    result: input.result,
    createdBy: garage.user.id,
    createdByName: garage.user.name,
    createdAt: new Date().toISOString(),
  };
  const next = [saved, ...current].slice(0, 50);

  await getDb()
    .insert(appSettings)
    .values({
      outletId: garage.profile.outlet.id,
      key: profitMaxSavedCalculationsKey,
      valueJson: next,
      updatedBy: garage.user.id,
    })
    .onConflictDoUpdate({
      target: [appSettings.outletId, appSettings.key],
      set: {
        valueJson: next,
        updatedBy: garage.user.id,
        updatedAt: new Date(),
      },
    });

  return saved;
}
