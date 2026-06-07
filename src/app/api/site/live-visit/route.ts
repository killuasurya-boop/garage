import { ok } from "@/lib/api-response";
import { getDisplayCustomerQueue, getPublicTableLiveData } from "@/lib/garage-service";
import { rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const limited = rateLimit(request, "site-live-visit", { limit: 120, windowMs: 60_000 });
  if (limited) return limited;

  const [tables, queue] = await Promise.all([
    getPublicTableLiveData(),
    getDisplayCustomerQueue(),
  ]);

  const queueOrders = queue.filter((order) => order.status === "queue").length;
  const cookingOrders = queue.filter((order) => order.status === "cooking").length;
  const readyOrders = queue.filter((order) => order.status === "ready").length;

  return ok({
    generatedAt: new Date().toISOString(),
    tables,
    orderPulse: {
      active: queueOrders + cookingOrders + readyOrders,
      queue: queueOrders,
      cooking: cookingOrders,
      ready: readyOrders,
    },
  });
}
