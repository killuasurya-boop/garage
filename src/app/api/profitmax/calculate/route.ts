import { z } from "zod";

import { fail, ok, readJson } from "@/lib/api-response";
import { requirePermission } from "@/lib/server-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ingredientSchema = z.object({
  name: z.string().min(1),
  qty: z.number().nonnegative(),
  pricePerUnit: z.number().nonnegative(),
});

const payloadSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("hpp"),
    sellingPrice: z.number().positive(),
    targetMarginPercent: z.number().min(1).max(95).default(50),
    ingredients: z.array(ingredientSchema).min(1),
    packagingCost: z.number().nonnegative().default(0),
    utilityCost: z.number().nonnegative().default(0),
    extraCost: z.number().nonnegative().default(0),
  }),
  z.object({
    type: z.literal("roi"),
    capital: z.number().positive(),
    dailyRevenue: z.number().nonnegative(),
    hppPercent: z.number().min(0).max(100),
    fixedCostMonthly: z.number().nonnegative(),
  }),
  z.object({
    type: z.literal("promo"),
    sellingPrice: z.number().positive(),
    hpp: z.number().nonnegative(),
    discountPercent: z.number().min(0).max(100),
    estimatedSales: z.number().int().nonnegative().default(0),
  }),
  z.object({
    type: z.literal("bundling"),
    normalPrice: z.number().positive(),
    bundlePrice: z.number().positive(),
    totalHpp: z.number().nonnegative(),
  }),
  z.object({
    type: z.literal("overhead"),
    monthlyOverhead: z.number().nonnegative(),
    targetTransactions: z.number().positive(),
  }),
]);

function roundCurrency(value: number) {
  return Math.round(value);
}

function marginStatus(marginPercent: number, profit: number) {
  if (profit < 0 || marginPercent < 0) return "RUGI";
  if (marginPercent < 30) return "DANGER";
  if (marginPercent < 45) return "WARNING";
  return "HEALTHY";
}

function suggestSellingPrice(hpp: number, targetMarginPercent: number) {
  return Math.ceil(hpp / (1 - targetMarginPercent / 100) / 500) * 500;
}

export async function POST(request: Request) {
  const session = await requirePermission("dashboard:read");
  if (session.response) return session.response;

  const { data, error } = await readJson(request, payloadSchema);
  if (error) return error;
  if (!data) return fail(400, "INVALID_PAYLOAD", "Payload ProfitMax tidak valid");

  if (data.type === "hpp") {
    const materialCost = data.ingredients.reduce((sum, ingredient) => sum + ingredient.qty * ingredient.pricePerUnit, 0);
    const totalHpp = materialCost + data.packagingCost + data.utilityCost + data.extraCost;
    const profit = data.sellingPrice - totalHpp;
    const marginPercent = (profit / data.sellingPrice) * 100;
    const markupPercent = totalHpp > 0 ? (profit / totalHpp) * 100 : 0;
    return ok({
      type: data.type,
      materialCost: roundCurrency(materialCost),
      totalHpp: roundCurrency(totalHpp),
      profit: roundCurrency(profit),
      marginPercent: Number(marginPercent.toFixed(2)),
      markupPercent: Number(markupPercent.toFixed(2)),
      status: marginStatus(marginPercent, profit),
      recommendedPrice: suggestSellingPrice(totalHpp, data.targetMarginPercent),
    });
  }

  if (data.type === "roi") {
    const monthlyRevenue = data.dailyRevenue * 30;
    const monthlyHpp = monthlyRevenue * (data.hppPercent / 100);
    const grossProfit = monthlyRevenue - monthlyHpp;
    const netProfit = grossProfit - data.fixedCostMonthly;
    return ok({
      type: data.type,
      monthlyRevenue: roundCurrency(monthlyRevenue),
      monthlyHpp: roundCurrency(monthlyHpp),
      grossProfit: roundCurrency(grossProfit),
      netProfit: roundCurrency(netProfit),
      bepMonths: netProfit > 0 ? Number((data.capital / netProfit).toFixed(2)) : null,
      roiAnnualPercent: data.capital > 0 ? Number((((netProfit * 12) / data.capital) * 100).toFixed(2)) : 0,
    });
  }

  if (data.type === "promo") {
    const promoPrice = data.sellingPrice * (1 - data.discountPercent / 100);
    const profitAfterPromo = promoPrice - data.hpp;
    const marginAfterPromo = promoPrice > 0 ? (profitAfterPromo / promoPrice) * 100 : 0;
    return ok({
      type: data.type,
      promoPrice: roundCurrency(promoPrice),
      profitAfterPromo: roundCurrency(profitAfterPromo),
      marginAfterPromo: Number(marginAfterPromo.toFixed(2)),
      revenueLoss: roundCurrency((data.sellingPrice - promoPrice) * data.estimatedSales),
      status: marginStatus(marginAfterPromo, profitAfterPromo),
    });
  }

  if (data.type === "bundling") {
    const discountValue = data.normalPrice - data.bundlePrice;
    const profit = data.bundlePrice - data.totalHpp;
    const marginPercent = data.bundlePrice > 0 ? (profit / data.bundlePrice) * 100 : 0;
    return ok({
      type: data.type,
      discountValue: roundCurrency(discountValue),
      discountPercent: Number(((discountValue / data.normalPrice) * 100).toFixed(2)),
      profit: roundCurrency(profit),
      marginPercent: Number(marginPercent.toFixed(2)),
      status: marginStatus(marginPercent, profit),
    });
  }

  const overheadPerTransaction = data.monthlyOverhead / data.targetTransactions;
  return ok({
    type: data.type,
    monthlyOverhead: roundCurrency(data.monthlyOverhead),
    targetTransactions: data.targetTransactions,
    overheadPerTransaction: roundCurrency(overheadPerTransaction),
  });
}
