import { fail } from "@/lib/api-response";
import { requirePartnerSession } from "@/lib/partner-auth";
import { generatePartnerReport, PartnerHubError } from "@/lib/partner-hub-service";
import { PartnerReportLogoMissingError } from "@/lib/partner-report-pdf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// PDF resmi FINAL untuk mitra yang login (hanya settlement miliknya; tautan privat, butuh sesi).
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await requirePartnerSession(request);
  if (session.response) return session.response;
  const { id } = await context.params;
  try {
    const result = await generatePartnerReport(id, {
      audience: "partner",
      outletId: session.data.partner.outletId,
      partnerId: session.data.partner.id,
      generatedBy: null,
    });
    return new Response(new Uint8Array(result.buffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${result.fileName}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    if (error instanceof PartnerHubError) return fail(error.status, error.code, error.message);
    if (error instanceof PartnerReportLogoMissingError) return fail(409, "LOGO_MISSING", error.message);
    throw error;
  }
}
