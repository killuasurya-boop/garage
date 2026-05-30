import { ok } from "@/lib/api-response";
import { getDisplayCustomerQueue } from "@/lib/garage-service";
import { rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const limited = rateLimit(request, "display-customer-queue", { limit: 120, windowMs: 60_000 });
  if (limited) return limited;

  return ok(await getDisplayCustomerQueue());
}
