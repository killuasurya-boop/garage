import { and, asc, eq, inArray, isNull, or } from "drizzle-orm";

import { getDb } from "@/db";
import { kitchenTickets, orders, outlets } from "@/db/schema";
import { deliveryStatusPatch, type DeliveryStatus } from "@/lib/garage-delivery-rules";
import type { GarageSession } from "@/lib/server-auth";

export class CourierError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

// Legacy orders without an outlet belong to the default active outlet used by
// customer ordering, never to every outlet. Owner switches outlets as usual.
export async function deliveryOutletScope(garage: GarageSession, db: Pick<ReturnType<typeof getDb>, "select"> = getDb()) {
  const [primary] = await db.select({ id: outlets.id }).from(outlets)
    .where(eq(outlets.status, "active")).orderBy(asc(outlets.code)).limit(1);
  const own = eq(orders.outletId, garage.profile.outlet.id);
  return primary?.id === garage.profile.outlet.id ? or(own, isNull(orders.outletId))! : own;
}

type DeliveryTx = Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0];

const previous: Record<DeliveryStatus, Array<string | null>> = {
  preparing: [null],
  picked_up: [null, "preparing"],
  on_the_way: [null, "preparing", "picked_up"],
  delivered: ["picked_up", "on_the_way"],
};

/** Same transition contract for courier actions and the legacy cashier API. */
export async function transitionDeliveryInTx(
  tx: DeliveryTx,
  order: typeof orders.$inferSelect,
  next: DeliveryStatus,
  actorName: string,
) {
  if (order.fulfillment !== "delivery") throw new CourierError("Hanya order delivery yang memakai status antar.");
  if (order.status !== "paid") throw new CourierError("Order delivery harus lunas sebelum diantar.");
  if (order.deliveryStatus === next) return { order, changed: false };
  if (!previous[next].includes(order.deliveryStatus)) {
    throw new CourierError("Urutan status antar tidak sesuai. Muat ulang daftar antaran.", 409);
  }
  if (next === "picked_up" || (next === "on_the_way" && order.deliveryStatus !== "picked_up")) {
    const pending = await tx.select({ id: kitchenTickets.id }).from(kitchenTickets)
      .where(and(eq(kitchenTickets.orderId, order.id), inArray(kitchenTickets.status, ["queue", "cooking"])));
    if (pending.length) throw new CourierError("Pesanan masih dibuat Bar/Dapur. Tunggu sampai semua SIAP.", 409);
    const now = new Date();
    await tx.update(kitchenTickets).set({ status: "delivered", deliveredAt: now, deliveredByName: actorName, updatedAt: now })
      .where(and(eq(kitchenTickets.orderId, order.id), eq(kitchenTickets.status, "ready")));
  }
  if (next === "delivered" && !order.deliveryProofUrl) {
    throw new CourierError("Ambil foto bukti terkirim dulu sebelum menandai Sudah sampai.", 409);
  }
  const [updated] = await tx.update(orders).set(deliveryStatusPatch(next, new Date()))
    .where(eq(orders.id, order.id)).returning();
  return { order: updated, changed: true };
}
