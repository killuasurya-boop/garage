import { fail, ok } from "@/lib/api-response";
import { canUseApi } from "@/lib/role-access";
import { requireAnyPermission } from "@/lib/server-auth";
import {
  accountabilityFileName,
  officialShiftFileName,
  renderDailyAccountabilityPdf,
  renderShiftAccountabilityPdf,
  type AccountabilityPdfKind,
} from "@/lib/shift-accountability-pdf";
import {
  getPettyCashDay,
  getShiftAccountability,
  listSessionsForBusinessDate,
} from "@/lib/shift-accountability-report";

export const runtime = "nodejs";

const KINDS: AccountabilityPdfKind[] = ["shift", "cashier", "all", "cash", "combined"];

function pdfResponse(pdf: Buffer, filename: string) {
  return new Response(new Uint8Array(pdf), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}

/**
 * Laporan Lengkap Aktivitas Kasir & Pertanggungjawaban Kas (PDF).
 *   ?sessionId=…                         → per shift
 *   ?date=YYYY-MM-DD&kind=cashier&cashierId=… → per kasir (tanggal operasional)
 *   ?date=YYYY-MM-DD&kind=all|cash|combined → seluruh kasir / kas & petty cash / gabungan
 * Kasir: hanya shift miliknya yang SUDAH ditutup (blind count). Owner/Manajer: semua.
 */
export async function GET(request: Request) {
  const session = await requireAnyPermission(["finance:write", "shift:cash"]);
  if (session.response) return session.response;
  const role = session.data.profile.role;
  const admin = role === "Owner" || role === "Manajer" || canUseApi(role, "finance:read");
  const params = new URL(request.url).searchParams;
  const sessionId = params.get("sessionId");

  if (sessionId) {
    const report = await getShiftAccountability(sessionId);
    if (!report) return fail(404, "CASH_SESSION_NOT_FOUND", "Shift tidak ditemukan.");
    if (!admin && report.session.cashierId !== session.data.user.id) {
      return fail(403, "FORBIDDEN", "Kasir hanya bisa mengunduh laporan shift miliknya sendiri.");
    }
    if (!admin && report.session.status === "open") {
      return fail(409, "CASH_SESSION_STILL_OPEN", "Laporan lengkap tersedia setelah shift ditutup.");
    }
    const pdf = await renderShiftAccountabilityPdf(report);
    return pdfResponse(
      pdf,
      // PRD §20.2 jenis A (penamaan resmi + versi final).
      officialShiftFileName({
        outletName: report.session.outletName,
        date: report.session.businessDate,
        shiftCode: report.session.code,
        finalVersion: report.session.finalVersion ?? null,
      }),
    );
  }

  const date = params.get("date") ?? "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return fail(400, "INVALID_DATE", "Tanggal operasional wajib (YYYY-MM-DD).");
  // Daftar shift tanggal itu (untuk pilihan unduhan di layar Riwayat Shift).
  if (params.get("mode") === "sessions") {
    const rows = await listSessionsForBusinessDate({
      outletId: session.data.profile.outlet.id,
      date,
      cashierId: admin ? null : session.data.user.id,
    });
    return ok({ sessions: rows });
  }
  const kind = (params.get("kind") ?? "combined") as AccountabilityPdfKind;
  if (!KINDS.includes(kind) || kind === "shift") return fail(400, "INVALID_KIND", "Jenis laporan tidak dikenal.");
  let cashierId = params.get("cashierId");
  if (!admin) {
    if (kind !== "cashier") return fail(403, "FORBIDDEN", "Kasir hanya bisa mengunduh laporan miliknya sendiri.");
    cashierId = session.data.user.id;
  }
  if (kind === "cashier" && !cashierId) return fail(400, "CASHIER_REQUIRED", "Pilih kasir untuk laporan per kasir.");

  const outletId = session.data.profile.outlet.id;
  const sessions = await listSessionsForBusinessDate({ outletId, date, cashierId: kind === "cashier" ? cashierId : null });
  const loaded = await Promise.all(sessions.map((row) => getShiftAccountability(row.id)));
  const reports = loaded
    .filter((report): report is NonNullable<typeof report> => Boolean(report))
    // Kasir: shift yang masih buka tidak ikut (kas seharusnya dirahasiakan).
    .filter((report) => admin || report.session.status === "closed");
  const petty = kind === "cash" || kind === "combined" ? await getPettyCashDay(outletId, date) : null;
  const cashierName = kind === "cashier" ? (sessions[0]?.cashierName ?? session.data.user.name) : null;
  const pdf = await renderDailyAccountabilityPdf({
    kind,
    date,
    outletName: session.data.profile.outlet.name,
    cashierName,
    reports,
    petty,
  });
  return pdfResponse(pdf, accountabilityFileName({ kind, date, cashierName }));
}
