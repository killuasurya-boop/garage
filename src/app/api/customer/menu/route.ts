import { ok } from "@/lib/api-response";
import { getMenuData } from "@/lib/garage-service";
import { rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const limited = rateLimit(request, "customer-menu", { limit: 120, windowMs: 60_000 });
  if (limited) return limited;

  const url = new URL(request.url);
  return ok(
    await getMenuData({
      category: url.searchParams.get("category") ?? undefined,
      q: url.searchParams.get("q") ?? undefined,
    }),
  );
}
