import { fail } from "@/lib/api-response";
import {
  getCashSessionSummary,
  getCashSessionTransactions,
} from "@/lib/garage-service";
import { generateShiftReportPdf } from "@/lib/garage-shift-report-pdf";
import { canUseApi } from "@/lib/role-access";
import { requireAnyPermission } from "@/lib/server-auth";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const session = await requireAnyPermission(["finance:write", "shift:cash"]);
  if (session.response) {
    return session.response;
  }

  const { id } = await context.params;
  const allowAll = canUseApi(session.data.profile.role, "finance:read");
  const [summary, transactions] = await Promise.all([
    getCashSessionSummary(id, session.data.user.id, { allowAll }),
    getCashSessionTransactions(id, session.data.user.id, { allowAll }),
  ]);

  if (!summary || !transactions) {
    return fail(
      404,
      "CASH_SESSION_NOT_FOUND",
      "Sesi tidak ditemukan atau bukan milik kasir ini.",
    );
  }

  // Blind count: PDF memuat kas seharusnya, jadi Kasir baru bisa mengunduhnya
  // setelah shift ditutup.
  if (session.data.profile.role === "Kasir" && summary.session.status === "open") {
    return fail(
      409,
      "CASH_SESSION_STILL_OPEN",
      "Laporan PDF shift tersedia setelah shift ditutup.",
    );
  }

  const pdf = await generateShiftReportPdf(summary, transactions);
  const filename = `shift-${summary.session.code}.pdf`;

  return new Response(new Uint8Array(pdf), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
