import { fail } from "@/lib/api-response";
import {
  getOwnerReportData,
  jakartaTodayKey,
} from "@/lib/garage-owner-report";
import { generateOwnerReportPdf } from "@/lib/garage-owner-report-pdf";
import { generateOwnerReportXlsx } from "@/lib/garage-owner-report-xlsx";
import { requirePermission } from "@/lib/server-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/owner/daily-brief/export?format=pdf|xlsx&date=YYYY-MM-DD
export async function GET(request: Request) {
  const session = await requirePermission("dashboard:read");
  if (session.response) return session.response;

  const url = new URL(request.url);
  const format = (url.searchParams.get("format") ?? "pdf").toLowerCase();
  const dateText = url.searchParams.get("date") ?? jakartaTodayKey();

  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateText)) {
    return fail(400, "INVALID_DATE", "date harus format YYYY-MM-DD.");
  }
  if (format !== "pdf" && format !== "xlsx") {
    return fail(400, "INVALID_FORMAT", "format harus pdf atau xlsx.");
  }

  try {
    const data = await getOwnerReportData(dateText);

    if (format === "xlsx") {
      const buffer = await generateOwnerReportXlsx(data);
      return new Response(buffer, {
        headers: {
          "Content-Type":
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": `attachment; filename="garage-owner-report-${dateText}.xlsx"`,
          "Cache-Control": "no-store",
        },
      });
    }

    const pdf = await generateOwnerReportPdf(data);
    return new Response(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="garage-owner-report-${dateText}.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("owner/daily-brief/export error:", error);
    return fail(500, "INTERNAL_ERROR", "Gagal menyusun laporan owner.");
  }
}
