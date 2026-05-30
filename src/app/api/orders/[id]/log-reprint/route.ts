import { and, count, eq } from "drizzle-orm";

import { fail, ok } from "@/lib/api-response";
import { getDb } from "@/db";
import { auditLogs } from "@/db/schema";
import {
  createAuditLog,
  getOrderForReceipt,
  roleDisplayName,
} from "@/lib/garage-service";
import { requirePermission } from "@/lib/server-auth";

export const runtime = "nodejs";

const MAX_REPRINTS = 3;
const REPRINT_ACTION_PREFIX = "Reprint receipt";

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const session = await requirePermission("orders:read");
  if (session.response) {
    return session.response;
  }

  const { id } = await context.params;
  const orderData = await getOrderForReceipt(id);
  if (!orderData) {
    return fail(404, "ORDER_NOT_FOUND", "Order tidak ditemukan.");
  }

  if (orderData.order.status !== "paid") {
    return fail(
      422,
      "ORDER_NOT_PAID",
      "Struk hanya bisa dicetak ulang untuk order yang sudah lunas.",
    );
  }

  const db = getDb();
  const [countRow] = await db
    .select({ c: count(auditLogs.id) })
    .from(auditLogs)
    .where(
      and(
        eq(auditLogs.object, orderData.order.id),
        eq(auditLogs.action, `${REPRINT_ACTION_PREFIX} ${orderData.order.orderNo}`),
      ),
    );

  const currentCount = Number(countRow?.c ?? 0);
  if (currentCount >= MAX_REPRINTS) {
    return fail(
      429,
      "REPRINT_LIMIT_REACHED",
      `Batas cetak ulang ${MAX_REPRINTS}x sudah tercapai untuk order ini.`,
    );
  }

  await createAuditLog({
    actor: `${session.data.user.name} / ${roleDisplayName[session.data.profile.role]}`,
    action: `${REPRINT_ACTION_PREFIX} ${orderData.order.orderNo}`,
    object: orderData.order.id,
    device: session.data.profile.deviceLabel,
    metadata: {
      orderNo: orderData.order.orderNo,
      invoiceNo: orderData.order.invoiceNo,
      reprintNumber: currentCount + 1,
      maxReprints: MAX_REPRINTS,
    },
  });

  return ok({
    count: currentCount + 1,
    max: MAX_REPRINTS,
    remaining: MAX_REPRINTS - (currentCount + 1),
  });
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const session = await requirePermission("orders:read");
  if (session.response) {
    return session.response;
  }

  const { id } = await context.params;
  const orderData = await getOrderForReceipt(id);
  if (!orderData) {
    return fail(404, "ORDER_NOT_FOUND", "Order tidak ditemukan.");
  }

  const db = getDb();
  const [countRow] = await db
    .select({ c: count(auditLogs.id) })
    .from(auditLogs)
    .where(
      and(
        eq(auditLogs.object, orderData.order.id),
        eq(auditLogs.action, `${REPRINT_ACTION_PREFIX} ${orderData.order.orderNo}`),
      ),
    );

  const currentCount = Number(countRow?.c ?? 0);
  return ok({
    count: currentCount,
    max: MAX_REPRINTS,
    remaining: Math.max(0, MAX_REPRINTS - currentCount),
    canReprint: orderData.order.status === "paid" && currentCount < MAX_REPRINTS,
  });
}
