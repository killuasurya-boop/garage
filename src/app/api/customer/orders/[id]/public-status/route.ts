import { fail, ok } from "@/lib/api-response";
import { getPublicCustomerOrderStatus } from "@/lib/garage-service";
import { rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const limited = rateLimit(request, "customer-order-status", { limit: 80, windowMs: 60_000 });
  if (limited) return limited;

  const { id } = await context.params;
  const status = await getPublicCustomerOrderStatus(id);
  if (!status) {
    return fail(404, "CUSTOMER_ORDER_NOT_FOUND", "Status order tidak ditemukan.");
  }

  return ok(status);
}
