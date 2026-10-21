import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { seedGarageBasics, setupGarageTestDb, teardownGarageTestDb, type GarageTestDb } from "@/lib/test-helpers/garage-test-db";

let database: GarageTestDb;
let outletId: string;
let eventId: string;

beforeAll(async () => {
  database = await setupGarageTestDb();
  const seeded = await seedGarageBasics(database, { userId: "event-report-owner" });
  outletId = seeded.outletId;
  const db = database.getDb();
  const [event] = await db.insert(database.schema.events).values({
    slug: "report-event-test", title: "Event Report Test", startsAt: new Date("2026-10-21T08:00:00Z"),
    endsAt: new Date("2026-10-21T16:00:00Z"), venueName: "Garage", address: "Tebing Tinggi",
    mapsUrl: "https://maps.google.com", contactWhatsapp: "628123456789", status: "published",
  }).returning();
  eventId = event.id;
}, 120_000);

afterAll(async () => { await teardownGarageTestDb(database); });

describe("event sales database scope and snapshots", () => {
  it("separates payment rows, filters event/date/outlet and uses immutable cost snapshots", async () => {
    const db = database.getDb();
    const { schema } = database;
    const [otherOutlet] = await db.insert(schema.outlets).values({ code: "EVR2", name: "Other Outlet" }).returning();
    const make = async (orderNo: string, status: string, total: number, extra: Record<string, unknown> = {}) => {
      const [row] = await db.insert(schema.orders).values({
        eventId, orderNo, outletId, tableLabel: "Take away", channel: "QR Table", status,
        subtotal: total, service: 0, tax: 0, total,
        createdAt: new Date("2026-10-21T08:00:00Z"), ...extra,
      }).returning();
      return row;
    };
    const paid = await make("EVR-paid", "paid", 40_000);
    const pending = await make("EVR-pending", "pending_cashier", 70_000);
    await make("EVR-other-outlet", "paid", 999_000, { outletId: otherOutlet.id });
    await make("EVR-outside-date", "paid", 888_000, { createdAt: new Date("2026-10-22T08:00:00Z") });
    await make("EVR-regular", "paid", 777_000, { eventId: null });
    await db.insert(schema.orderItems).values({
      orderId: paid.id, menuItemId: "itm-coffee", variantId: "reg", itemName: "Kopi Test", variantLabel: "Regular",
      unitPrice: 20_000, qty: 2, lineTotal: 40_000,
      eventSnapshot: {
        eventId, eventTitle: "Event Report Test", entryId: "event-entry-snapshot", entryName: "Kopi Event",
        kind: "item", groupId: "snapshot-group", entryQuantity: 2, componentIndex: 0, componentCount: 1,
        unitCost: 5_000, packagePrice: 20_000,
      },
    });
    await db.insert(schema.payments).values([
      { orderId: paid.id, method: "Cash", amount: 10_000, status: "captured" },
      { orderId: paid.id, method: "QRIS", amount: 30_000, status: "captured" },
      { orderId: pending.id, method: "Cash", amount: 70_000, status: "pending" },
    ]);
    const { getEventSalesReport } = await import("@/lib/event-sales-report");
    const report = await getEventSalesReport({ eventId, outletId, from: "2026-10-21", to: "2026-10-21" });
    expect(report.summary).toMatchObject({ originalOrders: 2, paidBills: 1, paidRevenue: 40_000, pendingAmount: 70_000, netSales: 40_000 });
    expect(report.entries).toHaveLength(1);
    expect(report.entries[0]).toMatchObject({ name: "Kopi Event", submittedUnits: 2, grossItemSales: 40_000 });
    expect(report.cost).toMatchObject({ total: 10_000, grossMargin: 30_000 });
  });
});
