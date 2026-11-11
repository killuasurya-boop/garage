import { fail } from "@/lib/api-response";
import { generatePartnerReport, PartnerHubError } from "@/lib/partner-hub-service";
import { PartnerReportLogoMissingError } from "@/lib/partner-report-pdf";
import { requireCashierSession } from "@/lib/server-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// PDF settlement: ?audience=partner (resmi untuk mitra, default) | internal (Owner/Manajer). ?inline=1 = preview.
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await requireCashierSession();
  if (session.response) return session.response;
  const { id } = await context.params;
  const url = new URL(request.url);
  const audience = url.searchParams.get("audience") === "internal" ? "internal" : "partner";
  if (audience === "internal" && !["Owner", "Manajer"].includes(session.data.profile.role)) {
    return fail(403, "FORBIDDEN", "PDF internal hanya untuk Owner/Manajer.");
  }
  try {
    const result = await generatePartnerReport(id, { audience, outletId: session.data.profile.outlet.id, generatedBy: session.data.user.id });
    return new Response(new Uint8Array(result.buffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `${url.searchParams.get("inline") === "1" ? "inline" : "attachment"}; filename="${result.fileName}"`,
        "Cache-Control": "private, no-store",
        "X-Report-Checksum": result.report.checksum,
      },
    });
  } catch (error) {
    if (error instanceof PartnerHubError) return fail(error.status, error.code, error.message);
    if (error instanceof PartnerReportLogoMissingError) return fail(409, "LOGO_MISSING", error.message);
    throw error;
  }
}
