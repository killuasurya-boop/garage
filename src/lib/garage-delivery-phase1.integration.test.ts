import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { Role } from "@/lib/garage-data";
import type { GarageSession } from "@/lib/server-auth";
import {
  seedGarageBasics,
  setupGarageTestDb,
  teardownGarageTestDb,
  type GarageTestDb,
} from "@/lib/test-helpers/garage-test-db";

// =============================================================================
// Take away & Delivery menu digital (keputusan owner Okt 2026):
// - Take away: QRIS / Transfer / bayar di kasir — WAJIB lunas dulu baru dibuat.
// - Delivery: QRIS saja (tanpa COD), WA + alamat wajib, min. 2 produk,
//   ongkir Rp5.000 di luar service/pajak; status antar dikelola kasir.
// =============================================================================

/* eslint-disable @typescript-eslint/no-explicit-any */
let t: GarageTestDb;
let svc: any;
let outletId = "";

const KASIR = "user-itest-dlv-kasir";

function kasir(): GarageSession {
  return {
    user: { id: KASIR, name: "Kasir Delivery" },
    profile: {
      id: `sp-${KASIR}`,
      role: "Kasir" as Role,
      shiftLabel: "Pagi",
      deviceLabel: "DLV-1",
      passwordResetRequired: false,
      workstation: null,
      outlet: { id: outletId, code: "TST", name: "Outlet Test", timezone: "Asia/Jakarta" },
    },
  } as unknown as GarageSession;
}

// Entirely synthetic fixtures: no real phone, address, customer, or courier location.
const ADDRESS = "ALAMAT UJI FIKTIF — BUKAN LOKASI NYATA";

function deliveryInput(overrides: Record<string, unknown> = {}) {
  return {
    orderType: "delivery",
    customerMode: "guest",
    guestName: "Pelanggan Uji Fiktif",
    guestPhone: "000000000000",
    paymentMethod: "QRIS",
    paymentProvider: "QRIS GARAGE",
    source: "instagram",
    deliveryAddress: ADDRESS,
    items: [{ itemId: "itm-coffee", variantId: "reg", qty: 2 }],
    ...overrides,
  };
}

async function ticketsOf(orderId: string) {
  const { eq } = await import("drizzle-orm");
  return t.getDb().select().from(t.schema.kitchenTickets).where(eq(t.schema.kitchenTickets.orderId, orderId));
}

const STANDBY = "user-itest-dlv-standby";

beforeAll(async () => {
  t = await setupGarageTestDb();
  outletId = (await seedGarageBasics(t, { userId: KASIR })).outletId;
  // Delivery hanya bisa dipesan bila ada kurir "Siap antar" (Pengaturan default).
  await t.getDb().insert(t.schema.user).values({ id: STANDBY, name: "Zaki Standby", email: `${STANDBY}@example.invalid` });
  await t
    .getDb()
    .insert(t.schema.staffProfiles)
    .values({ userId: STANDBY, outletId, role: "Waiter", workstation: "kurir", courierAvailability: "available" });
  svc = await import("@/lib/garage-service");
}, 60_000);

afterAll(async () => {
  await teardownGarageTestDb(t);
});


const owner = (outlet = outletId): GarageSession => ({ ...kasir(), profile: { ...kasir().profile, role: "Owner", outlet: { ...kasir().profile.outlet, id: outlet } } });
const courier = (): GarageSession => ({ ...kasir(), user: { ...kasir().user, id: STANDBY }, profile: { ...kasir().profile, role: "Waiter", workstation: "kurir" } });

async function paid(patch: Record<string, unknown> = {}) {
  const result = await svc.createCustomerOrder(deliveryInput());
  await svc.updateCustomerOrderStatus(result.order.id, { action: "paid", paymentMethod: "QRIS" }, kasir());
  const { eq } = await import("drizzle-orm");
  if (Object.keys(patch).length) await t.getDb().update(t.schema.orders).set(patch).where(eq(t.schema.orders.id, result.order.id));
  return result.order.id as string;
}

describe("Delivery V3 phase 1 security and consistency", () => {
  let cour: typeof import("@/lib/garage-courier");
  let otherOutlet: string;
  beforeAll(async () => {
    cour = await import("@/lib/garage-courier");
    const [other] = await t.getDb().insert(t.schema.outlets).values({ code: "ZZZ", name: "Other outlet" }).returning();
    otherOutlet = other.id;
  });

  it("denies cross-outlet board and mutations, while Owner can use their active outlet", async () => {
    const id = await paid();
    const outsider = { ...kasir(), profile: { ...kasir().profile, outlet: { ...kasir().profile.outlet, id: otherOutlet } } };
    expect((await cour.getCourierBoard(outsider)).active.map(o => o.id)).not.toContain(id);
    await expect(cour.assignCourier(id, null, outsider)).rejects.toMatchObject({ status: 404 });
    await expect(cour.courierDeliveryAction(id, "pickup", owner(otherOutlet))).rejects.toMatchObject({ status: 404 });
    await expect(cour.assertCanAttachDeliveryProof(id, owner(otherOutlet))).rejects.toMatchObject({ status: 404 });
    await expect(cour.updateCourierLocation(id, 0, 0, { ...courier(), profile: { ...courier().profile, outlet: outsider.profile.outlet } })).rejects.toMatchObject({ status: 404 });
    await expect(cour.claimDeliveryOrder(id, { ...courier(), profile: { ...courier().profile, outlet: outsider.profile.outlet } })).rejects.toMatchObject({ status: 404 });
    const second = await paid({ outletId: otherOutlet });
    expect((await cour.getCourierBoard(owner(otherOutlet))).active.map(o => o.id)).toContain(second);
    expect((await cour.getCourierBoard(owner())).active.map(o => o.id)).not.toContain(second);
  });

  it("limits null-outlet legacy deliveries to the default active outlet", async () => {
    const id = await paid({ outletId: null });
    expect((await cour.getCourierBoard(kasir())).active.map(o => o.id)).toContain(id);
    expect((await cour.getCourierBoard(owner(otherOutlet))).active.map(o => o.id)).not.toContain(id);
    await expect(cour.assignCourier(id, null, owner(otherOutlet))).rejects.toMatchObject({ status: 404 });
    await expect(svc.updateCustomerOrderStatus(id, { action: "delivery_status", deliveryStatus: "preparing" }, owner(otherOutlet))).resolves.toBeNull();
    await expect(svc.updateCustomerOrderStatus(id, { action: "paid", paymentMethod: "QRIS" }, owner(otherOutlet))).resolves.toBeNull();
    const sameOutlet = await svc.updateCustomerOrderStatus(id, { action: "paid", paymentMethod: "QRIS" }, kasir());
    expect(sameOutlet.order.id).toBe(id);
  });

  it("authorizes proof by recorded order, outlet, and assigned courier", async () => {
    const id = await paid({ courierUserId: STANDBY, courierName: "Standby" });
    const file = `proof-${id}-1795168800000-1234abcd.jpg`;
    const { eq } = await import("drizzle-orm");
    await t.getDb().update(t.schema.orders).set({ deliveryProofUrl: `/api/courier/proof/${file}` }).where(eq(t.schema.orders.id, id));
    await expect(cour.assertCanReadDeliveryProof(file, kasir())).resolves.toBeUndefined();
    await expect(cour.assertCanReadDeliveryProof(file, courier())).resolves.toBeUndefined();
    await expect(cour.assertCanReadDeliveryProof(file, owner(otherOutlet))).rejects.toMatchObject({ status: 404 });
    await expect(cour.assertCanReadDeliveryProof(file, { ...courier(), user: { ...courier().user, id: KASIR } })).rejects.toMatchObject({ status: 404 });
    await expect(cour.assertCanReadDeliveryProof(file, { ...kasir(), profile: { ...kasir().profile, role: "Waiter" } })).rejects.toMatchObject({ status: 404 });
    await expect(cour.assertCanReadDeliveryProof("unknown.jpg", owner())).rejects.toMatchObject({ status: 404 });
  });

  it("enforces readiness/proof on the legacy route and keeps repeat transitions idempotent", async () => {
    const id = await paid({ courierUserId: STANDBY, courierName: "Standby" });
    await expect(svc.updateCustomerOrderStatus(id, { action: "delivery_status", deliveryStatus: "delivered" }, kasir())).rejects.toThrow(/Urutan/);
    await expect(svc.updateCustomerOrderStatus(id, { action: "delivery_status", deliveryStatus: "on_the_way" }, kasir())).rejects.toThrow(/Bar\/Dapur/);
    const { eq } = await import("drizzle-orm");
    await t.getDb().update(t.schema.kitchenTickets).set({ status: "ready" }).where(eq(t.schema.kitchenTickets.orderId, id));
    await svc.updateCustomerOrderStatus(id, { action: "delivery_status", deliveryStatus: "on_the_way" }, kasir());
    expect((await ticketsOf(id)).every((ticket: { status: string }) => ticket.status === "delivered")).toBe(true);
    await expect(cour.courierDeliveryAction(id, "arrive", courier())).rejects.toThrow(/foto bukti/);
    await cour.attachDeliveryProof(id, "/api/courier/proof/proof-fixture.jpg", courier());
    await svc.updateCustomerOrderStatus(id, { action: "delivery_status", deliveryStatus: "delivered" }, kasir());
    const auditBefore = await t.getDb().select().from(t.schema.auditLogs).where(eq(t.schema.auditLogs.action, `Delivery status ${(await t.getDb().select().from(t.schema.orders).where(eq(t.schema.orders.id, id)))[0].orderNo}`));
    await cour.courierDeliveryAction(id, "arrive", courier());
    await svc.updateCustomerOrderStatus(id, { action: "delivery_status", deliveryStatus: "delivered" }, kasir());
    const auditAfter = await t.getDb().select().from(t.schema.auditLogs);
    expect(auditAfter.filter((a: { id: string }) => auditBefore.some((b: { id: string }) => b.id === a.id))).toHaveLength(auditBefore.length);
    const allOrderAudits = auditAfter.filter((a: { action: string }) => a.action === auditBefore[0].action);
    expect(allOrderAudits).toHaveLength(auditBefore.length);
    await expect(svc.updateCustomerOrderStatus(id, { action: "delivery_status", deliveryStatus: "preparing" }, kasir())).rejects.toThrow(/Urutan/);
  });

  it("never leaves GPS behind when arrival races with a location request", async () => {
    const id = await paid({ courierUserId: STANDBY, courierName: "Standby", deliveryStatus: "on_the_way", deliveryProofUrl: "/api/courier/proof/proof-race.jpg" });
    const outcomes = await Promise.allSettled([
      cour.updateCourierLocation(id, 0, 0, courier()),
      cour.courierDeliveryAction(id, "arrive", courier()),
    ]);
    expect(outcomes[1].status).toBe("fulfilled");
    const { eq } = await import("drizzle-orm");
    const [order] = await t.getDb().select().from(t.schema.orders).where(eq(t.schema.orders.id, id));
    expect(order).toMatchObject({ deliveryStatus: "delivered", courierLat: null, courierLng: null, courierLocationAt: null });
    await expect(cour.updateCourierLocation(id, 0, 0, courier())).rejects.toMatchObject({ status: 409 });
  });

  it("keeps older active deliveries visible independently of recent history and pages completed orders", async () => {
    const id = await paid();
    const { eq } = await import("drizzle-orm");
    const { randomUUID } = await import("node:crypto");
    const [seed] = await t.getDb().select().from(t.schema.orders).where(eq(t.schema.orders.id, id));
    await t.getDb().insert(t.schema.orders).values(Array.from({ length: 65 }, (_, i) => ({ ...seed, id: randomUUID(), orderNo: `PH1-D-${i}`, invoiceTrackingToken: randomUUID(), deliveryStatus: "delivered", deliveredAt: new Date(), createdAt: new Date() })));
    await t.getDb().update(t.schema.orders).set({ createdAt: new Date("2020-01-01") }).where(eq(t.schema.orders.id, id));
    const board = await cour.getCourierBoard(kasir());
    expect(board.active.map(o => o.id)).toContain(id);
    expect(board.done).toHaveLength(20);
    expect(board.history.hasMore).toBe(true);
    const next = await cour.getCourierBoard(kasir(), { historyPage: 1 });
    expect(next.active.map(o => o.id)).toContain(id);
    expect(next.done).toHaveLength(20);
    expect(next.done.some(o => board.done.some(first => first.id === o.id))).toBe(false);
  });
});
