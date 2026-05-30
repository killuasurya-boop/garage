import ExcelJS from "exceljs";

import { fail } from "@/lib/api-response";
import {
  getWarehouseDailyAuditSummary,
  getWarehouseDailyReportLock,
  listWarehouseDailyReportLocks,
} from "@/lib/garage-service";
import { requirePermission } from "@/lib/server-auth";

export const runtime = "nodejs";

function fmtDate(value: string) {
  return new Intl.DateTimeFormat("id-ID", {
    dateStyle: "full",
    timeZone: "Asia/Jakarta",
  }).format(new Date(`${value}T00:00:00+07:00`));
}

function autosize(sheet: ExcelJS.Worksheet) {
  sheet.getRow(1).font = { bold: true };
  sheet.columns.forEach((column) => {
    column.width = Math.max(14, Math.min(44, column.width ?? 18));
  });
}

function styleHeader(row: ExcelJS.Row) {
  row.font = { bold: true, color: { argb: "FFFFFFFF" } };
  row.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF1F2937" },
  };
  row.alignment = { vertical: "middle" };
}

export async function GET(request: Request) {
  const session = await requirePermission("inventory:read");
  if (session.response) return session.response;

  try {
    const url = new URL(request.url);
    const month = url.searchParams.get("month");
    if (month) {
      if (!/^\d{4}-\d{2}$/.test(month)) {
        return fail(400, "INVALID_MONTH", "Bulan harus format YYYY-MM.");
      }
      const monthly = await listWarehouseDailyReportLocks({ month, garage: session.data });
      const wb = new ExcelJS.Workbook();
      wb.creator = "GARAGE";
      wb.subject = "Rekap Bulanan Gudang";
      wb.title = `Rekap Bulanan Gudang ${monthly.month}`;
      wb.created = new Date();
      wb.modified = new Date();

      const summary = wb.addWorksheet("Rekap Bulanan");
      summary.addRows([
        ["Bulan", monthly.month],
        ["Hari terkunci", `${monthly.summary.lockedDays}/${monthly.summary.expectedLockedDays}`],
        ["Kelengkapan", `${monthly.summary.completionPct}%`],
        ["Tanggal belum terkunci", monthly.summary.missingDates.length],
        ["Receiving supplier", monthly.summary.receivingCount],
        ["Nilai receiving", monthly.summary.receivingValue],
        ["Issue outlet", monthly.summary.issuedRequestCount],
        ["Item keluar", monthly.summary.issuedItemCount],
        ["Movement", monthly.summary.movementCount],
        ["Rata-rata nilai stok Gudang", monthly.summary.averageWarehouseStockValue],
        ["Low latest", monthly.summary.lowCountLatest],
        ["Watch latest", monthly.summary.watchCountLatest],
      ]);
      summary.getColumn(1).width = 32;
      summary.getColumn(2).width = 28;

      const daily = wb.addWorksheet("Harian");
      daily.addRow(["Tanggal", "Dokumen", "Status", "Nilai Receiving", "Issue Request", "Movement", "Nilai Stok"]);
      monthly.summary.byDay.forEach((row) => {
        daily.addRow([
          row.date,
          row.documentNo,
          "Terkunci",
          row.receivingValue,
          row.issuedRequestCount,
          row.movementCount,
          row.warehouseStockValue,
        ]);
      });
      monthly.summary.missingDates.forEach((date) => {
        daily.addRow([date, "-", "Belum terkunci", 0, 0, 0, 0]);
      });
      styleHeader(daily.getRow(1));
      autosize(daily);

      const missing = wb.addWorksheet("Belum Terkunci");
      missing.addRow(["Tanggal", "Status"]);
      monthly.summary.missingDates.forEach((date) => {
        missing.addRow([date, "Belum terkunci"]);
      });
      styleHeader(missing.getRow(1));
      autosize(missing);

      const station = wb.addWorksheet("Issue Per Area");
      station.addRow(["Area", "Request", "Total Qty"]);
      monthly.summary.byStation.forEach((row) => {
        station.addRow([row.station === "bar" ? "Bar" : "Dapur", row.requestCount, row.totalQty]);
      });
      styleHeader(station.getRow(1));
      autosize(station);

      const movement = wb.addWorksheet("Movement Type");
      movement.addRow(["Type", "Event", "Total Qty"]);
      monthly.summary.byMovementType.forEach((row) => {
        movement.addRow([row.type, row.count, row.totalQty]);
      });
      styleHeader(movement.getRow(1));
      autosize(movement);

      const top = wb.addWorksheet("Top Movement");
      top.addRow(["SKU", "Nama", "Unit", "Total Mutasi", "Event"]);
      monthly.summary.topMovementItems.forEach((item) => {
        top.addRow([item.sku, item.name, item.unit, item.totalAbsQty, item.count]);
      });
      styleHeader(top.getRow(1));
      autosize(top);

      wb.eachSheet((sheet) => {
        sheet.views = [{ state: "frozen", ySplit: 1 }];
      });

      const buffer = (await wb.xlsx.writeBuffer()) as ArrayBuffer;
      return new Response(buffer, {
        headers: {
          "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": `attachment; filename="garage-rekap-bulanan-gudang-${monthly.month}.xlsx"`,
        },
      });
    }

    const date = url.searchParams.get("date") || undefined;
    const lock = date ? await getWarehouseDailyReportLock(date, session.data) : null;
    const audit = lock?.report ?? (await getWarehouseDailyAuditSummary({ date }));

    const wb = new ExcelJS.Workbook();
    wb.creator = "GARAGE";
    wb.subject = "Laporan Harian Gudang";
    wb.title = `Laporan Harian Gudang ${audit.date}`;
    wb.created = new Date();
    wb.modified = new Date();

    const summary = wb.addWorksheet("Ringkasan");
    summary.addRows([
      ["Dokumen", lock?.documentNo ?? `WH-DAY-${audit.date.replaceAll("-", "")}`],
      ["Tanggal", fmtDate(audit.date)],
      ["Status", lock ? "Terkunci" : "Live / belum dikunci"],
      ["Dikunci pada", lock ? new Date(lock.lockedAt).toLocaleString("id-ID", { timeZone: "Asia/Jakarta" }) : "-"],
      ["Dikunci oleh", lock ? `${lock.lockedBy.name} / ${lock.lockedBy.role}` : "-"],
      ["Generated", new Date(audit.generatedAt).toLocaleString("id-ID", { timeZone: "Asia/Jakarta" })],
      ["Receiving supplier", audit.receivingCount],
      ["Nilai receiving", audit.receivingValue],
      ["Issue outlet", audit.issuedRequestCount],
      ["Item keluar", audit.issuedItemCount],
      ["Movement", audit.movementCount],
      ["Nilai stok Gudang", audit.warehouseStockValue],
      ["Low Gudang", audit.lowCount],
      ["Watch Gudang", audit.watchCount],
    ]);
    summary.getColumn(1).width = 28;
    summary.getColumn(2).width = 36;
    summary.getColumn(2).numFmt = "#,##0";

    const station = wb.addWorksheet("Issue Per Area");
    station.addRow(["Area", "Request", "Total Qty"]);
    audit.byStation.forEach((row) => {
      station.addRow([row.station === "bar" ? "Bar" : "Dapur", row.requestCount, row.totalQty]);
    });
    styleHeader(station.getRow(1));
    autosize(station);

    const topMovement = wb.addWorksheet("Top Movement");
    topMovement.addRow(["SKU", "Nama", "Unit", "Total Mutasi", "Event"]);
    audit.topMovementItems.forEach((item) => {
      topMovement.addRow([item.sku, item.name, item.unit, item.totalAbsQty, item.count]);
    });
    styleHeader(topMovement.getRow(1));
    autosize(topMovement);

    const movementType = wb.addWorksheet("Movement Type");
    movementType.addRow(["Type", "Event", "Total Qty"]);
    audit.byMovementType.forEach((row) => {
      movementType.addRow([row.type, row.count, row.totalQty]);
    });
    styleHeader(movementType.getRow(1));
    autosize(movementType);

    wb.eachSheet((sheet) => {
      sheet.views = [{ state: "frozen", ySplit: 1 }];
      sheet.eachRow((row) => {
        row.eachCell((cell) => {
          cell.border = {
            top: { style: "thin", color: { argb: "FFE5E7EB" } },
            left: { style: "thin", color: { argb: "FFE5E7EB" } },
            bottom: { style: "thin", color: { argb: "FFE5E7EB" } },
            right: { style: "thin", color: { argb: "FFE5E7EB" } },
          };
        });
      });
    });

    const buffer = (await wb.xlsx.writeBuffer()) as ArrayBuffer;
    return new Response(buffer, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="garage-laporan-harian-gudang-${audit.date}.xlsx"`,
      },
    });
  } catch (error) {
    return fail(
      500,
      "AUDIT_XLSX_FAILED",
      error instanceof Error ? error.message : "Excel laporan harian gagal dibuat.",
    );
  }
}
