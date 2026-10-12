// =============================================================================
// Kurir delivery (keputusan owner Okt 2026): kurir = akun sendiri (role Waiter,
// workstation "kurir"). Kasir menugaskan kurir ke order delivery yang sudah
// lunas; kurir mengubah status antar dan mengirim GPS selama pengantaran supaya
// pelanggan bisa melihat posisi kurir. GPS dihapus begitu pesanan sampai.
// Juga: tolak otomatis order take away/delivery yang tidak dibayar tepat waktu.
// =============================================================================

import { and, notInArray, asc, desc, eq, gte, inArray, isNull, lt, ne, or } from "drizzle-orm";

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

/**
 * Status kurir (PDF owner, Okt 2026) — warna sama dengan meja:
 *   available  = Tersedia (hijau, bisa ditugaskan)
 *   assigned   = Ditugaskan, menunggu pickup (kuning)
 *   delivering = Sedang mengantar (merah)
 *   offline    = Offline / istirahat (abu-abu)
 */
export type CourierStatus = "available" | "assigned" | "delivering" | "offline";

export type CourierOption = {
  userId: string;
  name: string;
  activeDeliveries: number;
  status: CourierStatus;
  /** Hanya kurir Tersedia yang bisa ditugaskan / mengambil pesanan. */
  assignable: boolean;
};

export function courierStatusFor(
  availability: string | null | undefined,
  activeStatuses: Array<string | null>,
): CourierStatus {
  if (availability !== "available") return "offline";
  if (activeStatuses.some((status) => status === "picked_up" || status === "on_the_way")) return "delivering";
  if (activeStatuses.length) return "assigned";
  return "available";
}

type CourierDb = Pick<ReturnType<typeof getDb>, "select">;

async function couriersOfOutlet(db: CourierDb, outletId: string) {
  const rows = await db
    .select({
      userId: staffProfiles.userId,
      name: user.name,
      availability: staffProfiles.courierAvailability,
    })
    .from(staffProfiles)
    .innerJoin(user, eq(user.id, staffProfiles.userId))
    .where(
      and(
        eq(staffProfiles.outletId, outletId),
        eq(staffProfiles.role, "Waiter"),
        eq(staffProfiles.status, "active"),
        eq(staffProfiles.workstation, "kurir"),
      ),
    )
    .orderBy(asc(user.name));
  if (!rows.length) return [] as CourierOption[];
  const active = await db
    .select({ courierUserId: orders.courierUserId, deliveryStatus: orders.deliveryStatus })
    .from(orders)
    .where(
      and(
        inArray(
          orders.courierUserId,
          rows.map((row) => row.userId),
        ),
        eq(orders.fulfillment, "delivery"),
        or(isNull(orders.deliveryStatus), ne(orders.deliveryStatus, "delivered")),
        // Order void/batal tidak lagi membuat kurir "sibuk".
        notInArray(orders.status, ["rejected", "voided", "cancelled"]),
      ),
    );
  return rows.map((row): CourierOption => {
    const mine = active.filter((entry) => entry.courierUserId === row.userId).map((entry) => entry.deliveryStatus);
    const status = courierStatusFor(row.availability, mine);
    return {
      userId: row.userId,
      name: row.name,
      activeDeliveries: mine.length,
      status,
      assignable: status === "available",
    };
  });
}

/** Kurir aktif di outlet + status (untuk pilihan kasir). */
export async function listCouriers(garage: GarageSession): Promise<CourierOption[]> {
  return couriersOfOutlet(getDb(), garage.profile.outlet.id);
}

/**
 * Ketersediaan delivery untuk menu digital: tidak ada kurir "Siap antar" →
 * delivery tidak bisa dipilih (bila diwajibkan Pengaturan); semua sibuk →
 * tetap bisa pesan, masuk antrean.
 */
export async function deliveryCourierAvailability(outletId: string) {
  const couriers = await couriersOfOutlet(getDb(), outletId);
  const online = couriers.filter((courier) => courier.status !== "offline");
  return {
    online: online.length,
    free: online.filter((courier) => courier.status === "available").length,
  };
}

/** Kurir menyalakan "Siap antar" / "Istirahat" (atau Owner/Manajer untuk kurir lain). */
export async function setCourierAvailability(
  input: { available: boolean; courierUserId?: string },
  garage: GarageSession,
) {
  const targetId = input.courierUserId ?? garage.user.id;
  if (targetId !== garage.user.id && !isManagement(garage)) {
    throw new CourierError("Hanya Owner/Manajer yang bisa mengubah status kurir lain.", 403);
  }
  if (targetId === garage.user.id && !isCourier(garage)) {
    throw new CourierError("Status siap antar hanya untuk akun kurir.", 403);
  }
  const db = getDb();
  const now = new Date();
  const [row] = await db
    .update(staffProfiles)
    .set({ courierAvailability: input.available ? "available" : "offline", courierAvailabilityAt: now, updatedAt: now })
    .where(
      and(
        eq(staffProfiles.userId, targetId),
        eq(staffProfiles.outletId, garage.profile.outlet.id),
        eq(staffProfiles.workstation, "kurir"),
      ),
    )
    .returning({ userId: staffProfiles.userId });
  if (!row) throw new CourierError("Akun kurir tidak ditemukan.", 404);
  await db.insert(auditLogs).values({
    time: timeLabel(),
    actor: actorOf(garage),
    action: input.available ? "Kurir siap antar" : "Kurir istirahat",
    object: targetId,
    device: garage.profile.deviceLabel,
    status: input.available ? "available" : "offline",
    metadata: { courierUserId: targetId },
  });
  publishProductionChange();
  const [mine] = (await listCouriers(garage)).filter((courier) => courier.userId === targetId);
  return mine ?? null;
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
    if (courierUserId && courierUserId !== order.courierUserId) {
      // Hanya kurir berstatus Tersedia (siap antar & tidak membawa pesanan).
      const options = await couriersOfOutlet(tx, order.outletId ?? garage.profile.outlet.id);
      const option = options.find((courier) => courier.userId === courierUserId);
      if (option && !option.assignable) {
        const reason =
          option.status === "offline"
            ? "sedang offline/istirahat"
            : option.status === "delivering"
              ? "sedang mengantar"
              : "sudah ditugaskan pesanan lain";
        throw new CourierError(`${option.name} ${reason}. Pilih kurir yang Tersedia.`, 409);
      }
    }
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
    // "Sudah sampai" wajib foto bukti terkirim (PDF owner).
    if (rule.to === "delivered" && !order.deliveryProofUrl) {
      throw new CourierError("Ambil foto bukti terkirim dulu sebelum menandai Sudah sampai.", 409);
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

/** Kurir Tersedia mengambil sendiri pesanan delivery lunas yang belum ada kurirnya. */
export async function claimDeliveryOrder(orderId: string, garage: GarageSession) {
  if (!isCourier(garage)) throw new CourierError("Hanya akun kurir yang bisa mengambil pesanan.", 403);
  const db = getDb();
  const result = await db.transaction(async (tx) => {
    const order = await lockDeliveryOrder(tx, orderId);
    if (order.status !== "paid") throw new CourierError("Order belum lunas.");
    if (order.courierUserId === garage.user.id) return order; // idempoten
    if (order.courierUserId) throw new CourierError("Pesanan ini sudah diambil kurir lain.", 409);
    if (order.deliveryStatus === "delivered") throw new CourierError("Pesanan sudah selesai diantar.");
    const options = await couriersOfOutlet(tx, order.outletId ?? garage.profile.outlet.id);
    const me = options.find((courier) => courier.userId === garage.user.id);
    if (!me || me.status === "offline") throw new CourierError("Nyalakan \"Siap antar\" dulu sebelum mengambil pesanan.", 409);
    if (!me.assignable) throw new CourierError("Selesaikan antaran yang sedang dibawa dulu.", 409);
    const now = new Date();
    const [updated] = await tx
      .update(orders)
      .set({
        courierUserId: garage.user.id,
        courierName: garage.user.name,
        deliveryStatus: order.deliveryStatus ?? "preparing",
        courierLat: null,
        courierLng: null,
        courierLocationAt: null,
        updatedAt: now,
      })
      .where(and(eq(orders.id, order.id), isNull(orders.courierUserId)))
      .returning();
    if (!updated) throw new CourierError("Pesanan ini sudah diambil kurir lain.", 409);
    await tx.insert(auditLogs).values({
      time: timeLabel(),
      actor: actorOf(garage),
      action: `Kurir ambil ${order.orderNo}`,
      object: garage.user.name,
      device: garage.profile.deviceLabel,
      status: updated.deliveryStatus ?? "preparing",
      metadata: { orderId: order.id, courierUserId: garage.user.id, by: "self_claim" },
    });
    return updated;
  });
  publishProductionChange();
  await announceOrderProgress(result.id, "courier_assigned", { courierName: result.courierName }).catch(() => null);
  return courierOrderView(result);
}

/** Simpan foto bukti terkirim (URL file staf) — hanya kurir yang ditugaskan / manajemen. */
export async function attachDeliveryProof(orderId: string, proofUrl: string, garage: GarageSession) {
  const db = getDb();
  const [order] = await db
    .select({ id: orders.id, courierUserId: orders.courierUserId, deliveryStatus: orders.deliveryStatus, orderNo: orders.orderNo })
    .from(orders)
    .where(eq(orders.id, orderId))
    .limit(1);
  if (!order) throw new CourierError("Order tidak ditemukan.", 404);
  if (order.courierUserId !== garage.user.id && !isManagement(garage)) {
    throw new CourierError("Pesanan ini tidak ditugaskan ke Anda.", 403);
  }
  if (order.deliveryStatus !== "picked_up" && order.deliveryStatus !== "on_the_way") {
    throw new CourierError("Foto bukti diambil saat pesanan sedang diantar.", 409);
  }
  await db.update(orders).set({ deliveryProofUrl: proofUrl, updatedAt: new Date() }).where(eq(orders.id, order.id));
  publishProductionChange();
  return { ok: true, proofUrl };
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
    deliveryProofUrl: row.deliveryProofUrl ?? null,
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
  // Kurir: pesanan siap diambil sendiri (lunas, belum ada kurir).
  const claimableRows = isCourier(garage)
    ? await db
        .select()
        .from(orders)
        .where(
          and(
            eq(orders.fulfillment, "delivery"),
            eq(orders.status, "paid"),
            isNull(orders.courierUserId),
            or(isNull(orders.deliveryStatus), ne(orders.deliveryStatus, "delivered")),
            or(eq(orders.outletId, garage.profile.outlet.id), isNull(orders.outletId)),
          ),
        )
        .orderBy(asc(orders.createdAt))
        .limit(20)
    : [];
  const couriers = await listCouriers(garage);
  return {
    active: views.filter((view) => view.deliveryStatus !== "delivered"),
    done: views.filter((view) => view.deliveryStatus === "delivered"),
    claimable: claimableRows.map((row) => courierOrderView(row)),
    me: isCourier(garage) ? couriers.find((courier) => courier.userId === garage.user.id) ?? null : null,
    couriers: isCourier(garage) ? [] : couriers,
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
