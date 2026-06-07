import { ok } from "@/lib/api-response";
import { getPublicLiveTrackingData } from "@/lib/garage-service";
import { rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const limited = rateLimit(request, "site-live-tracking", { limit: 120, windowMs: 60_000 });
  if (limited) return limited;

  const data = await getPublicLiveTrackingData();
  return ok(data);
}
