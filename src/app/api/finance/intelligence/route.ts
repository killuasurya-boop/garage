import { fail, ok } from "@/lib/api-response";
import { parseFinancePeriod } from "@/lib/finance-control-api";
import { FORECAST_HORIZONS } from "@/lib/finance-intelligence-core";
import { getFinanceIntelligence } from "@/lib/finance-intelligence";
import { requirePermission } from "@/lib/server-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Product profitability + forecast (PROYEKSI) + CEO brief + base What-If.
export async function GET(request: Request) {
  const session = await requirePermission("finance:read");
  if (session.response) {
    return session.response;
  }
  const period = parseFinancePeriod(request);
  if (period.error) {
    return period.error;
  }
  const horizonRaw = Number(new URL(request.url).searchParams.get("horizon") ?? "6");
  const horizon = (FORECAST_HORIZONS as readonly number[]).includes(horizonRaw) ? horizonRaw : 6;
  try {
    return ok(await getFinanceIntelligence({ ...period.data, horizon }));
  } catch (error) {
    console.error("[finance/intelligence]", error);
    return fail(500, "FINANCE_ENGINE_ERROR", "Gagal menghitung data intelligence.");
  }
}
