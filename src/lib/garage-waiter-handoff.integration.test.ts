import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { GarageSession } from "@/lib/server-auth";
import type { Role } from "@/lib/garage-data";
import {
  seedGarageBasics,
  setupGarageTestDb,
  teardownGarageTestDb,
  type GarageTestDb,
} from "@/lib/test-helpers/garage-test-db";

// =============================================================================
// Alur waiter ringkas: (1) waiter "Pesankan" → order langsung diterima tanpa kasir
// (tiket Bar/Dapur dibuat), (2) Bar/Dapur "Siap · Panggil" (READY + panggil semua),
// (3) helper tap nama waiter "Diambil" → tiket delivered atas nama waiter + fee antar.
// Waiter tidak menekan apa pun untuk antaran.
// =============================================================================

/* eslint-disable @typescript-eslint/no-explicit-any */
let t: GarageTestDb;
let svc: any;
let prod: any;
let outletId = "";

const KASIR = "user-itest-wh-kasir";
const WAITER = "user-itest-wh-waiter";
const HELPER = "user-itest-wh-helper";
const BAR = "user-itest-wh-bar";

function makeSession(userId: string, name: string, role: Role, workstation: string | null = null): GarageSession {
  return {
    user: { id: userId, name },
    profile: {
      id: `sp-${userId}`,
      role,
      shiftLabel: "Pagi",
      deviceLabel: "WH-1",
      passwordResetRequired: false,
      workstation,
      outlet: { id: outletId, code: "TST", name: "Outlet Test", timezone: "Asia/Jakarta" },
    },
  } as unknown as GarageSession;
}

const waiter = () => makeSession(WAITER, "Andi Waiter", "Waiter");
const helperBar = () => makeSession(HELPER, "Helper Bar", "Kasir", "helper_bar");
const bar = () => makeSession(BAR, "Barista", "Kasir", "bar");

async function barTicketOf(orderId: string) {
  const { and, eq } = await import("drizzle-orm");
  const [row] = await t
    .getDb()
    .select()
    .from(t.schema.kitchenTickets)
    .where(and(eq(t.schema.kitchenTickets.orderId, orderId), eq(t.schema.kitchenTickets.station, "Bar")))
    .limit(1);
  return row;
}

beforeAll(async () => {
  t = await setupGarageTestDb();
  const seeded = await seedGarageBasics(t, { userId: KASIR });
  outletId = seeded.outletId;
  await t
    .getDb()
    .insert(t.schema.user)
    .values([
      { id: WAITER, name: "Andi Waiter", email: `${WAITER}@garage.id` },
      { id: HELPER, name: "Helper Bar", email: `${HELPER}@garage.id` },
      { id: BAR, name: "Barista", email: `${BAR}@garage.id` },
    ]);
  await t
    .getDb()
    .insert(t.schema.staffProfiles)
    .values([
      { userId: WAITER, outletId, role: "Waiter" },
      { userId: HELPER, outletId, role: "Kasir", workstation: "helper_bar" },
      { userId: BAR, outletId, role: "Kasir", workstation: "bar" },
    ]);
  svc = await import("@/lib/garage-service");
  prod = await import("@/lib/garage-production");
}, 60_000);

afterAll(async () => {
  await teardownGarageTestDb(t);
});

describe("Waiter Pesankan → langsung ke Bar/Dapur", () => {
  let orderId = "";

  it("order waiter diterima tanpa kasir (shift kas outlet milik kasir lain)", async () => {
    const created = await svc.createCustomerOrder({
      orderType: "dine-in",
      tableLabel: "Meja 4",
      customerMode: "guest",
      guestName: "Meja 4 · Andi Waiter",
      paymentMethod: "Cash",
      source: "qr_table",
      items: [{ itemId: "itm-coffee", variantId: "reg", qty: 2 }],
    });
    orderId = created.order.id;
    await svc.updateCustomerOrderStatus(orderId, { action: "accept" }, waiter(), {
      acceptWithOutletShift: true,
    });

    const { eq } = await import("drizzle-orm");
    const [row] = await t.getDb().select().from(t.schema.orders).where(eq(t.schema.orders.id, orderId));
    expect(row.status).toBe("accepted");
    expect(await barTicketOf(orderId)).toBeTruthy();
  });

  it("tanpa opsi, waiter tetap tidak bisa accept (aturan kasir lama utuh)", async () => {
    const created = await svc.createCustomerOrder({
      orderType: "dine-in",
      tableLabel: "Meja 5",
      customerMode: "guest",
      guestName: "Tamu",
      paymentMethod: "Cash",
      items: [{ itemId: "itm-coffee", variantId: "reg", qty: 1 }],
    });
    await expect(
      svc.updateCustomerOrderStatus(created.order.id, { action: "accept" }, waiter()),
    ).rejects.toThrow(/Open shift wajib/);
  });

  it("Siap · Panggil lalu helper tap 'Diambil' → delivered atas nama waiter + fee antar", async () => {
    const ticket = await barTicketOf(orderId);
    await prod.productionTicketAction(ticket.ticketNo, "start", bar());
    const called = await prod.productionReadyAndCall(ticket.ticketNo, bar(), { qcConfirmed: true });
    expect(called.status).toBe("ready");
    expect(called.handoverAt).toBeTruthy();
    expect(called.claimedBy).toBeNull(); // dipanggil untuk semua waiter

    const delivered = await prod.productionPickup(ticket.ticketNo, WAITER, helperBar());
    expect(delivered.status).toBe("delivered");
    expect(delivered.deliveredByName).toBe("Andi Waiter");
    expect(delivered.claimedBy).toBe(WAITER);

    const { and, eq } = await import("drizzle-orm");
    const earnings = await t
      .getDb()
      .select()
      .from(t.schema.staffEarnings)
      .where(
        and(eq(t.schema.staffEarnings.ticketId, ticket.id), eq(t.schema.staffEarnings.event, "ticket_delivered")),
      );
    expect(earnings.length).toBeGreaterThan(0);
    expect(earnings.every((row: any) => row.staffUserId === WAITER)).toBe(true);

    // Tap ulang (double tap) aman: tetap delivered, fee tidak dobel.
    await prod.productionPickup(ticket.ticketNo, WAITER, helperBar());
    const again = await t
      .getDb()
      .select()
      .from(t.schema.staffEarnings)
      .where(
        and(eq(t.schema.staffEarnings.ticketId, ticket.id), eq(t.schema.staffEarnings.event, "ticket_delivered")),
      );
    expect(again.length).toBe(earnings.length);
  });

  it("pickup ditolak untuk user yang bukan waiter aktif", async () => {
    const created = await svc.createCustomerOrder({
      orderType: "dine-in",
      tableLabel: "Meja 6",
      customerMode: "guest",
      guestName: "Meja 6 · Andi",
      paymentMethod: "Cash",
      items: [{ itemId: "itm-coffee", variantId: "reg", qty: 1 }],
    });
    await svc.updateCustomerOrderStatus(created.order.id, { action: "accept" }, waiter(), {
      acceptWithOutletShift: true,
    });
    const ticket = await barTicketOf(created.order.id);
    await prod.productionReadyAndCall(ticket.ticketNo, bar(), { qcConfirmed: true });
    await expect(prod.productionPickup(ticket.ticketNo, BAR, helperBar())).rejects.toThrow();
  });
});
