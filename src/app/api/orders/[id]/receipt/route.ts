import { fail, ok } from "@/lib/api-response";
import { getOrderForReceipt } from "@/lib/garage-service";
import { requirePermission } from "@/lib/server-auth";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const session = await requirePermission("orders:read");
  if (session.response) {
    return session.response;
  }

  const { id } = await context.params;
  const data = await getOrderForReceipt(id);
  if (!data) {
    return fail(404, "ORDER_NOT_FOUND", "Order tidak ditemukan.");
  }
  return ok(data);
}
