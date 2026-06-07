import { fail, ok } from "@/lib/api-response";
import { getProfitMaxDashboardData } from "@/lib/profitmax-service";
import { requirePermission } from "@/lib/server-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const session = await requirePermission("dashboard:read");
  if (session.response) return session.response;

  try {
    const data = await getProfitMaxDashboardData();
    return ok(data, {
      headers: {
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("profitmax/dashboard error:", error);
    return fail(500, "INTERNAL_ERROR", "Gagal memuat dashboard ProfitMax");
  }
}
