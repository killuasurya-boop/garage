import { ok } from "@/lib/api-response";
import { getPublicTableLiveData } from "@/lib/garage-service";
import { rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const limited = rateLimit(request, "customer-tables-live", { limit: 90, windowMs: 60_000 });
  if (limited) return limited;

  return ok(await getPublicTableLiveData(), {
    headers: {
      "Cache-Control": "no-store",
    },
  });
}
