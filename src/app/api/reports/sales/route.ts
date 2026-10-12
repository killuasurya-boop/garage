import { and, desc, eq } from "drizzle-orm";

import { getDb } from "@/db";
import { cashSessions } from "@/db/schema";
import { fail, ok } from "@/lib/api-response";
import { canUseApiAs } from "@/lib/role-access";
import { getSalesReport, isDateKey } from "@/lib/sales-report";
import { requireAnyPermission } from "@/lib/server-auth";

export const runtime = "nodejs";

function todayWib() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(new Date());
}

/**
 * Laporan penjualan. Owner/Manajer (finance:read): rentang tanggal outlet,
 * opsional `sessionId`. Kasir: selalu shift miliknya (aktif, atau terakhir).
 */
export async function GET(request: Request) {
  const session = await requireAnyPermission(["finance:read", "shift:cash"]);
  if (session.response) return session.response;

  const url = new URL(request.url);
  const from = url.searchParams.get("from") ?? todayWib();
  const to = url.searchParams.get("to") ?? from;
  if (!isDateKey(from) || !isDateKey(to) || from > to) {
    return fail(400, "INVALID_RANGE", "Rentang tanggal tidak valid (YYYY-MM-DD, dari ≤ sampai).");
  }
  const days = (new Date(`${to}T00:00:00Z`).getTime() - new Date(`${from}T00:00:00Z`).getTime()) / 86_400_000;
  if (days > 92) {
    return fail(400, "RANGE_TOO_LONG", "Rentang maksimal 3 bulan.");
  }

  const outletId = session.data.profile.outlet.id;
  const isSupervisor = canUseApiAs(session.data.profile, "finance:read");
  let sessionId = isSupervisor ? url.searchParams.get("sessionId") : null;

  if (!isSupervisor) {
    // Kasir hanya melihat shift sendiri: yang sedang buka, atau terakhir.
    const [own] = await getDb()
      .select({ id: cashSessions.id })
      .from(cashSessions)
      .where(and(eq(cashSessions.openedBy, session.data.user.id), eq(cashSessions.outletId, outletId)))
      .orderBy(desc(cashSessions.openedAt))
      .limit(1);
    if (!own) {
      return ok({ report: null, message: "Belum ada shift. Buka shift dulu untuk melihat penjualan." });
    }
    sessionId = own.id;
  }

  const report = await getSalesReport({ outletId, range: { from, to }, sessionId });
  return ok({ report });
}
