import { createRequire } from "module";

import ExcelJS from "exceljs";
import { desc, eq, inArray } from "drizzle-orm";

import { getDb } from "@/db";
import {
  inventoryLocationStocks,
  inventoryItems,
  inventoryTransferItems,
  inventoryTransferRequests,
  menuItems,
  menuRecipes,
  menuVariants,
  outlets,
  stockMovements,
  stockOpnameItems,
  stockOpnameSessions,
  supplierReceivingItems,
  supplierReceivings,
} from "@/db/schema";
import { fail } from "@/lib/api-response";
import { getSmartReorderSuggestions } from "@/lib/garage-service";
import { requirePermission } from "@/lib/server-auth";

export const runtime = "nodejs";

const nodeRequire = createRequire(import.meta.url);
type PDFDocumentConstructor = new (
  options?: PDFKit.PDFDocumentOptions,
) => PDFKit.PDFDocument;
const PDFDocument = nodeRequire("pdfkit/js/pdfkit.standalone.js") as PDFDocumentConstructor;

function jakartaToday() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function fmtNumber(value: number) {
  return new Intl.NumberFormat("id-ID", { maximumFractionDigits: 2 }).format(value);
}

function fmtRp(value: number) {
  return `Rp ${new Intl.NumberFormat("id-ID").format(Math.round(value))}`;
}

async function loadExportData() {
  const db = getDb();
  const [
    products,
    variants,
    recipes,
    warehouseItems,
    locationStocks,
    movements,
    opnameSessions,
    transfers,
    receivings,
  ] =
    await Promise.all([
      db.select().from(menuItems).orderBy(menuItems.category, menuItems.name),
      db.select().from(menuVariants).orderBy(menuVariants.itemId, menuVariants.sortOrder),
      db
        .select({
          menuItemId: menuRecipes.menuItemId,
          variantId: menuRecipes.variantId,
          inventorySku: menuRecipes.inventorySku,
          qty: menuRecipes.qty,
          unit: menuRecipes.unit,
          wastePct: menuRecipes.wastePct,
          status: menuRecipes.status,
          inventoryName: inventoryItems.name,
          unitCost: inventoryItems.unitCost,
        })
        .from(menuRecipes)
        .leftJoin(inventoryItems, eq(inventoryItems.sku, menuRecipes.inventorySku))
        .orderBy(menuRecipes.menuItemId, menuRecipes.variantId, menuRecipes.inventorySku),
      db.select().from(inventoryItems).orderBy(inventoryItems.category, inventoryItems.sku),
      db
        .select({
          id: inventoryLocationStocks.id,
          itemSku: inventoryLocationStocks.itemSku,
          locationType: inventoryLocationStocks.locationType,
          locationKey: inventoryLocationStocks.locationKey,
          outletName: outlets.name,
          onHand: inventoryLocationStocks.onHand,
          min: inventoryLocationStocks.min,
          status: inventoryLocationStocks.status,
          movement: inventoryLocationStocks.movement,
          updatedAt: inventoryLocationStocks.updatedAt,
          name: inventoryItems.name,
          category: inventoryItems.category,
          usageArea: inventoryItems.usageArea,
          unit: inventoryItems.unit,
          unitCost: inventoryItems.unitCost,
        })
        .from(inventoryLocationStocks)
        .innerJoin(inventoryItems, eq(inventoryItems.sku, inventoryLocationStocks.itemSku))
        .leftJoin(outlets, eq(outlets.id, inventoryLocationStocks.outletId))
        .orderBy(inventoryLocationStocks.locationType, inventoryItems.category, inventoryItems.name),
      db.select().from(stockMovements).orderBy(desc(stockMovements.createdAt)).limit(300),
      db
        .select()
        .from(stockOpnameSessions)
        .orderBy(desc(stockOpnameSessions.createdAt))
        .limit(20),
      db
        .select({
          id: inventoryTransferRequests.id,
          requestNo: inventoryTransferRequests.requestNo,
          outletName: outlets.name,
          station: inventoryTransferRequests.station,
          status: inventoryTransferRequests.status,
          note: inventoryTransferRequests.note,
          createdAt: inventoryTransferRequests.createdAt,
          issuedAt: inventoryTransferRequests.issuedAt,
        })
        .from(inventoryTransferRequests)
        .leftJoin(outlets, eq(outlets.id, inventoryTransferRequests.outletId))
        .orderBy(desc(inventoryTransferRequests.createdAt))
        .limit(100),
      db
        .select({
          id: supplierReceivings.id,
          code: supplierReceivings.code,
          invoiceNo: supplierReceivings.invoiceNo,
          totalAmount: supplierReceivings.totalAmount,
          note: supplierReceivings.note,
          receivedAt: supplierReceivings.receivedAt,
        })
        .from(supplierReceivings)
        .orderBy(desc(supplierReceivings.receivedAt))
        .limit(100),
    ]);

  const opnameItems = opnameSessions.length
    ? await db
        .select()
        .from(stockOpnameItems)
        .where(
          inArray(
            stockOpnameItems.sessionId,
            opnameSessions.map((session) => session.id),
          ),
        )
        .orderBy(stockOpnameItems.itemName)
    : [];
  const reorder = await getSmartReorderSuggestions({ windowDays: 14 });
  const transferItems = transfers.length
    ? await db
        .select()
        .from(inventoryTransferItems)
        .where(inArray(inventoryTransferItems.requestId, transfers.map((transfer) => transfer.id)))
        .orderBy(inventoryTransferItems.itemName)
    : [];
  const receivingItems = receivings.length
    ? await db
        .select()
        .from(supplierReceivingItems)
        .where(inArray(supplierReceivingItems.receivingId, receivings.map((receiving) => receiving.id)))
        .orderBy(supplierReceivingItems.itemName)
    : [];

  return {
    products,
    variants,
    recipes,
    warehouseItems,
    locationStocks,
    movements,
    opnameSessions,
    opnameItems,
    reorder,
    transfers,
    transferItems,
    receivings,
    receivingItems,
  };
}

function autosize(sheet: ExcelJS.Worksheet) {
  sheet.getRow(1).font = { bold: true };
  sheet.columns.forEach((column) => {
    column.width = Math.max(14, Math.min(42, column.width ?? 18));
  });
}

async function buildWorkbook() {
  const data = await loadExportData();
  const wb = new ExcelJS.Workbook();
  wb.creator = "GARAGE";
  wb.created = new Date();

  const summary = wb.addWorksheet("Ringkasan");
  summary.addRows([
    ["Laporan", "Produk Manajemen & Gudang"],
    ["Tanggal", jakartaToday()],
    ["Produk aktif", data.products.filter((row) => row.status === "active").length],
    ["SKU gudang", data.warehouseItems.length],
    ["Stok low", data.warehouseItems.filter((row) => row.status === "low").length],
    ["Stok watch", data.warehouseItems.filter((row) => row.status === "watch").length],
    [
      "Nilai stok",
      data.warehouseItems.reduce(
        (sum, row) => sum + Number(row.onHand) * Number(row.unitCost ?? 0),
        0,
      ),
    ],
    ["Stok lokasi Gudang", data.locationStocks.filter((row) => row.locationType === "warehouse").length],
    ["Stok lokasi Outlet", data.locationStocks.filter((row) => row.locationType === "outlet").length],
    ["Transfer request", data.transfers.length],
    ["Supplier receiving", data.receivings.length],
  ]);
  summary.getColumn(1).width = 28;
  summary.getColumn(2).width = 32;

  const productSheet = wb.addWorksheet("Produk");
  productSheet.addRow(["ID", "Nama", "Kategori", "Station", "Status", "Stok Menu", "Prep", "Tags"]);
  data.products.forEach((row) => {
    productSheet.addRow([
      row.id,
      row.name,
      row.category,
      row.section,
      row.status,
      row.stock,
      row.prep,
      row.tags.join(", "),
    ]);
  });
  autosize(productSheet);

  const variantSheet = wb.addWorksheet("Varian HPP");
  variantSheet.addRow(["Produk ID", "Varian ID", "Label", "Harga", "HPP", "Margin", "Margin %"]);
  data.variants.forEach((row) => {
    const margin = row.price - row.baseCost;
    variantSheet.addRow([
      row.itemId,
      row.variantId,
      row.label,
      row.price,
      row.baseCost,
      margin,
      row.price > 0 ? Math.round((margin / row.price) * 100) : 0,
    ]);
  });
  autosize(variantSheet);

  const recipeSheet = wb.addWorksheet("Resep BOM");
  recipeSheet.addRow([
    "Produk ID",
    "Varian",
    "SKU Gudang",
    "Nama Bahan",
    "Qty",
    "Unit",
    "Waste %",
    "Unit Cost",
    "Line Cost",
    "Status",
  ]);
  data.recipes.forEach((row) => {
    const qty = Number(row.qty ?? 0);
    const unitCost = Number(row.unitCost ?? 0);
    const wastePct = Number(row.wastePct ?? 0);
    recipeSheet.addRow([
      row.menuItemId,
      row.variantId,
      row.inventorySku ?? "",
      row.inventoryName ?? "",
      qty,
      row.unit,
      wastePct,
      unitCost,
      Math.round(qty * unitCost * (1 + wastePct / 100)),
      row.status,
    ]);
  });
  autosize(recipeSheet);

  const warehouseSheet = wb.addWorksheet("Gudang");
  warehouseSheet.addRow([
    "SKU",
    "Nama",
    "Alias",
    "Kategori",
    "Area",
    "On Hand",
    "Minimum",
    "Unit",
    "Package",
    "Unit Cost",
    "Nilai Stok",
    "Status",
    "Movement Terakhir",
    "Updated At",
  ]);
  data.warehouseItems.forEach((row) => {
    warehouseSheet.addRow([
      row.sku,
      row.name,
      row.alternativeName,
      row.category,
      row.usageArea,
      row.onHand,
      row.min,
      row.unit,
      row.packageSize,
      row.unitCost,
      Number(row.onHand) * Number(row.unitCost ?? 0),
      row.status,
      row.movement,
      row.updatedAt,
    ]);
  });
  autosize(warehouseSheet);

  const warehouseStockSheet = wb.addWorksheet("Stok Gudang");
  warehouseStockSheet.addRow(["SKU", "Nama", "Kategori", "Area", "On Hand", "Minimum", "Unit", "Unit Cost", "Nilai", "Status", "Movement"]);
  data.locationStocks
    .filter((row) => row.locationType === "warehouse")
    .forEach((row) => {
      warehouseStockSheet.addRow([
        row.itemSku,
        row.name,
        row.category,
        row.usageArea,
        row.onHand,
        row.min,
        row.unit,
        row.unitCost,
        Number(row.onHand) * Number(row.unitCost ?? 0),
        row.status,
        row.movement,
      ]);
    });
  autosize(warehouseStockSheet);

  const outletStockSheet = wb.addWorksheet("Stok Outlet");
  outletStockSheet.addRow(["Outlet", "SKU", "Nama", "Kategori", "Area", "On Hand", "Minimum", "Unit", "Unit Cost", "Nilai", "Status", "Movement"]);
  data.locationStocks
    .filter((row) => row.locationType === "outlet")
    .forEach((row) => {
      outletStockSheet.addRow([
        row.outletName ?? "Outlet",
        row.itemSku,
        row.name,
        row.category,
        row.usageArea,
        row.onHand,
        row.min,
        row.unit,
        row.unitCost,
        Number(row.onHand) * Number(row.unitCost ?? 0),
        row.status,
        row.movement,
      ]);
    });
  autosize(outletStockSheet);

  const transferSheet = wb.addWorksheet("Transfer Outlet");
  transferSheet.addRow(["Request", "Outlet", "Station", "Status", "SKU", "Item", "Qty Request", "Qty Issue", "Unit", "Catatan", "Created", "Issued"]);
  data.transferItems.forEach((row) => {
    const request = data.transfers.find((entry) => entry.id === row.requestId);
    transferSheet.addRow([
      request?.requestNo ?? row.requestId,
      request?.outletName ?? "",
      request?.station ?? "",
      request?.status ?? "",
      row.itemSku ?? "",
      row.itemName,
      row.requestedQty,
      row.issuedQty,
      row.unit,
      row.note ?? request?.note ?? "",
      request?.createdAt ?? "",
      request?.issuedAt ?? "",
    ]);
  });
  autosize(transferSheet);

  const receivingSheet = wb.addWorksheet("Supplier Receiving");
  receivingSheet.addRow(["Receiving", "Invoice", "SKU", "Item", "Qty", "Unit", "Unit Cost", "Line Total", "Catatan", "Received At"]);
  data.receivingItems.forEach((row) => {
    const receiving = data.receivings.find((entry) => entry.id === row.receivingId);
    receivingSheet.addRow([
      receiving?.code ?? row.receivingId,
      receiving?.invoiceNo ?? "",
      row.itemSku ?? "",
      row.itemName,
      row.qty,
      row.unit,
      row.unitCost,
      row.lineTotal,
      row.note ?? receiving?.note ?? "",
      receiving?.receivedAt ?? "",
    ]);
  });
  autosize(receivingSheet);

  const movementSheet = wb.addWorksheet("Movement");
  movementSheet.addRow(["Waktu", "SKU", "Tipe", "Qty", "Catatan", "Actor"]);
  data.movements.forEach((row) => {
    movementSheet.addRow([
      row.createdAt,
      row.itemSku ?? "",
      row.type,
      row.qty ?? "",
      row.note,
      row.actor,
    ]);
  });
  autosize(movementSheet);

  const opnameSheet = wb.addWorksheet("Opname");
  opnameSheet.addRow(["Kode", "Status", "SKU", "Item", "System", "Fisik", "Selisih", "Unit", "Catatan"]);
  data.opnameItems.forEach((row) => {
    const session = data.opnameSessions.find((entry) => entry.id === row.sessionId);
    opnameSheet.addRow([
      session?.code ?? row.sessionId,
      session?.status ?? "",
      row.itemSku ?? "",
      row.itemName,
      row.systemQty,
      row.physicalQty,
      row.delta,
      row.unit,
      row.note ?? session?.note ?? "",
    ]);
  });
  autosize(opnameSheet);

  const reorderSheet = wb.addWorksheet("Smart Reorder");
  reorderSheet.addRow([
    "SKU",
    "Nama",
    "Kategori",
    "On Hand",
    "Minimum",
    "Pakai/Hari",
    "Habis Dalam Hari",
    "Saran Reorder",
    "Risk",
    "Alasan",
  ]);
  data.reorder.suggestions.forEach((row) => {
    reorderSheet.addRow([
      row.sku,
      row.name,
      row.category,
      row.onHand,
      row.min,
      row.dailyConsumption,
      row.daysUntilEmpty ?? "",
      row.suggestedReorderQty,
      row.riskLevel,
      row.reason,
    ]);
  });
  autosize(reorderSheet);

  return wb;
}

async function buildPdf() {
  const data = await loadExportData();
  return new Promise<Buffer>((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: "A4", margin: 44 });
      const chunks: Buffer[] = [];
      doc.on("data", (chunk: Buffer) => chunks.push(chunk));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);

      const inventoryValue = data.warehouseItems.reduce(
        (sum, row) => sum + Number(row.onHand) * Number(row.unitCost ?? 0),
        0,
      );
      const warehouseLocationValue = data.locationStocks
        .filter((row) => row.locationType === "warehouse")
        .reduce((sum, row) => sum + Number(row.onHand) * Number(row.unitCost ?? 0), 0);
      const outletLocationValue = data.locationStocks
        .filter((row) => row.locationType === "outlet")
        .reduce((sum, row) => sum + Number(row.onHand) * Number(row.unitCost ?? 0), 0);
      const lowItems = data.warehouseItems.filter((row) => row.status === "low");
      const watchItems = data.warehouseItems.filter((row) => row.status === "watch");
      const activeProducts = data.products.filter((row) => row.status === "active");

      doc.font("Helvetica-Bold").fontSize(18).fillColor("#111").text("GARAGE");
      doc
        .font("Helvetica")
        .fontSize(10)
        .fillColor("#666")
        .text(`Produk Manajemen & Gudang - ${jakartaToday()}`);
      doc.moveDown(0.5);
      doc.strokeColor("#d11a2a").lineWidth(2).moveTo(44, doc.y).lineTo(551, doc.y).stroke();
      doc.moveDown(1);

      doc.font("Helvetica-Bold").fontSize(13).fillColor("#111").text("Ringkasan");
      doc.moveDown(0.4);
      const summaryRows = [
        ["Produk aktif", String(activeProducts.length)],
        ["SKU gudang", String(data.warehouseItems.length)],
        ["Stok low/watch", `${lowItems.length} / ${watchItems.length}`],
        ["Nilai stok", fmtRp(inventoryValue)],
        ["Nilai Gudang pusat", fmtRp(warehouseLocationValue)],
        ["Nilai Outlet", fmtRp(outletLocationValue)],
        ["Transfer request", String(data.transfers.length)],
        ["Supplier receiving", String(data.receivings.length)],
        ["Movement tercatat", String(data.movements.length)],
        ["Smart reorder critical", String(data.reorder.criticalCount)],
      ];
      summaryRows.forEach(([label, value]) => {
        doc.font("Helvetica").fontSize(9).fillColor("#666").text(label, { continued: true });
        doc.font("Helvetica-Bold").fillColor("#111").text(`  ${value}`);
      });

      doc.moveDown(1);
      doc.font("Helvetica-Bold").fontSize(13).fillColor("#111").text("Stok Perlu Perhatian");
      doc.moveDown(0.3);
      [...lowItems, ...watchItems].slice(0, 12).forEach((item) => {
        doc
          .font("Helvetica-Bold")
          .fontSize(9)
          .fillColor(item.status === "low" ? "#b91c1c" : "#a16207")
          .text(`${item.sku} - ${item.name}`, { continued: true });
        doc
          .font("Helvetica")
          .fillColor("#333")
          .text(`  ${fmtNumber(Number(item.onHand))}/${fmtNumber(Number(item.min))} ${item.unit}`);
      });
      if (!lowItems.length && !watchItems.length) {
        doc.font("Helvetica").fontSize(9).fillColor("#666").text("Tidak ada stok low/watch.");
      }

      doc.moveDown(1);
      doc.font("Helvetica-Bold").fontSize(13).fillColor("#111").text("Smart Reorder");
      doc.moveDown(0.3);
      data.reorder.suggestions.slice(0, 10).forEach((row) => {
        doc
          .font("Helvetica-Bold")
          .fontSize(9)
          .fillColor(row.riskLevel === "critical" ? "#b91c1c" : "#111")
          .text(`${row.sku} - ${row.name}`);
        doc
          .font("Helvetica")
          .fontSize(8)
          .fillColor("#555")
          .text(
            `Risk ${row.riskLevel}; on hand ${fmtNumber(row.onHand)} ${row.unit}; saran reorder ${fmtNumber(row.suggestedReorderQty)} ${row.unit}. ${row.reason}`,
          );
      });

      doc.moveDown(1);
      doc.font("Helvetica-Bold").fontSize(13).fillColor("#111").text("Produk Aktif");
      doc.moveDown(0.3);
      activeProducts.slice(0, 18).forEach((row) => {
        doc
          .font("Helvetica")
          .fontSize(8)
          .fillColor("#333")
          .text(`${row.id} - ${row.name} (${row.category}/${row.section}) - ${row.stock}`);
      });

      doc.end();
    } catch (error) {
      reject(error);
    }
  });
}

export async function GET(request: Request) {
  const session = await requirePermission("inventory:read");
  if (session.response) return session.response;

  const url = new URL(request.url);
  const format = url.searchParams.get("format") ?? "xlsx";
  const filenameDate = jakartaToday();

  if (format === "xlsx") {
    const wb = await buildWorkbook();
    const buffer = (await wb.xlsx.writeBuffer()) as ArrayBuffer;
    return new Response(buffer, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="garage-produk-gudang-${filenameDate}.xlsx"`,
        "Cache-Control": "no-store",
      },
    });
  }

  if (format === "pdf") {
    const buffer = await buildPdf();
    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="garage-produk-gudang-${filenameDate}.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  }

  return fail(400, "INVALID_EXPORT_FORMAT", "format harus xlsx atau pdf.");
}
