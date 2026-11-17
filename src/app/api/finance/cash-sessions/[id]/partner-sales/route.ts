import { partnerSalesForCashSession } from "@/lib/partner-hub-service";
import { partnerRoute } from "@/lib/partner-hub-route";
import { canUseApi } from "@/lib/role-access";
import { requireAnyPermission } from "@/lib/server-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Penjualan mitra satu shift (Owner 16 Nov 2026): penjualan, modal mitra (wajib bayar), profit Garage per mitra & produk.
// Guard sama dengan /summary: Kasir hanya shift miliknya. Shift terbuka boleh — tidak memuat uang laci / kas seharusnya.
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await requireAnyPermission(["finance:write", "shift:cash"]);
  if (session.response) return session.response;
  const { id } = await context.params;
  return partnerRoute(() => partnerSalesForCashSession(id, session.data, { allowAll: canUseApi(session.data.profile.role, "finance:read") }));
}
