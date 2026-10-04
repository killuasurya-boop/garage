import { getPublicTableLiveData } from "@/lib/garage-service";
import { okWithEtag } from "@/lib/http-etag";
import { rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const limited = rateLimit(request, "customer-tables-live", { limit: 90, windowMs: 60_000 });
  if (limited) return limited;

  // QR yang membawa outletId (multi-outlet) → meja outlet itu; tanpa itu → outlet default.
  const outletParam = new URL(request.url).searchParams.get("outletId");
  const outletId =
    outletParam && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(outletParam)
      ? outletParam
      : null;
  const data = await getPublicTableLiveData(outletId);
  return okWithEtag(request, data);
}
