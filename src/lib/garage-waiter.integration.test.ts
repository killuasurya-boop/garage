import { describe, it, expect, beforeAll, afterAll } from "vitest";

import type { GarageSession } from "@/lib/server-auth";
import type { Role } from "@/lib/garage-data";
import {
  setupGarageTestDb,
  teardownGarageTestDb,
  seedGarageBasics,
  type GarageTestDb,
} from "@/lib/test-helpers/garage-test-db";

// =============================================================================
// STEP 4 (Waiter) — TEST INTEGRASI pelayanan meja terhadap DB nyata.
// Kasir order → Barista bikin ready → Waiter klaim tiket (anti rebutan) →
// antar (ready→delivered, nama pengantar tercatat). Auto-klaim saat antar.
// =============================================================================

/* eslint-disable @typescript-eslint/no-explicit-any */
let t: GarageTestDb;
let createOrder: any;
let updateKitchenStatus: any;
let claimKitchenTicket: any;
let deliverClaimedTicket: any;
let outletId = "";

const KASIR = "user-itest-kasir";
const BARISTA = "user-itest-barista";
const WAITER1 = "user-itest-waiter1";
const WAITER2 = "user-itest-waiter2";

function makeSession(userId: string, name: string, role: Role): GarageSession {
  return {
    user: { id: userId, name },
    profile: {
      id: `sp-${userId}`,
      role,
      shiftLabel: "Pagi",
      deviceLabel: "HP-Waiter",
      passwordResetRequired: false,
      outlet: { id: outletId, code: "TST", name: "Outlet Test", timezone: "Asia/Jakarta" },
    },
  } as unknown as GarageSession;
}

// Buat order kasir lalu naikkan tiket pertama ke "ready" (siap diantar).
async function makeReadyTicket(table: string) {
  const res = await createOrder(
    {
      orderType: "dine-in",
      tableNumber: table,
      paymentMethod: "Cash",
      cashReceived: 100_000,
      items: [{ itemId: "itm-coffee", variantId: "reg", qty: 1 }],
    },
    makeSession(KASIR, "Kasir Test", "Kasir"),
  );
  const d = t.getDb();
  const { eq } = await import("drizzle-orm");
  const [order] = await d
    .select()
    .from(t.schema.orders)
    .where(eq(t.schema.orders.orderNo, res.orderNo))
    .limit(1);
  const [tk] = await d
    .select()
    .from(t.schema.kitchenTickets)
    .where(eq(t.schema.kitchenTickets.orderId, order.id));
  const barista = makeSession(BARISTA, "Barista Test", "Barista");
  await updateKitchenStatus(tk.ticketNo, "cooking", barista);
  await updateKitchenStatus(tk.ticketNo, "ready", barista);
  return tk.ticketNo;
}

beforeAll(async () => {
  t = await setupGarageTestDb();
  const seeded = await seedGarageBasics(t, { userId: KASIR });
  outletId = seeded.outletId;
  const d = t.getDb();
  await d.insert(t.schema.user).values([
    { id: BARISTA, name: "Barista Test", email: `${BARISTA}@garage.local` },
    { id: WAITER1, name: "Waiter Satu", email: `${WAITER1}@garage.local` },
    { id: WAITER2, name: "Waiter Dua", email: `${WAITER2}@garage.local` },
  ]);

  const svc = await import("@/lib/garage-service");
  createOrder = svc.createOrder;
  updateKitchenStatus = svc.updateKitchenStatus;
  claimKitchenTicket = svc.claimKitchenTicket;
  deliverClaimedTicket = svc.deliverClaimedTicket;
}, 60_000);

afterAll(async () => {
  await teardownGarageTestDb(t);
});

describe("Waiter — klaim & antar tiket (DB nyata)", () => {
  it("Waiter klaim tiket ready, nama tercatat", async () => {
    const ticketNo = await makeReadyTicket("10");
    const claimed = await claimKitchenTicket(ticketNo, makeSession(WAITER1, "Waiter Satu", "Waiter 1"));
    expect(claimed.claimedBy).toBe(WAITER1);
    expect(claimed.claimedByName).toBe("Waiter Satu");
  });

  it("Waiter lain tidak bisa merebut tiket yang sudah diklaim", async () => {
    const ticketNo = await makeReadyTicket("11");
    await claimKitchenTicket(ticketNo, makeSession(WAITER1, "Waiter Satu", "Waiter 1"));
    await expect(
      claimKitchenTicket(ticketNo, makeSession(WAITER2, "Waiter Dua", "Waiter 2")),
    ).rejects.toThrow(/Waiter Satu|diambil/i);
  });

  it("Waiter antar tiket terklaim → delivered, pengantar tercatat", async () => {
    const ticketNo = await makeReadyTicket("12");
    const waiter = makeSession(WAITER1, "Waiter Satu", "Waiter 1");
    await claimKitchenTicket(ticketNo, waiter);
    const delivered = await deliverClaimedTicket(ticketNo, waiter);
    expect(delivered.status).toBe("delivered");
    expect(delivered.deliveredByName).toBe("Waiter Satu");
  });

  it("antar tanpa klaim → auto-klaim lalu delivered", async () => {
    const ticketNo = await makeReadyTicket("14");
    const waiter = makeSession(WAITER2, "Waiter Dua", "Waiter 2");
    const delivered = await deliverClaimedTicket(ticketNo, waiter);
    expect(delivered.status).toBe("delivered");
    expect(delivered.deliveredByName).toBe("Waiter Dua");
  });
});
