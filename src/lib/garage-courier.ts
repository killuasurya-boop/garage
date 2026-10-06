// =============================================================================
// Kurir delivery (keputusan owner Okt 2026): kurir = akun sendiri (role Waiter,
// workstation "kurir"). Kasir menugaskan kurir ke order delivery yang sudah
// lunas; kurir mengubah status antar dan mengirim GPS selama pengantaran supaya
// pelanggan bisa melihat posisi kurir. GPS dihapus begitu pesanan sampai.
// Juga: tolak otomatis order take away/delivery yang tidak dibayar tepat waktu.
// =============================================================================

import { and, asc, desc, eq, gte, inArray, isNull, lt, ne, or } from "drizzle-orm";

import { getDb } from "@/db";
import { auditLogs, kitchenTickets, orderItems, orders, outlets, staffProfiles, user } from "@/db/schema";
import {
  acceptsCourierLocation,
  AUTO_REJECT_REASON,
  DELIVERY_STATUSES,
  deliveryStatusPatch,
  isUnpaidOrderExpired,
  validLatLng,
  type DeliveryStatus,
} from "@/lib/garage-delivery-rules";
import type { Role } from "@/lib/garage-data";
import { isCourierProfile } from "@/lib/garage-production-rules";
import { canHandleMoney, MANAGEMENT_ROLES } from "@/lib/role-access";
import { announceOrderProgress, getAppSettings, roleDisplayName, updateCustomerOrderStatus } from "@/lib/garage-service";
import { notifyStaff } from "@/lib/staff-notifications";
import { publishProductionChange } from "@/lib/production-events";
import type { GarageSession } from "@/lib/server-auth";

export class CourierError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}

function timeLabel() {
  return new Intl.DateTimeFormat("id-ID", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    timeZone: "Asia/Jakarta",
  }).format(new Date());
}

function actorOf(garage: GarageSession) {
  return `${garage.user.name} / ${roleDisplayName[garage.profile.role]}`;
}

const isManagement = (garage: GarageSession) => MANAGEMENT_ROLES.includes(garage.profile.role);
const isCourier = (garage: GarageSession) => isCourierProfile(garage.profile);
const canDispatch = (garage: GarageSession) =>
  canHandleMoney({ role: garage.profile.role, workstation: garage.profile.workstation, position: garage.profile.position });

export type CourierOption = { userId: string; name: string; activeDeliveries: number };

/** Kurir aktif di outlet + jumlah antaran yang sedang dibawa (untuk pilihan kasir). */
export async function listCouriers(garage: GarageSession): Promise<CourierOption[]> {
  const db = getDb();
  const rows = await db
    .select({ userId: staffProfiles.userId, name: user.name, workstation: staffProfiles.workstation })
    .from(staffProfiles)
    .innerJoin(user, eq(user.id, staffProfiles.userId))
    .where(
      and(
        eq(staffProfiles.outletId, garage.profile.outlet.id),
        eq(staffProfiles.role, "Waiter"),
        eq(staffProfiles.status, "active"),
        eq(staffProfiles.workstation, "kurir"),
      ),
    )
    .orderBy(asc(user.name));
  if (!rows.length) return [];
  const active = await db
    .select({ courierUserId: orders.courierUserId })
    .from(orders)
    .where(
      and(
        inArray(
          orders.courierUserId,
          rows.map((row) => row.userId),
        ),
        eq(orders.fulfillment, "delivery"),
        or(isNull(orders.deliveryStatus), ne(orders.deliveryStatus, "delivered")),
        ne(orders.status, "rejected"),
      ),
    );
  return rows.map((row) => ({
    userId: row.userId,
    name: row.name,
    activeDeliveries: active.filter((entry) => entry.courierUserId === row.userId).length,
  }));
}

async function lockDeliveryOrder(tx: Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0], orderId: string) {
  const [order] = await tx.select().from(orders).where(eq(orders.id, orderId)).limit(1).for("update");
  if (!order) throw new CourierError("Order tidak ditemukan.", 404);
  if (order.fulfillment !== "delivery") throw new CourierError("Hanya order delivery yang memakai kurir.");
  return order;
}

/** Kasir/Manajer/Owner menugaskan (atau melepas, courierUserId=null) kurir. */
export async function assignCourier(orderId: string, courierUserId: string | null, garage: GarageSession) {
  if (!canDispatch(garage)) throw new CourierError("Hanya kasir, manajer, atau owner yang bisa menugaskan kurir.", 403);
  const db = getDb();
  const result = await db.transaction(async (tx) => {
    const order = await lockDeliveryOrder(tx, orderId);
    if (order.status !== "paid") throw new CourierError("Order delivery harus lunas sebelum ditugaskan ke kurir.");
    if (order.deliveryStatus === "delivered") throw new CourierError("Pesanan sudah selesai diantar.");
    let courierName: string | null = null;
    if (courierUserId) {
      const [courier] = await tx
        .select({ userId: staffProfiles.userId, name: user.name })
        .from(staffProfiles)
        .innerJoin(user, eq(user.id, staffProfiles.userId))
        .where(
          and(
            eq(staffProfiles.userId, courierUserId),
            eq(staffProfiles.role, "Waiter"),
            eq(staffProfiles.workstation, "kurir"),
            eq(staffProfiles.status, "active"),
          ),
        )
        .limit(1);
      if (!courier) throw new CourierError("Kurir tidak ditemukan atau tidak aktif.");
      courierName = courier.name;
    } else if (order.deliveryStatus === "picked_up" || order.deliveryStatus === "on_the_way") {
      throw new CourierError("Pesanan sedang dibawa kurir — tidak bisa dilepas.");
    }
    const now = new Date();
    const [updated] = await tx
      .update(orders)
      .set({
        courierUserId,
        courierName,
        deliveryStatus: order.deliveryStatus ?? "preparing",
        courierLat: null,
        courierLng: null,
        courierLocationAt: null,
        updatedAt: now,
      })
      .where(eq(orders.id, order.id))
      .returning();
    await tx.insert(auditLogs).values({
      time: timeLabel(),
      actor: actorOf(garage),
      action: courierUserId ? `Tugaskan kurir ${order.orderNo}` : `Lepas kurir ${order.orderNo}`,
      object: courierName ?? "-",
      device: garage.profile.deviceLabel,
      status: updated.deliveryStatus ?? "preparing",
      metadata: { orderId: order.id, from: order.courierUserId, to: courierUserId },
    });
    return updated;
  });
  publishProductionChange();
  if (courierUserId) {
    // Kurir langsung diberi tahu (layar mana pun + HP terkunci lewat push).
    await notifyStaff({
      outletId: result.outletId,
      audience: "user",
      userId: courierUserId,
      kind: "courier_assigned",
      severity: "urgent",
      title: `Antaran baru ${result.orderNo}`,
      body: `${result.customerName ?? "Pelanggan"} · ${result.deliveryAddress ?? "-"}`.slice(0, 200),
      url: "/os?module=courier",
      orderId: result.id,
      dedupKey: `courier_assigned:${result.id}:${courierUserId}`,
    }).catch(() => null);
    await announceOrderProgress(result.id, "courier_assigned", { courierName: result.courierName }).catch(() => null);
  }
  return courierOrderView(result);
}

const COURIER_ACTIONS: Record<string, { to: DeliveryStatus; from: Array<string | null> }> = {
  pickup: { to: "picked_up", from: [null, "preparing"] },
  depart: { to: "on_the_way", from: [null, "preparing", "picked_up"] },
  arrive: { to: "delivered", from: ["picked_up", "on_the_way"] },
};

/** Kurir yang ditugaskan (atau Owner/Manajer) memajukan status antar. */
export async function courierDeliveryAction(orderId: string, action: string, garage: GarageSession) {
  const rule = COURIER_ACTIONS[action];
  if (!rule) throw new CourierError("Aksi kurir tidak dikenal.");
  const db = getDb();
  const result = await db.transaction(async (tx) => {
    const order = await lockDeliveryOrder(tx, orderId);
    if (order.courierUserId !== garage.user.id && !isManagement(garage)) {
      throw new CourierError("Pesanan ini tidak ditugaskan ke Anda.", 403);
    }
    if (order.status !== "paid") throw new CourierError("Order belum lunas.");
    if (order.deliveryStatus === rule.to) return order; // idempoten (tombol ditekan dua kali)
    if (!rule.from.includes(order.deliveryStatus ?? null)) {
      throw new CourierError("Urutan status antar tidak sesuai. Muat ulang daftar antaran.");
    }
    const now = new Date();
    const [updated] = await tx
      .update(orders)
      .set(deliveryStatusPatch(rule.to, now))
      .where(eq(orders.id, order.id))
      .returning();
    await tx.insert(auditLogs).values({
      time: timeLabel(),
      actor: actorOf(garage),
      action: `Delivery status ${order.orderNo}`,
      object: order.deliveryAddress ?? order.tableLabel,
      device: garage.profile.deviceLabel,
      status: rule.to,
      metadata: { orderId: order.id, from: order.deliveryStatus, to: rule.to, by: "courier" },
    });
    return updated;
  });
  publishProductionChange();
  if (rule.to === "on_the_way" || rule.to === "delivered") {
    await announceOrderProgress(result.id, rule.to, { courierName: result.courierName }).catch(() => null);
  }
  return courierOrderView(result);
}

/** Posisi GPS kurir — hanya kurir yang ditugaskan, hanya saat pesanan dibawa. */
export async function updateCourierLocation(orderId: string, lat: unknown, lng: unknown, garage: GarageSession) {
  const point = validLatLng(lat, lng);
  if (!point) throw new CourierError("Koordinat GPS tidak valid.");
  const db = getDb();
  const [order] = await db
    .select({ id: orders.id, courierUserId: orders.courierUserId, deliveryStatus: orders.deliveryStatus })
    .from(orders)
    .where(eq(orders.id, orderId))
    .limit(1);
  if (!order) throw new CourierError("Order tidak ditemukan.", 404);
  if (order.courierUserId !== garage.user.id) throw new CourierError("Pesanan ini tidak ditugaskan ke Anda.", 403);
  if (!acceptsCourierLocation(order.deliveryStatus)) {
    throw new CourierError("Lokasi hanya dikirim saat pesanan sedang diantar.", 409);
  }
  const now = new Date();
  await db
    .update(orders)
    .set({ courierLat: point.lat, courierLng: point.lng, courierLocationAt: now })
    .where(eq(orders.id, order.id));
  return { ok: true, at: now.toISOString() };
}

export type CourierOrderView = ReturnType<typeof courierOrderView>;

function courierOrderView(row: typeof orders.$inferSelect, items: Array<{ itemName: string; variantLabel: string | null; qty: number }> = [], readyStations?: { total: number; ready: number }) {
  return {
    id: row.id,
    orderNo: row.orderNo,
    status: row.status,
    customerName: row.customerName,
    customerPhone: row.customerPhone,
    deliveryAddress: row.deliveryAddress,
    deliveryFee: row.deliveryFee ?? 0,
    deliveryStatus: row.deliveryStatus,
    total: row.total,
    courierUserId: row.courierUserId,
    courierName: row.courierName,
    courierLocationAt: row.courierLocationAt?.toISOString() ?? null,
    customerLat: row.customerLat ?? null,
    customerLng: row.customerLng ?? null,
    invoiceTrackingToken: row.invoiceTrackingToken,
    createdAt: row.createdAt.toISOString(),
    deliveredAt: row.deliveredAt?.toISOString() ?? null,
    items: items.map((item) => ({ name: item.itemName, variant: item.variantLabel, qty: item.qty })),
    production: readyStations ?? null,
  };
}

/**
 * Daftar antaran: kurir melihat miliknya (aktif + selesai hari ini); Owner/Manajer
 * & kasir melihat semua delivery lunas yang belum selesai + selesai hari ini.
 */
export async function getCourierBoard(garage: GarageSession) {
  if (!isCourier(garage) && !isManagement(garage) && !canDispatch(garage)) {
    throw new CourierError("Modul kurir hanya untuk kurir, kasir, manajer, atau owner.", 403);
  }
  const db = getDb();
  const since = new Date(Date.now() - 18 * 60 * 60 * 1000);
  const scope = isCourier(garage) ? [eq(orders.courierUserId, garage.user.id)] : [];
  const rows = await db
    .select()
    .from(orders)
    .where(
      and(
        eq(orders.fulfillment, "delivery"),
        eq(orders.status, "paid"),
        ...scope,
        // Aktif (belum sampai) + yang selesai diantar dalam 18 jam terakhir.
        or(isNull(orders.deliveryStatus), ne(orders.deliveryStatus, "delivered"), gte(orders.deliveredAt, since)),
      ),
    )
    .orderBy(desc(orders.createdAt))
    .limit(60);
  const ids = rows.map((row) => row.id);
  const items = ids.length
    ? await db
        .select({ orderId: orderItems.orderId, itemName: orderItems.itemName, variantLabel: orderItems.variantLabel, qty: orderItems.qty })
        .from(orderItems)
        .where(inArray(orderItems.orderId, ids))
    : [];
  const tickets = ids.length
    ? await db
        .select({ orderId: kitchenTickets.orderId, status: kitchenTickets.status })
        .from(kitchenTickets)
        .where(inArray(kitchenTickets.orderId, ids))
    : [];
  const views = rows.map((row) => {
    const live = tickets.filter((ticket) => ticket.orderId === row.id && !["rejected", "canceled", "cancelled"].includes(ticket.status));
    return courierOrderView(
      row,
      items.filter((item) => item.orderId === row.id),
      { total: live.length, ready: live.filter((ticket) => ticket.status === "ready" || ticket.status === "delivered").length },
    );
  });
  return {
    active: views.filter((view) => view.deliveryStatus !== "delivered"),
    done: views.filter((view) => view.deliveryStatus === "delivered"),
    couriers: isCourier(garage) ? [] : await listCouriers(garage),
    canDispatch: canDispatch(garage),
    isCourier: isCourier(garage),
  };
}

export function isDeliveryStatus(value: unknown): value is DeliveryStatus {
  return typeof value === "string" && (DELIVERY_STATUSES as readonly string[]).includes(value);
}

// -----------------------------------------------------------------------------
// Tolak otomatis order take away/delivery yang tidak dibayar.
// -----------------------------------------------------------------------------

function systemSession(outlet: { id: string; code: string; name: string; timezone: string }): GarageSession {
  return {
    user: { id: "", name: "Sistem" },
    profile: {
      id: "system",
      role: "Manajer" as Role,
      shiftLabel: "Otomatis",
      deviceLabel: "SISTEM",
      passwordResetRequired: false,
      workstation: null,
      outlet,
    },
  } as unknown as GarageSession;
}

/** Sapu order belum bayar yang lewat batas. Mengembalikan nomor order yang ditolak. */
export async function sweepUnpaidOrders(now: Date = new Date()) {
  const db = getDb();
  const candidates = await db
    .select({
      id: orders.id,
      orderNo: orders.orderNo,
      outletId: orders.outletId,
      fulfillment: orders.fulfillment,
      status: orders.status,
      createdAt: orders.createdAt,
    })
    .from(orders)
    .where(
      and(
        inArray(orders.fulfillment, ["takeaway", "delivery"]),
        inArray(orders.status, ["pending_cashier", "awaiting_payment"]),
        lt(orders.createdAt, new Date(now.getTime() - 60_000)),
      ),
    )
    .limit(50);
  if (!candidates.length) return [] as string[];

  const outletRows = await db.select().from(outlets);
  const rejected: string[] = [];
  for (const order of candidates) {
    const outlet = outletRows.find((row) => row.id === order.outletId) ?? outletRows[0];
    if (!outlet) continue;
    const settings = await getAppSettings(outlet.id);
    const limit = settings.unpaidOrderAutoRejectMinutes;
    if (!isUnpaidOrderExpired(order, limit, now)) {
      // Peringatan 5 menit sebelum batal otomatis.
      if (limit > 5 && isUnpaidOrderExpired(order, limit - 5, now)) {
        await notifyStaff({
          outletId: outlet.id,
          audience: "cashier",
          kind: "unpaid_expiring",
          severity: "warning",
          title: `${order.orderNo} batal otomatis ±5 menit lagi`,
          body: "Belum dibayar — cek pembayaran atau hubungi pelanggan.",
          url: "/os?module=pos&qr=1",
          orderId: order.id,
          dedupKey: `unpaid_expiring:${order.id}`,
        }).catch(() => null);
      }
      continue;
    }
    try {
      await updateCustomerOrderStatus(
        order.id,
        { action: "reject", reason: AUTO_REJECT_REASON(limit) },
        systemSession({ id: outlet.id, code: outlet.code, name: outlet.name, timezone: outlet.timezone ?? "Asia/Jakarta" }),
      );
      rejected.push(order.orderNo);
      await notifyStaff({
        outletId: outlet.id,
        audience: "cashier",
        kind: "auto_rejected",
        severity: "warning",
        title: `${order.orderNo} ditolak otomatis`,
        body: `${AUTO_REJECT_REASON(limit)}. Stok dikembalikan.`,
        url: "/os?module=pos&qr=1",
        orderId: order.id,
        dedupKey: `auto_rejected:${order.id}`,
      }).catch(() => null);
    } catch (error) {
      console.error("[auto-reject] gagal menolak", order.orderNo, error);
    }
  }
  return rejected;
}

let lastSweepAt = 0;

/** Sapuan malas (mis. saat kasir memuat daftar order) — paling sering tiap 30 detik. */
export async function sweepUnpaidOrdersLazily() {
  if (Date.now() - lastSweepAt < 30_000) return;
  lastSweepAt = Date.now();
  try {
    await sweepUnpaidOrders();
  } catch (error) {
    console.error("[auto-reject] sapuan gagal", error);
  }
}
