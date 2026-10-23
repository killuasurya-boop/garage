import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { GarageSession } from "@/lib/server-auth";
import {
  seedGarageBasics,
  setupGarageTestDb,
  teardownGarageTestDb,
  type GarageTestDb,
} from "@/lib/test-helpers/garage-test-db";

// =============================================================================
// Reset grand opening (DB nyata dari semua migrasi):
//   - setiap tabel hasil migrasi terklasifikasi KEEP/CLEAR/RESET (pagar tabel baru);
//   - tidak ada relasi yang membuat data master ikut terhapus;
//   - transaksi kosong, master utuh, stok = 0 setelah reset.
// =============================================================================

/* eslint-disable @typescript-eslint/no-explicit-any */
let t: GarageTestDb;
let reset: any;
let outletId = "";
const KASIR = "user-itest-reset-kasir";

beforeAll(async () => {
  t = await setupGarageTestDb();
  outletId = (await seedGarageBasics(t, { userId: KASIR })).outletId;
  reset = await import("@/db/reset-grand-opening");
}, 60_000);

afterAll(async () => {
  await teardownGarageTestDb(t);
});

async function count(table: string) {
  const { sql } = await import("drizzle-orm");
  const result = await t.getDb().execute(sql.raw(`select count(*)::int as n from "${table}"`));
  return Number((result.rows ?? result)[0].n);
}

describe("Reset grand opening", () => {
  it("semua tabel hasil migrasi terklasifikasi & relasi aman", async () => {
    const shape = await reset.readDbShape(t.getDb());
    const plan = reset.buildResetPlan(shape.existing, shape.foreignKeys, { resetMemberPoints: false });
    expect(plan.unknown).toEqual([]);
    // Preserved closing allocations intentionally block clearing their source batches.
    expect(plan.blockers.filter((s: string) => !s.startsWith("wms_closing_"))).toEqual([]);
    // Temuan G-12: tabel ini dulu tidak pernah dibuat migrasi.
    for (const table of ["error_events", "feedback_entries", "earnings_failed_queue"]) {
      expect(shape.existing).toContain(table);
    }
  });

  it("menghapus transaksi, menyimpan master, stok jadi 0", async () => {
    const svc = await import("@/lib/garage-service");
    const session = {
      user: { id: KASIR, name: "Kasir Reset" },
      profile: {
        id: "sp-reset",
        role: "Kasir",
        shiftLabel: "Pagi",
        deviceLabel: "POS-1",
        passwordResetRequired: false,
        workstation: "all",
        outlet: { id: outletId, code: "TST", name: "Outlet Test", timezone: "Asia/Jakarta" },
      },
    } as unknown as GarageSession;
    await svc.createOrder(
      {
        orderType: "dine-in",
        tableNumber: "5",
        guestName: "UJI",
        paymentMethod: "Cash",
        cashReceived: 100_000,
        items: [
          { itemId: "itm-coffee", variantId: "reg", qty: 1 },
          { itemId: "itm-food", variantId: "reg", qty: 1 },
        ],
      },
      session,
    );
    await t.getDb().insert(t.schema.inventoryItems).values({
      sku: "SKU-RESET",
      name: "Bahan Uji",
      alternativeName: "Bahan Uji",
      category: "Bahan",
      unit: "gr",
      packageSize: "1 kg",
      onHand: 500,
      min: 100,
      status: "safe",
      movement: "stok awal uji",
    });
    expect(await count("orders")).toBeGreaterThan(0);
    const [event] = await t.getDb().insert(t.schema.events).values({ slug: "reset-menu-test", title: "Reset Menu Test", startsAt: new Date(), endsAt: new Date(Date.now() + 86400000), venueName: "Garage", address: "Test", mapsUrl: "", contactWhatsapp: "" }).returning();
    await t.getDb().insert(t.schema.eventMenuEntries).values({ eventId: event.id, kind: "item", name: "Menu Uji", menuItemId: "itm-coffee", variantId: "reg", price: 15000, startsAt: event.startsAt, endsAt: event.endsAt, usedQuantity: 3 });
    expect(await count("production_ticket_items")).toBeGreaterThan(0);
    const masterTables = ["menu_items", "menu_variants", "outlets", "user", "inventory_items"];
    const before = Object.fromEntries(
      await Promise.all(masterTables.map(async (table) => [table, await count(table)] as const)),
    );

    const shape = await reset.readDbShape(t.getDb());
    const plan = reset.buildResetPlan(shape.existing, shape.foreignKeys, { resetMemberPoints: false });
    await reset.applyGrandOpeningReset(t.getDb(), plan, { resetMemberPoints: false });

    for (const table of ["orders", "order_items", "payments", "kitchen_tickets", "production_ticket_items", "cash_sessions", "audit_logs"]) {
      expect(await count(table), table).toBe(0);
    }
    for (const table of masterTables) {
      expect(await count(table), `master ${table} harus utuh`).toBe(before[table]);
    }
    const { eq } = await import("drizzle-orm");
    const [stock] = await t
      .getDb()
      .select()
      .from(t.schema.inventoryItems)
      .where(eq(t.schema.inventoryItems.sku, "SKU-RESET"));
    expect(stock).toMatchObject({ onHand: 0, status: "low" });
    const [entry] = await t.getDb().select().from(t.schema.eventMenuEntries);
    expect(entry).toMatchObject({ eventId: event.id, name: "Menu Uji", price: 15000, usedQuantity: 0 });
  });
});
