import { z } from "zod";

import { fail, ok } from "@/lib/api-response";
import { jakartaDateKey } from "@/lib/cash-oversight";
import { getCaseDossier, getDailyDossier, getMonthlyLedger, OwnerReportError } from "@/lib/owner-reports";
import { renderCasePdf, renderDailyClosingPdf, renderMonthlyAuditPdf } from "@/lib/owner-reports-pdf";
import { requireGarageSession } from "@/lib/server-auth";

export const runtime = "nodejs";

const dateKey = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Format tanggal YYYY-MM-DD.");
const querySchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("closing"), date: dateKey.optional(), format: z.enum(["json", "pdf"]).optional() }),
  z.object({
    type: z.literal("monthly"),
    month: z.string().regex(/^\d{4}-\d{2}$/, "Format bulan YYYY-MM.").optional(),
    from: dateKey.optional(),
    to: dateKey.optional(),
    format: z.enum(["json", "pdf"]).optional(),
  }),
  z.object({ type: z.literal("case"), caseId: z.string().uuid("ID kasus tidak valid."), format: z.enum(["json", "pdf"]).optional() }),
]);

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
 */
export async function GET(request: Request) {
  const session = await requireGarageSession(["Owner"]);
  if (session.response) return session.response;
  const parsed = querySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
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
    const dossier = await getCaseDossier({ caseId: query.caseId, outletId });
    return query.format === "pdf" ? pdfResponse(await renderCasePdf(dossier), dossier.meta.fileName) : ok(dossier);
  } catch (error) {
    if (error instanceof OwnerReportError) return fail(error.status, error.code, error.message);
    throw error;
  }
}
