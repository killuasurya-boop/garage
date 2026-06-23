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
// STEP 2-3 (Barista / Koki) — TEST INTEGRASI alur status tiket KDS terhadap DB
// nyata. Kasir membuat order → tiket Bar (minuman) & Food (makanan) →
// Barista/Koki menjalankan queue→cooking→ready, dengan optimistic-lock,
// pencatat nama (acceptedBy/readyBy), dan penolakan transisi ilegal.
// =============================================================================

/* eslint-disable @typescript-eslint/no-explicit-any */
let t: GarageTestDb;
let createOrder: any;
let updateKitchenStatus: any;
let outletId = "";

const KASIR = "user-itest-kasir";
const BARISTA = "user-itest-barista";

function makeSession(userId: string, name: string, role: Role): GarageSession {
  return {
    user: { id: userId, name },
    profile: {
      id: `sp-${userId}`,
      role,
      shiftLabel: "Pagi",
      deviceLabel: "KDS-1",
      passwordResetRequired: false,
      outlet: { id: outletId, code: "TST", name: "Outlet Test", timezone: "Asia/Jakarta" },
    },
  } as unknown as GarageSession;
}

async function ticketsForOrder(orderNo: string) {
  const d = t.getDb();
  const { eq } = await import("drizzle-orm");
  const [order] = await d
    .select()
    .from(t.schema.orders)
    .where(eq(t.schema.orders.orderNo, orderNo))
    .limit(1);
  return d
    .select()
    .from(t.schema.kitchenTickets)
    .where(eq(t.schema.kitchenTickets.orderId, order.id));
}

beforeAll(async () => {
  t = await setupGarageTestDb();
  const seeded = await seedGarageBasics(t, { userId: KASIR });
  outletId = seeded.outletId;
  // User Barista untuk kredit fee saat tiket ready.
  await t
    .getDb()
    .insert(t.schema.user)
    .values({ id: BARISTA, name: "Barista Test", email: `${BARISTA}@garage.local` });

  const svc = await import("@/lib/garage-service");
  createOrder = svc.createOrder;
  updateKitchenStatus = svc.updateKitchenStatus;
}, 60_000);

afterAll(async () => {
  await teardownGarageTestDb(t);
});

describe("Barista/Koki — alur status tiket KDS (DB nyata)", () => {
  it("order kasir menghasilkan tiket Bar & Food berstatus awal queue", async () => {
    const res = await createOrder(
      {
        orderType: "dine-in",
        tableNumber: "3",
        paymentMethod: "Cash",
        cashReceived: 100_000,
        items: [
          { itemId: "itm-coffee", variantId: "reg", qty: 1 },
          { itemId: "itm-food", variantId: "reg", qty: 1 },
        ],
      },
      makeSession(KASIR, "Kasir Test", "Kasir"),
    );
    const tickets = await ticketsForOrder(res.orderNo);
    expect(tickets.length).toBe(2);
    for (const tk of tickets) expect(tk.status).toBe("queue");
  });

  it("Barista memproses tiket Bar: queue→cooking→ready, nama tercatat", async () => {
    const res = await createOrder(
      {
        orderType: "dine-in",
        tableNumber: "4",
        paymentMethod: "Cash",
        cashReceived: 100_000,
        items: [{ itemId: "itm-coffee", variantId: "reg", qty: 1 }],
      },
      makeSession(KASIR, "Kasir Test", "Kasir"),
    );
    const [bar] = await ticketsForOrder(res.orderNo);
    const barista = makeSession(BARISTA, "Barista Test", "Barista");

    const cooking = await updateKitchenStatus(bar.ticketNo, "cooking", barista);
    expect(cooking.status).toBe("cooking");
    expect(cooking.acceptedByName).toBe("Barista Test");

    const ready = await updateKitchenStatus(bar.ticketNo, "ready", barista);
    expect(ready.status).toBe("ready");
    expect(ready.readyByName).toBe("Barista Test");
  });

  it("menolak transisi ilegal queue→delivered", async () => {
    const res = await createOrder(
      {
        orderType: "dine-in",
        tableNumber: "6",
        paymentMethod: "Cash",
        cashReceived: 100_000,
        items: [{ itemId: "itm-food", variantId: "reg", qty: 1 }],
      },
      makeSession(KASIR, "Kasir Test", "Kasir"),
    );
    const [food] = await ticketsForOrder(res.orderNo);
    await expect(
      updateKitchenStatus(food.ticketNo, "delivered", makeSession(BARISTA, "Barista Test", "Barista")),
    ).rejects.toThrow();
  });

  it("idempoten: set status yang sama mengembalikan tiket tanpa error", async () => {
    const res = await createOrder(
      {
        orderType: "dine-in",
        tableNumber: "7",
        paymentMethod: "Cash",
        cashReceived: 100_000,
        items: [{ itemId: "itm-coffee", variantId: "reg", qty: 1 }],
      },
      makeSession(KASIR, "Kasir Test", "Kasir"),
    );
    const [bar] = await ticketsForOrder(res.orderNo);
    const barista = makeSession(BARISTA, "Barista Test", "Barista");
    await updateKitchenStatus(bar.ticketNo, "cooking", barista);
    const again = await updateKitchenStatus(bar.ticketNo, "cooking", barista);
    expect(again.status).toBe("cooking");
  });

  it("tiket tidak dikenal mengembalikan null (tidak error)", async () => {
    const out = await updateKitchenStatus(
      "TICKET-TIDAK-ADA",
      "cooking",
      makeSession(BARISTA, "Barista Test", "Barista"),
    );
    expect(out).toBeNull();
  });
});
