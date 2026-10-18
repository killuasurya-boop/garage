import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { getDb } from "@/db";
import { orders } from "@/db/schema";
import { fail, ok, readJson } from "@/lib/api-response";
import { createAuditLog } from "@/lib/garage-service";
import { rateLimit } from "@/lib/rate-limit";
import { requirePermission } from "@/lib/server-auth";
import { normalizeWaNumber } from "@/lib/whatsapp-link";

export const runtime = "nodejs";

const schema = z.object({
  phone: z
    .string()
    .trim()
    .max(24)
    .refine((value) => normalizeWaNumber(value) !== "", "Nomor WhatsApp tidak valid (contoh 0812xxxx)."),
});

// Waiter/kasir mencatat nomor WA pelanggan pada order (untuk kirim invoice WA).
export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const limited = rateLimit(request, "order-customer-phone", { limit: 30, windowMs: 60_000 });
  if (limited) return limited;
  const session = await requirePermission("tables:read");
  if (session.response) return session.response;
  const { id } = await context.params;
  if (!z.string().uuid().safeParse(id).success) return fail(400, "INVALID_ORDER_ID", "Order tidak valid.");
  const body = await readJson(request, schema);
  if (body.error) return body.error;

  const phone = normalizeWaNumber(body.data.phone);
  const db = getDb();
  const [updated] = await db
    .update(orders)
    .set({ customerPhone: phone, updatedAt: new Date() })
    .where(and(eq(orders.id, id), eq(orders.outletId, session.data.profile.outlet.id)))
    .returning({ id: orders.id, orderNo: orders.orderNo });
  if (!updated) return fail(404, "ORDER_NOT_FOUND", "Order tidak ditemukan di outlet ini.");
  await createAuditLog({
    actor: `${session.data.user.name} / ${session.data.profile.role}`,
    action: "Order: nomor WA pelanggan dicatat",
    object: updated.orderNo,
    device: session.data.profile.deviceLabel ?? "OS",
  }).catch(() => undefined);
  return ok({ id: updated.id, customerPhone: phone });
}
