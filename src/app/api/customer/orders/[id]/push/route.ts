import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { getDb } from "@/db";
import { orders } from "@/db/schema";
import { fail, ok, readJson } from "@/lib/api-response";
import { rateLimit } from "@/lib/rate-limit";
import { subscribeOrderPush, unsubscribeOrderPush } from "@/lib/web-push-sender";

export const runtime = "nodejs";

const schema = z.object({
  // Bukti kepemilikan pesanan = token invoice/tracking (bukan sekadar id).
  orderToken: z.string().trim().min(12).max(120),
  endpoint: z.string().url().max(1000),
  keys: z.object({ p256dh: z.string().min(1).max(300), auth: z.string().min(1).max(100) }),
});

async function ownedOrder(id: string, orderToken: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const [order] = await getDb()
    .select({ id: orders.id })
    .from(orders)
    .where(and(eq(orders.id, id), eq(orders.invoiceTrackingToken, orderToken)))
    .limit(1);
  return order ?? null;
}

// Pelanggan berlangganan notifikasi status pesanannya (HP terkunci pun tetap dapat).
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const limited = rateLimit(request, "order-push", { limit: 10, windowMs: 60_000 });
  if (limited) return limited;
  const body = await readJson(request, schema);
  if (body.error) return body.error;
  const { id } = await context.params;
  if (!(await ownedOrder(id, body.data.orderToken))) return fail(404, "ORDER_NOT_FOUND", "Pesanan tidak ditemukan.");
  return ok(await subscribeOrderPush({ orderId: id, endpoint: body.data.endpoint, keys: body.data.keys }), { status: 201 });
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  const body = await readJson(request, schema.pick({ orderToken: true, endpoint: true }));
  if (body.error) return body.error;
  const { id } = await context.params;
  if (!(await ownedOrder(id, body.data.orderToken))) return fail(404, "ORDER_NOT_FOUND", "Pesanan tidak ditemukan.");
  return ok(await unsubscribeOrderPush(id, body.data.endpoint));
}
