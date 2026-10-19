import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { Role } from "@/lib/garage-data";
import type { GarageSession } from "@/lib/server-auth";
import {
  seedGarageBasics,
  setupGarageTestDb,
  teardownGarageTestDb,
  type GarageTestDb,
} from "@/lib/test-helpers/garage-test-db";

// "Bayar nanti" dari POS: tagihan terbuka → tiket Bar/Dapur langsung jalan →
// dilunasi Final Bayar dengan kembalian tercatat. Rokok (tersembunyi dari menu
// digital) tetap bisa dipesan kasir dan tidak membuat tiket.

/* eslint-disable @typescript-eslint/no-explicit-any */
let t: GarageTestDb;
let svc: any;
let outletId = "";
const KASIR = "user-itest-openbill-kasir";

const kasir = () =>
  ({
    user: { id: KASIR, name: "Kasir Test", email: `${KASIR}@garage.id` },
    profile: {
      id: `sp-${KASIR}`,
      role: "Kasir" as Role,
      shiftLabel: "Pagi",
      deviceLabel: "Kasir-1",
      passwordResetRequired: false,
      workstation: null,
      outlet: { id: outletId, code: "TST", name: "Outlet Test", timezone: "Asia/Jakarta" },
    },
  }) as unknown as GarageSession;

async function rowsWhere(table: any, column: any, value: string) {
  const { eq } = await import("drizzle-orm");
  return t.getDb().select().from(table).where(eq(column, value));
}

beforeAll(async () => {
  t = await setupGarageTestDb();
  outletId = (await seedGarageBasics(t, { userId: KASIR })).outletId;
  await t.getDb().insert(t.schema.menuItems).values({
    id: "itm-rokok",
    name: "Rokok Test",
    category: "Rokok",
    section: "Rokok",
    prep: "0m",
    showInDigitalMenu: false,
  });
  await t.getDb().insert(t.schema.menuVariants).values({ itemId: "itm-rokok", variantId: "reg", label: "Regular", price: 18000 });
  svc = await import("@/lib/garage-service");
}, 60_000);

afterAll(async () => {
  await teardownGarageTestDb(t);
});

describe("Bayar nanti (open bill)", () => {
  it("tagihan terbuka, tiket jalan, lalu Final Bayar tunai dengan kembalian", async () => {
    // Pelanggan QR biasa tidak boleh memesan produk tersembunyi.
    await expect(
      svc.createCustomerOrder({
        orderType: "takeaway",
        customerMode: "guest",
        guestName: "Andi",
        paymentMethod: "Cash",
        items: [{ itemId: "itm-rokok", variantId: "reg", qty: 1 }],
      }),
    ).rejects.toThrow(/tidak tersedia di menu digital/);

    const created = await svc.createCustomerOrder({
      orderType: "takeaway",
      outletId,
      customerMode: "guest",
      guestName: "Andi",
      source: "qr_takeaway",
      staffOrder: true,
      allowHiddenItems: true,
      paymentMethod: "Cash",
      items: [
        { itemId: "itm-food", variantId: "reg", qty: 1 },
        { itemId: "itm-rokok", variantId: "reg", qty: 1 },
      ],
    });
    const orderId = created.order.id;
    await svc.updateCustomerOrderStatus(orderId, { action: "accept" }, kasir(), { openBill: true });

    const [open] = await rowsWhere(t.schema.orders, t.schema.orders.id, orderId);
    expect(open.status).not.toBe("paid");
    const tickets = await rowsWhere(t.schema.kitchenTickets, t.schema.kitchenTickets.orderId, orderId);
    expect(tickets.map((ticket: any) => ticket.station)).toEqual(["Food"]);

    await svc.updateCustomerOrderStatus(
      orderId,
      { action: "paid", paymentMethod: "Cash", cashReceived: open.total + 7_000 },
      kasir(),
    );
    const [paid] = await rowsWhere(t.schema.orders, t.schema.orders.id, orderId);
    expect(paid.status).toBe("paid");
  });
});
