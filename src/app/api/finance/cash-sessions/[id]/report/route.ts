import { fail } from "@/lib/api-response";
import {
  getCashSessionSummary,
  getCashSessionTransactions,
} from "@/lib/garage-service";
import { generateShiftReportPdf } from "@/lib/garage-shift-report-pdf";
import { partnerSalesForCashSession } from "@/lib/partner-hub-service";
import { salesHppForOrders } from "@/lib/sales-hpp-report";
import { canSeeProductHpp } from "@/lib/sales-hpp-summary";
import { canUseApi } from "@/lib/role-access";
import { requireAnyPermission } from "@/lib/server-auth";

export const runtime = "nodejs";

export async function GET(
  request: Request,
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

  // Penjualan mitra (Partner Hub). Gagal dimuat = PDF tetap jadi tanpa seksi mitra.
  const partners = await partnerSalesForCashSession(id, session.data, { allowAll }).catch(() => null);
  // Ringkasan cup/porsi per kategori & produk; HPP/laba hanya Owner & Manajer. Gagal dimuat = PDF tetap jadi.
  const salesSummary = await salesHppForOrders(transactions.orders.map((order) => order.id)).catch(() => null);
  const sales = salesSummary ? { summary: salesSummary, showHpp: canSeeProductHpp(session.data.profile.role) } : null;
  const pdf = await generateShiftReportPdf(summary, transactions, partners, sales);
  const filename = `shift-${summary.session.code}.pdf`;

  return new Response(new Uint8Array(pdf), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      // ?inline=1 = tampil di popup POS (tanpa tab baru), selain itu unduh.
      "Content-Disposition": `${new URL(request.url).searchParams.get("inline") === "1" ? "inline" : "attachment"}; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
