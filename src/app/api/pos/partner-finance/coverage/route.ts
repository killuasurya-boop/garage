import { partnerShiftCoverageForDay } from "@/lib/partner-hub-service";
import { partnerRoute, periodFromQuery } from "@/lib/partner-hub-route";
import { requireCashierSession } from "@/lib/server-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Cek silang laporan shift ↔ setoran harian mitra (Owner 16 Nov 2026). Hanya baca. Guard sama dengan Keuangan Mitra di POS
// (kasir, Owner, Manajer). Periode dari ?from=&to= (WIB), sama dengan rekap setoran.
export async function GET(request: Request) {
  const session = await requireCashierSession();
  if (session.response) return session.response;
  const { from, to } = periodFromQuery(new URL(request.url));
  return partnerRoute(() => partnerShiftCoverageForDay(session.data.profile.outlet.id, from, to));
}
