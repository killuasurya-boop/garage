import { fail } from "@/lib/api-response";
import { DecisionCenterError, getDecisionDetail } from "@/lib/decision-center-server";
import { decisionPdfFileName, renderDecisionPdf } from "@/lib/decision-pdf";
import { requireGarageSession } from "@/lib/server-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** PDF lembar keputusan (A–J + keputusan/pelaksanaan + audit). Owner langsung saja; baca-saja. */
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await requireGarageSession(["Owner"]);
  if (session.response) return session.response;
  const { id } = await context.params;
  try {
    // stepUp: false — mencetak tidak membuat tantangan 2FA.
    const detail = await getDecisionDetail(session.data, id, { stepUp: false });
    const pdf = await renderDecisionPdf(detail);
    const filename = decisionPdfFileName(detail.approval, detail.checkedAt);
    const inline = new URL(request.url).searchParams.get("inline") === "1";
    return new Response(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    if (error instanceof DecisionCenterError) return fail(error.status, error.code, error.message);
    console.error("[decision-pdf] gagal", error);
    return fail(503, "DECISION_PDF_FAILED", "PDF keputusan belum dapat dibuat.");
  }
}
