import { z } from "zod";

import { fail, ok } from "@/lib/api-response";
import { generateDailyBankReportPdf } from "@/lib/daily-bank-report-pdf";
import { dailyBankReportWorkbook } from "@/lib/daily-bank-report-xlsx";
import { loadFinanceConfig } from "@/lib/finance-control";
import { jakartaDateKey } from "@/lib/finance-control-core";
import { DailyBankReportError, getDailyBankReports } from "@/lib/sales-hpp-report";
import { requirePermission } from "@/lib/server-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const query = z.object({
  from: z.string().regex(DATE).optional(),
  to: z.string().regex(DATE).optional(),
  format: z.enum(["json", "pdf", "xlsx"]).default("json"),
});

// Laporan Harian Rekening Bersama (Owner 24 Nov 2026): omzet, cup/porsi per kategori, HPP produk, laba kotor,
// biaya operasional harian, laba bersih, uang masuk per metode. PDF 1 halaman/tanggal, Excel 1 baris/tanggal.
export async function GET(request: Request) {
  const session = await requirePermission("finance:read");
  if (session.response) return session.response;
  const parsed = query.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success) return fail(400, "INVALID_QUERY", "Tanggal harus format YYYY-MM-DD.");
  try {
    const config = await loadFinanceConfig();
    const today = jakartaDateKey(new Date(), config.businessDay);
    const from = parsed.data.from ?? parsed.data.to ?? today;
    const to = parsed.data.to ?? from;
    const reports = await getDailyBankReports(from, to);
    const outletName = session.data.profile.outlet.name;
    const base = from === to ? `GarageOS_LaporanHarian_${from}` : `GarageOS_LaporanHarian_${from}_sd_${to}`;
    if (parsed.data.format === "pdf") {
      const pdf = await generateDailyBankReportPdf(reports, outletName);
      return new Response(new Uint8Array(pdf), {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `${new URL(request.url).searchParams.get("inline") === "1" ? "inline" : "attachment"}; filename="${base}.pdf"`,
          "Cache-Control": "no-store",
        },
      });
    }
    if (parsed.data.format === "xlsx") {
      const workbook = await dailyBankReportWorkbook(reports, { outletName, from, to });
      const buffer = await workbook.xlsx.writeBuffer();
      return new Response(new Uint8Array(buffer as ArrayBuffer), {
        headers: {
          "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": `attachment; filename="${base}.xlsx"`,
          "Cache-Control": "no-store",
        },
      });
    }
    return ok({ from, to, outletName, reports });
  } catch (error) {
    if (error instanceof DailyBankReportError) return fail(error.status, error.code, error.message);
    console.error("[daily-bank-report]", error instanceof Error ? error.message : "unknown");
    return fail(500, "REPORT_FAILED", "Laporan harian gagal dibuat.");
  }
}
