import { createRequire } from "module";

import ExcelJS from "exceljs";

import { fail } from "@/lib/api-response";
import { getProfitMaxDashboardData } from "@/lib/profitmax-service";
import { requirePermission } from "@/lib/server-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const nodeRequire = createRequire(import.meta.url);
type PDFDocumentConstructor = new (options?: PDFKit.PDFDocumentOptions) => PDFKit.PDFDocument;
const PDFDocument = nodeRequire("pdfkit/js/pdfkit.standalone.js") as PDFDocumentConstructor;

function jakartaToday() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function fmtRp(value: number) {
  return `Rp ${new Intl.NumberFormat("id-ID").format(Math.round(value))}`;
}

function fmtPct(value: number) {
  return `${new Intl.NumberFormat("id-ID", { maximumFractionDigits: 1 }).format(value)}%`;
}

function addSheet(workbook: ExcelJS.Workbook, name: string, columns: ExcelJS.TableColumnProperties[], rows: unknown[][]) {
  const sheet = workbook.addWorksheet(name);
  sheet.addTable({
    name: name.replace(/[^A-Za-z0-9]/g, ""),
    ref: "A1",
    headerRow: true,
    style: { theme: "TableStyleMedium2", showRowStripes: true },
    columns,
    rows,
  });
  sheet.columns.forEach((column) => {
    column.width = 18;
  });
}

async function buildWorkbook() {
  const data = await getProfitMaxDashboardData();
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "GARAGE ProfitMax";
  workbook.created = new Date();

  addSheet(
    workbook,
    "Overview",
    [{ name: "Metric" }, { name: "Nilai" }, { name: "Catatan" }],
    [
      ["Omzet Harian", data.overview.dashboardDailyRevenue, data.dataSource.revenue],
      ["Target Harian", data.overview.dailyRevenueTarget, "handoff ProfitMax"],
      ["Target Bulanan", data.overview.monthlyRevenueTarget, "handoff ProfitMax"],
      ["Fixed Cost Bulanan", data.overview.fixedMonthlyCost, "ProfitMax overhead"],
      ["Net Profit Bulanan", data.overview.netProfitPerMonth, "handoff ProfitMax"],
      ["ROI Tahunan", data.overview.roiAnnualPercent, "percent"],
      ["Menu SKU", data.overview.menuSkuCount, data.dataSource.menu],
      ["Margin Rata-rata", data.overview.averageMargin, "percent"],
      ["Menu Kritis", data.overview.criticalMenuCount, "margin rendah/rugi"],
    ],
  );

  addSheet(
    workbook,
    "Menu HPP",
    [
      { name: "Kode" },
      { name: "Menu" },
      { name: "Kategori" },
      { name: "HPP" },
      { name: "Harga" },
      { name: "Profit" },
      { name: "Margin" },
      { name: "Status" },
    ],
    data.menuRows.map((menu) => [menu.code, menu.name, menu.category, menu.hpp, menu.price, menu.profit, menu.margin, menu.status]),
  );

  addSheet(
    workbook,
    "Ingredients",
    [{ name: "Kode" }, { name: "Nama" }, { name: "Kategori" }, { name: "Unit" }, { name: "Harga Unit" }, { name: "Stock" }, { name: "Minimum" }],
    data.ingredients.map((item) => [item.code, item.name, item.category, item.unit, item.pricePerUnit, item.stock, item.minimumStock]),
  );

  addSheet(
    workbook,
    "Recipes",
    [{ name: "Kode" }, { name: "Resep" }, { name: "Serving" }, { name: "Prep Menit" }, { name: "Total HPP" }, { name: "Quality Note" }],
    data.recipes.map((recipe) => [
      recipe.code,
      recipe.name,
      recipe.serving,
      recipe.prepMinutes,
      recipe.ingredients.reduce((sum, item) => sum + item.cost, 0),
      recipe.qualityNotes,
    ]),
  );

  addSheet(
    workbook,
    "Payroll",
    [{ name: "ID" }, { name: "Nama" }, { name: "Posisi" }, { name: "Gaji Pokok" }, { name: "Tunjangan" }, { name: "Potongan" }, { name: "Total" }],
    data.employees.map((employee) => [employee.id, employee.name, employee.position, employee.baseSalary, employee.allowance, employee.deduction, employee.totalSalary]),
  );

  addSheet(
    workbook,
    "Overhead",
    [{ name: "Nama" }, { name: "Kategori" }, { name: "Jumlah" }],
    data.overheads.map((overhead) => [overhead.name, overhead.category, overhead.amount]),
  );

  addSheet(
    workbook,
    "Bundling",
    [{ name: "Kode" }, { name: "Nama" }, { name: "Harga Normal" }, { name: "Harga Paket" }, { name: "HPP" }, { name: "Profit" }, { name: "Margin" }, { name: "Sold" }],
    data.bundles.map((bundle) => [bundle.code, bundle.name, bundle.normalPrice, bundle.bundlePrice, bundle.hpp, bundle.profit, bundle.margin, bundle.sold]),
  );

  addSheet(
    workbook,
    "Health",
    [{ name: "Indikator" }, { name: "Aktual" }, { name: "Target" }, { name: "Unit" }, { name: "Status" }, { name: "Catatan" }],
    data.healthIndicators.map((indicator) => [indicator.name, indicator.actual, indicator.target, indicator.unit, indicator.status, indicator.note]),
  );

  return workbook;
}

async function buildPdf() {
  const data = await getProfitMaxDashboardData();
  const doc = new PDFDocument({ size: "A4", margin: 42 });
  const chunks: Buffer[] = [];

  doc.on("data", (chunk: Buffer) => chunks.push(chunk));
  const done = new Promise<Buffer>((resolve) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
  });

  doc.fontSize(18).text("GARAGE ProfitMax Report", { continued: false });
  doc.moveDown(0.4).fontSize(9).fillColor("#555").text(`Tanggal: ${jakartaToday()} | Source menu: ${data.dataSource.menu} | revenue: ${data.dataSource.revenue}`);
  doc.moveDown().fillColor("#111").fontSize(12).text("Dashboard Overview");
  doc.moveDown(0.4).fontSize(10);
  [
    ["Omzet harian", fmtRp(data.overview.dashboardDailyRevenue)],
    ["Target harian", fmtRp(data.overview.dailyRevenueTarget)],
    ["Net profit bulanan", fmtRp(data.overview.netProfitPerMonth)],
    ["ROI tahunan", fmtPct(data.overview.roiAnnualPercent)],
    ["Margin rata-rata", fmtPct(data.overview.averageMargin)],
    ["Menu kritis", String(data.overview.criticalMenuCount)],
  ].forEach(([label, value]) => doc.text(`${label}: ${value}`));

  doc.moveDown().fontSize(12).text("Menu Kritis");
  doc.moveDown(0.4).fontSize(9);
  data.menuRows
    .filter((menu) => menu.margin < 30 || menu.status === "RUGI")
    .slice(0, 12)
    .forEach((menu) => {
      doc.text(`${menu.code} - ${menu.name}: margin ${fmtPct(menu.margin)}, profit ${fmtRp(menu.profit)}, status ${menu.status}`);
    });

  doc.moveDown().fontSize(12).text("Health Indicator");
  doc.moveDown(0.4).fontSize(9);
  data.healthIndicators.forEach((indicator) => {
    const actual = indicator.unit === "idr" ? fmtRp(indicator.actual) : indicator.unit === "percent" ? fmtPct(indicator.actual) : String(indicator.actual);
    doc.text(`${indicator.name}: ${actual} / ${indicator.status}`);
  });

  doc.moveDown().fontSize(8).fillColor("#555").text("Dokumen ini dibuat otomatis dari GARAGE ProfitMax Control.");
  doc.end();
  return done;
}

export async function GET(request: Request) {
  const session = await requirePermission("dashboard:read");
  if (session.response) return session.response;

  const url = new URL(request.url);
  const format = url.searchParams.get("format") ?? "xlsx";
  const date = jakartaToday();

  if (format === "pdf") {
    const pdf = await buildPdf();
    return new Response(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="garage-profitmax-${date}.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  }

  if (format !== "xlsx") {
    return fail(400, "INVALID_FORMAT", "format harus xlsx atau pdf.");
  }

  const workbook = await buildWorkbook();
  const buffer = await workbook.xlsx.writeBuffer();
  return new Response(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="garage-profitmax-${date}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
