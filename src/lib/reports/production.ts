// Laporan Produksi: porsi menu yang dibuat Bar/Kitchen (Production Hub),
// produksi olahan gudang (dokumen PRD-), pemakaian bahan baku vs kebutuhan
// resep (varians), dan waste (porsi yang sudah dibuat lalu void/refund +
// mutasi waste gudang).
import { businessDateKey } from "@/lib/business-date";
import { loadBusinessDayPolicy } from "@/lib/business-date-policy";
import { and, eq, gte, lt, sql } from "drizzle-orm";

import { getDb } from "@/db";
import { auditLogs, menuItems, menuVariants, productionTicketItems, wmsCategory, wmsProduct, wmsStockMovement } from "@/db/schema";
import { formatRupiah, periodLabelFor, sumRows, type ReportColumn, type ReportDoc, type ReportRow } from "@/lib/report-engine";
import { classifyMovement } from "@/lib/reports/inventory";
import {
  areaMatchesDivision,
  DIVISION_LABEL,
  rangeBounds,
  round4,
  type ReportDivision,
  type ReportRange,
} from "@/lib/reports/common";

function stationMatches(station: string | null | undefined, division: ReportDivision) {
  if (division === "semua") return true;
  const value = (station ?? "").toLowerCase();
  return division === "bar" ? value === "bar" : value === "dapur" || value === "kitchen";
}

function stationLabel(station: string | null | undefined) {
  const value = (station ?? "").toLowerCase();
  return value === "bar" ? "Bar" : value === "dapur" || value === "kitchen" ? "Kitchen" : station || "-";
}

export async function buildProductionReport(input: {
  range: ReportRange;
  division: ReportDivision;
  outletName?: string | null;
}): Promise<ReportDoc> {
  const db = getDb();
  const businessDay = await loadBusinessDayPolicy();
  const { start, end } = rangeBounds(input.range, businessDay);

  // HPP resep per varian menu (baseCost = Σ resep × harga bahan, lihat menu-recipe-cost).
  const variantRows = await db
    .select({ itemId: menuVariants.itemId, variantId: menuVariants.variantId, label: menuVariants.label, baseCost: menuVariants.baseCost })
    .from(menuVariants);
  const costByVariant = new Map(variantRows.map((v) => [`${v.itemId}|${v.variantId}`, Number(v.baseCost)]));
  const menuRows = await db.select({ id: menuItems.id, name: menuItems.name, station: menuItems.station }).from(menuItems);
  const menuById = new Map(menuRows.map((m) => [m.id, m]));

  // 1) Porsi selesai dibuat (SIAP) di Production Hub.
  const portionRows = await db
    .select({
      station: productionTicketItems.station,
      menuItemId: productionTicketItems.menuItemId,
      variantId: productionTicketItems.variantId,
      itemName: productionTicketItems.itemName,
      variantLabel: productionTicketItems.variantLabel,
      qty: sql<number>`coalesce(sum(${productionTicketItems.qty}), 0)`,
    })
    .from(productionTicketItems)
    .where(
      and(
        eq(productionTicketItems.status, "ready"),
        gte(productionTicketItems.readyAt, start),
        lt(productionTicketItems.readyAt, end),
      ),
    )
    .groupBy(
      productionTicketItems.station,
      productionTicketItems.menuItemId,
      productionTicketItems.variantId,
      productionTicketItems.itemName,
      productionTicketItems.variantLabel,
    );
  const portions: ReportRow[] = portionRows
    .filter((row) => stationMatches(row.station, input.division))
    .map((row) => {
      const unitCost = costByVariant.get(`${row.menuItemId}|${row.variantId}`) ?? 0;
      const qty = Number(row.qty);
      return {
        station: stationLabel(row.station),
        menu: row.itemName,
        variant: row.variantLabel,
        qty,
        unitCost,
        cost: unitCost * qty,
      };
    })
    .sort((a, b) => String(a.station).localeCompare(String(b.station)) || Number(b.qty) - Number(a.qty));

  // 2) Mutasi gudang periode → produksi olahan, pemakaian bahan, waste, selisih.
  const products = await db
    .select({ id: wmsProduct.id, sku: wmsProduct.sku, name: wmsProduct.name, unit: wmsProduct.unit, hpp: wmsProduct.hpp, area: wmsCategory.area })
    .from(wmsProduct)
    .leftJoin(wmsCategory, sql`lower(trim(${wmsCategory.name})) = lower(trim(${wmsProduct.category}))`);
  const productById = new Map(products.filter((p) => areaMatchesDivision(p.area, input.division)).map((p) => [p.id, p]));
  const moves = await db
    .select({
      productId: wmsStockMovement.productId,
      type: wmsStockMovement.type,
      qty: wmsStockMovement.qty,
      valueHpp: wmsStockMovement.valueHpp,
      refDoc: wmsStockMovement.refDoc,
      createdAt: wmsStockMovement.createdAt,
    })
    .from(wmsStockMovement)
    .where(and(gte(wmsStockMovement.createdAt, start), lt(wmsStockMovement.createdAt, end)));

  type Usage = { recipe: number; production: number; waste: number; adjustment: number; recipeValue: number; productionValue: number; wasteValue: number };
  const usage = new Map<string, Usage>();
  const batches = new Map<string, { doc: string; date: string; outputs: string[]; outputQty: number; unit: string; cost: number }>();
  for (const move of moves) {
    if (!move.productId) continue;
    const product = productById.get(move.productId);
    const qty = Number(move.qty);
    const bucket = classifyMovement(move.type, move.refDoc, qty);
    if (move.refDoc.startsWith("PRD-")) {
      // Batch olahan: dihitung bila output ATAU bahan termasuk divisi.
      const batch = batches.get(move.refDoc) ?? { doc: move.refDoc, date: businessDateKey(move.createdAt, businessDay), outputs: [], outputQty: 0, unit: "", cost: 0 };
      if (qty > 0 && product) {
        batch.outputs.push(product.name);
        batch.outputQty += qty;
        batch.unit = product.unit;
      } else if (qty < 0 && product) {
        batch.cost += Number(move.valueHpp);
      }
      batches.set(move.refDoc, batch);
    }
    if (!product) continue;
    const u = usage.get(move.productId) ?? { recipe: 0, production: 0, waste: 0, adjustment: 0, recipeValue: 0, productionValue: 0, wasteValue: 0 };
    const value = Number(move.valueHpp);
    if (bucket === "sale") {
      u.recipe += -qty;
      u.recipeValue += qty < 0 ? value : -value;
    } else if (bucket === "productionUse") {
      u.production += -qty;
      u.productionValue += value;
    } else if (bucket === "waste") {
      u.waste += -qty;
      u.wasteValue += value;
    } else if (bucket === "adjustment") {
      u.adjustment += -qty;
    }
    usage.set(move.productId, u);
  }

  const batchRows: ReportRow[] = [...batches.values()]
    .filter((b) => b.outputs.length > 0 || b.cost > 0)
    .sort((a, b) => a.date.localeCompare(b.date) || a.doc.localeCompare(b.doc))
    .map((b) => ({
      date: b.date,
      doc: b.doc,
      output: b.outputs.join(", ") || "-",
      qty: round4(b.outputQty),
      unit: b.unit,
      cost: Math.round(b.cost),
      unitCost: b.outputQty > 0 ? b.cost / b.outputQty : 0,
    }));

  const usageRows: ReportRow[] = [];
  let varianceValue = 0;
  for (const [productId, u] of [...usage.entries()].sort((a, b) => productById.get(a[0])!.sku.localeCompare(productById.get(b[0])!.sku))) {
    const product = productById.get(productId)!;
    const planned = round4(u.recipe + u.production);
    const actual = round4(planned + u.waste + u.adjustment);
    if (planned === 0 && actual === 0) continue;
    const variance = round4(actual - planned);
    const hpp = Number(product.hpp);
    varianceValue += variance * hpp;
    usageRows.push({
      sku: product.sku,
      name: product.name,
      unit: product.unit,
      recipe: round4(u.recipe),
      production: round4(u.production),
      planned,
      waste: round4(u.waste),
      adjustment: round4(u.adjustment),
      actual,
      variancePct: planned !== 0 ? (variance / planned) * 100 : null,
      varianceValue: Math.round(variance * hpp),
      usageValue: Math.round(u.recipeValue + u.productionValue + u.wasteValue),
    });
  }

  // 3) Waste porsi menu: porsi yang sudah dibuat lalu void/refund (dicatat di audit).
  const wasteLogs = await db
    .select({ createdAt: auditLogs.createdAt, metadata: auditLogs.metadata, status: auditLogs.status })
    .from(auditLogs)
    .where(
      and(
        gte(auditLogs.createdAt, start),
        lt(auditLogs.createdAt, end),
        sql`jsonb_typeof(${auditLogs.metadata} -> 'wasteItems') = 'array'`,
        sql`jsonb_array_length(${auditLogs.metadata} -> 'wasteItems') > 0`,
      ),
    );
  const wasteRows: ReportRow[] = [];
  for (const log of wasteLogs) {
    const meta = (log.metadata ?? {}) as { orderNo?: string; wasteItems?: Array<{ menuItemId: string | null; variantId: string; qty: number }> };
    for (const item of meta.wasteItems ?? []) {
      const menu = item.menuItemId ? menuById.get(item.menuItemId) : undefined;
      if (!stationMatches(menu?.station ?? null, input.division)) continue;
      const unitCost = costByVariant.get(`${item.menuItemId}|${item.variantId}`) ?? 0;
      const variant = variantRows.find((v) => v.itemId === item.menuItemId && v.variantId === item.variantId);
      wasteRows.push({
        date: businessDateKey(log.createdAt, businessDay),
        orderNo: meta.orderNo ?? "-",
        reason: log.status === "refunded" ? "Refund" : "Void",
        menu: menu?.name ?? item.menuItemId ?? "-",
        variant: variant?.label ?? item.variantId,
        qty: Number(item.qty),
        unitCost,
        cost: unitCost * Number(item.qty),
      });
    }
  }

  const portionColumns: ReportColumn[] = [
    { key: "station", label: "Station", type: "text", weight: 0.7 },
    { key: "menu", label: "Menu", type: "text", weight: 2 },
    { key: "variant", label: "Varian", type: "text", weight: 0.8 },
    { key: "qty", label: "Porsi dibuat", type: "int" },
    { key: "unitCost", label: "HPP resep/porsi", type: "money" },
    { key: "cost", label: "Biaya resep", type: "money" },
  ];
  const batchColumns: ReportColumn[] = [
    { key: "date", label: "Tanggal", type: "date" },
    { key: "doc", label: "Dokumen", type: "text", weight: 1.4 },
    { key: "output", label: "Hasil olahan", type: "text", weight: 1.8 },
    { key: "qty", label: "Qty hasil", type: "qty", noSum: true },
    { key: "unit", label: "Satuan", type: "text", weight: 0.6 },
    { key: "cost", label: "Biaya bahan", type: "money" },
    { key: "unitCost", label: "HPP/satuan", type: "price" },
  ];
  const usageColumns: ReportColumn[] = [
    { key: "sku", label: "SKU", type: "text", weight: 0.9 },
    { key: "name", label: "Nama bahan", type: "text", weight: 1.8 },
    { key: "unit", label: "Satuan", type: "text", weight: 0.6 },
    { key: "recipe", label: "Resep penjualan", type: "qty", noSum: true },
    { key: "production", label: "Resep produksi", type: "qty", noSum: true },
    { key: "planned", label: "Kebutuhan resep", type: "qty", noSum: true },
    { key: "waste", label: "Waste", type: "qty", noSum: true },
    { key: "adjustment", label: "Selisih opname", type: "qty", noSum: true },
    { key: "actual", label: "Pemakaian aktual", type: "qty", noSum: true },
    { key: "variancePct", label: "Varians", type: "pct" },
    { key: "varianceValue", label: "Nilai varians", type: "money" },
    { key: "usageValue", label: "Biaya pemakaian", type: "money" },
  ];
  const wasteColumns: ReportColumn[] = [
    { key: "date", label: "Tanggal", type: "date" },
    { key: "orderNo", label: "Order", type: "text" },
    { key: "reason", label: "Sebab", type: "text", weight: 0.6 },
    { key: "menu", label: "Menu", type: "text", weight: 1.8 },
    { key: "variant", label: "Varian", type: "text", weight: 0.8 },
    { key: "qty", label: "Porsi", type: "int" },
    { key: "unitCost", label: "HPP/porsi", type: "money" },
    { key: "cost", label: "Nilai waste", type: "money" },
  ];

  const sum = (rows: ReportRow[], key: string) => rows.reduce((s, r) => s + Number(r[key] ?? 0), 0);
  const wasteStockValue = [...usage.values()].reduce((s, u) => s + u.wasteValue, 0);
  return {
    title: "Laporan Produksi",
    division: input.division === "semua" ? null : DIVISION_LABEL[input.division],
    periodLabel: periodLabelFor(input.range.from, input.range.to),
    outletName: input.outletName ?? null,
    generatedAt: new Date().toISOString(),
    summary: [
      { label: "Porsi menu dibuat", value: new Intl.NumberFormat("id-ID").format(sum(portions, "qty")) },
      { label: "Biaya resep porsi", value: formatRupiah(sum(portions, "cost")) },
      { label: "Batch produksi olahan", value: String(batchRows.length) },
      { label: "Biaya produksi olahan", value: formatRupiah(sum(batchRows, "cost")) },
      { label: "Waste porsi (void/refund)", value: formatRupiah(sum(wasteRows, "cost")) },
      { label: "Waste bahan gudang", value: formatRupiah(wasteStockValue) },
      { label: "Nilai varians pemakaian", value: formatRupiah(varianceValue) },
    ],
    tables: [
      { title: "Porsi menu dibuat", columns: portionColumns, rows: portions, totals: sumRows(portions, portionColumns, { key: "station", text: "TOTAL" }), subtotalBy: input.division === "semua" ? "station" : undefined },
      { title: "Produksi olahan gudang", columns: batchColumns, rows: batchRows, totals: batchRows.length ? sumRows(batchRows, batchColumns, { key: "date", text: "TOTAL" }) : undefined },
      { title: "Pemakaian bahan vs resep", columns: usageColumns, rows: usageRows, totals: usageRows.length ? sumRows(usageRows, usageColumns, { key: "sku", text: "TOTAL" }) : undefined },
      { title: "Waste porsi menu", columns: wasteColumns, rows: wasteRows, totals: wasteRows.length ? sumRows(wasteRows, wasteColumns, { key: "date", text: "TOTAL" }) : undefined },
    ],
    notes: [
      "Porsi dibuat = item tiket Production Hub berstatus SIAP dalam periode. HPP resep per porsi memakai harga bahan saat ini.",
      "Kebutuhan resep = bahan yang terpotong otomatis oleh resep penjualan (neto retur void/refund) + bahan produksi olahan.",
      "Pemakaian aktual = kebutuhan resep + waste + selisih opname/penyesuaian (selisih negatif opname = bahan hilang/terpakai lebih).",
      "Waste porsi = menu yang sudah mulai/selesai dibuat lalu void/refund — bahannya tidak kembali ke stok.",
    ],
  };
}
