import { fail, ok } from "@/lib/api-response";
import { getCashLedgerReport } from "@/lib/cash-ledger-report";
import { renderCashLedgerPdf } from "@/lib/cash-ledger-pdf";
import { cashLedgerWorkbook } from "@/lib/cash-ledger-xlsx";
import { jakartaDateKey } from "@/lib/cash-oversight";
import { getCaseDossier, getDailyDossier, getMonthlyLedger, OwnerReportError } from "@/lib/owner-reports";
import { renderCasePdf, renderDailyClosingPdf, renderMonthlyAuditPdf } from "@/lib/owner-reports-pdf";
import { ownerOfficialQuery } from "@/lib/owner-reports-query";
import { requireGarageSession } from "@/lib/server-auth";

export const runtime = "nodejs";

function pdfResponse(pdf: Buffer, filename: string) {
  return new Response(new Uint8Array(pdf), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${filename}"`, "Cache-Control": "no-store" },
  });
}

function monthRange(month: string, today: string) {
  const [year, mon] = month.split("-").map(Number);
  const last = new Date(Date.UTC(year, mon, 0)).getUTCDate();
  const end = `${month}-${String(last).padStart(2, "0")}`;
  return { from: `${month}-01`, to: end < today ? end : today };
}

/**
 * B7b — laporan resmi Owner (PRD §13.5, §16.1, §20.2), Owner saja.
 *   ?type=closing&date=YYYY-MM-DD[&format=pdf]   → Owner 360 harian / PDF B CLOSING
 *   ?type=monthly&month=YYYY-MM | from&to [&format=pdf] → ledger bulanan / PDF C FINANCIAL_AUDIT
 *   ?type=case&caseId=…[&format=pdf]             → dossier kasus / PDF D CASE
 *   ?type=ledger&month=YYYY-MM | from&to [&format=pdf|xlsx] → buku kas rinci & arus kas (F38/F35), semua outlet
 */
export async function GET(request: Request) {
  const session = await requireGarageSession(["Owner"]);
  if (session.response) return session.response;
  const parsed = ownerOfficialQuery.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success) return fail(400, "INVALID_QUERY", parsed.error.issues[0]?.message ?? "Parameter tidak valid.");
  const outletId = session.data.profile.outlet.id;
  const today = jakartaDateKey(new Date());
  const query = parsed.data;
  try {
    if (query.type === "closing") {
      const dossier = await getDailyDossier({ outletId, date: query.date ?? today });
      return query.format === "pdf" ? pdfResponse(await renderDailyClosingPdf(dossier), dossier.meta.fileName) : ok(dossier);
    }
    if (query.type === "monthly") {
      const range = query.from && query.to ? { from: query.from, to: query.to } : monthRange(query.month ?? today.slice(0, 7), today);
      const ledger = await getMonthlyLedger({ outletId, ...range });
      return query.format === "pdf" ? pdfResponse(await renderMonthlyAuditPdf(ledger), ledger.meta.fileName) : ok(ledger);
    }
    if (query.type === "ledger") {
      const range = query.from && query.to ? { from: query.from, to: query.to } : monthRange(query.month ?? today.slice(0, 7), today);
      // Rekening & setoran bersifat global → buku kas semua outlet (sama dengan Pengawasan Kas).
      const report = await getCashLedgerReport({ ...range, outletId: null });
      if (query.format === "pdf") return pdfResponse(await renderCashLedgerPdf(report), `${report.meta.fileBase}.pdf`);
      if (query.format === "xlsx") {
        return new Response(new Uint8Array(await cashLedgerWorkbook(report)), {
          headers: {
            "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            "Content-Disposition": `attachment; filename="${report.meta.fileBase}.xlsx"`,
            "Cache-Control": "no-store",
          },
        });
      }
      return ok(report);
    }
    const dossier = await getCaseDossier({ caseId: query.caseId, outletId });
    return query.format === "pdf" ? pdfResponse(await renderCasePdf(dossier), dossier.meta.fileName) : ok(dossier);
  } catch (error) {
    if (error instanceof OwnerReportError) return fail(error.status, error.code, error.message);
    throw error;
  }
}
