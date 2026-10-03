import { ok } from "@/lib/api-response";
import { getCustomerOrderingStatus } from "@/lib/garage-service";
import { rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// Publik (halaman /order): apakah outlet sedang menerima order QR (ada shift kasir buka).
export async function GET(request: Request) {
  const limited = rateLimit(request, "customer-ordering-status", { limit: 60, windowMs: 60_000 });
  if (limited) return limited;

  const outletId = new URL(request.url).searchParams.get("outletId") ?? undefined;
  return ok(await getCustomerOrderingStatus(outletId && UUID_RE.test(outletId) ? outletId : undefined));
}
