import { getDisplayCustomerQueue } from "@/lib/garage-service";
import { okWithEtag } from "@/lib/http-etag";
import { rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const limited = rateLimit(request, "display-customer-queue", { limit: 120, windowMs: 60_000 });
  if (limited) return limited;

  const data = await getDisplayCustomerQueue();
  return okWithEtag(request, data);
}
