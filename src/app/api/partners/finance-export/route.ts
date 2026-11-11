import { partnerFinanceWorkbook } from "@/lib/partner-finance-xlsx";
import { listPartners, partnerFinanceSummary } from "@/lib/partner-hub-service";
import { partnerRoute, periodFromQuery } from "@/lib/partner-hub-route";
import { requireOwnerOrManager } from "@/lib/server-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Excel Keuangan Mitra (ringkasan, produk terlaris, transaksi). Owner/Manajer saja: berisi HPP & profit.
export async function GET(request: Request) {
  const session = await requireOwnerOrManager();
  if (session.response) return session.response;
  const url = new URL(request.url);
  const { from, to } = periodFromQuery(url);
  const partnerId = url.searchParams.get("partnerId");
  const key = (d: Date) => new Date(d.getTime() + 7 * 3_600_000).toISOString().slice(0, 10);
  const fromKey = key(from);
  const toKey = key(new Date(to.getTime() - 1));
  try {
    const outletId = session.data.profile.outlet.id;
    const all = await listPartners(session.data);
    // Angka historis tidak bergantung status mitra sekarang: mitra nonaktif tetap ikut bila punya transaksi di periode.
    const targets = all.filter((p) => (partnerId ? p.id === partnerId : true));
    const rows = await Promise.all(
      targets.map(async (p) => {
        const s = await partnerFinanceSummary(p.id, outletId, from, to);
        return { partnerName: p.name, partnerCode: p.code, orderCount: s.orderCount, netSales: s.netSales, totalCost: s.totalCost, garageProfit: s.garageProfit, liabilityTotal: s.liabilityTotal, paidAmount: s.paidAmount, outstanding: s.outstanding, lines: s.lines };
      }),
    );
    const partners = partnerId ? rows : rows.filter((r) => r.lines.length > 0 || r.liabilityTotal !== 0 || r.paidAmount !== 0);
    const buffer = await partnerFinanceWorkbook({ from: fromKey, to: toKey, generatedBy: session.data.user.name ?? session.data.profile.role, partners });
    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="GarageOS_KeuanganMitra_${fromKey}_${toKey}.xlsx"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return partnerRoute(async () => {
      throw error;
    });
  }
}
