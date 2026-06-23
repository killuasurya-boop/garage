import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { describe, it, expect, beforeAll, afterAll } from "vitest";

import { DEFAULT_APP_SETTINGS } from "@/lib/garage-app-settings-types";
import { calculateBillingTotals } from "@/lib/garage-billing";
import type { GarageSession } from "@/lib/server-auth";

// =============================================================================
// STEP 1 (Kasir) — TEST INTEGRASI alur transaksi penuh terhadap database nyata
// (PGlite sementara, terisolasi). Membuktikan createOrder end-to-end:
// hitung total, simpan order+item+payment, routing tiket dapur/bar, guard shift,
// guard diskon member, guard variant. Bukan mock — query DB sungguhan.
// =============================================================================

/* eslint-disable @typescript-eslint/no-explicit-any */
let createOrder: any;
let getDb: any;
let getPgPool: any;
let schema: any;
let tmpDir = "";
let outletId = "";
const userId = "user-itest-kasir";

const session = (): GarageSession =>
  ({
    user: { id: userId },
    profile: {
      id: "sp-itest",
      role: "Kasir",
      shiftLabel: "Pagi",
      deviceLabel: "Kasir-1",
      passwordResetRequired: false,
      outlet: { id: outletId, code: "TST", name: "Outlet Test", timezone: "Asia/Jakarta" },
    },
  }) as unknown as GarageSession;

beforeAll(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "garage-itest-"));
  process.env.GARAGE_DB_DRIVER = "pglite";
  process.env.PGLITE_DATA_DIR = tmpDir;

  const db = await import("@/db");
  getDb = db.getDb;
  getPgPool = db.getPgPool;
  schema = db.schema;
  await db.ensureDatabaseReady();

  // Terapkan semua migrasi (pola sama dgn migrate.ts: split statement-breakpoint,
  // abaikan error idempoten/duplikat).
  const client = getPgPool();
  const files = fs
    .readdirSync("./drizzle")
    .filter((f) => f.endsWith(".sql"))
    .sort();
  for (const file of files) {
    const sql = fs.readFileSync(path.join("./drizzle", file), "utf8");
    const statements = sql
      .split("--> statement-breakpoint")
      .map((s) => s.trim())
      .filter(Boolean);
    for (const stmt of statements) {
      try {
        await client.exec(stmt);
      } catch {
        /* objek sudah ada / idempoten — abaikan */
      }
    }
  }

  // Seed minimal untuk transaksi kasir.
  const d = getDb();
  const [outlet] = await d
    .insert(schema.outlets)
    .values({ code: "TST", name: "Outlet Test" })
    .returning();
  outletId = outlet.id;

  await d
    .insert(schema.user)
    .values({ id: userId, name: "Kasir Test", email: "kasir.itest@garage.local" });

  await d.insert(schema.menuItems).values([
    { id: "itm-coffee", name: "Kopi Test", category: "Coffee", section: "Coffee", prep: "5m" },
    { id: "itm-food", name: "Nasi Test", category: "Makanan", section: "Makanan", prep: "15m" },
  ]);
  await d.insert(schema.menuVariants).values([
    { itemId: "itm-coffee", variantId: "reg", label: "Regular", price: 20_000 },
    { itemId: "itm-food", variantId: "reg", label: "Regular", price: 30_000 },
  ]);
  await d.insert(schema.cashSessions).values({
    code: "CS-ITEST",
    openingCash: 100_000,
    expectedCash: 100_000,
    outletId,
    openedBy: userId,
    status: "open",
  });

  const svc = await import("@/lib/garage-service");
  createOrder = svc.createOrder;
}, 60_000);

afterAll(async () => {
  try {
    const pool = getPgPool?.();
    await pool?.end?.();
  } catch {
    /* abaikan */
  }
  try {
    if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch {
    /* abaikan */
  }
});

describe("Kasir — createOrder end-to-end (DB nyata)", () => {
  it("dine-in 1 kopi + 1 nasi: total benar, order+item+payment tersimpan, tiket Bar & Food", async () => {
    const res = await createOrder(
      {
        orderType: "dine-in",
        tableNumber: "5",
        paymentMethod: "Cash",
        cashReceived: 100_000,
        items: [
          { itemId: "itm-coffee", variantId: "reg", qty: 1 },
          { itemId: "itm-food", variantId: "reg", qty: 1 },
        ],
      },
      session(),
    );

    // Total dihitung konsisten dgn logika unit (subtotal 50.000).
    const expected = calculateBillingTotals(50_000, DEFAULT_APP_SETTINGS);
    expect(res.subtotal).toBe(50_000);
    expect(res.service).toBe(expected.service);
    expect(res.tax).toBe(expected.tax);
    expect(res.total).toBe(expected.grossTotal);

    // Dua tiket: minuman → Bar, makanan → Food (routing per kategori).
    expect(res.ticketNos.length).toBe(2);

    const d = getDb();
    const { eq } = await import("drizzle-orm");
    const orderRows = await d
      .select()
      .from(schema.orders)
      .where(eq(schema.orders.orderNo, res.orderNo));
    expect(orderRows.length).toBe(1);
    expect(orderRows[0].customerMode).toBe("cashier");

    const itemRows = await d
      .select()
      .from(schema.orderItems)
      .where(eq(schema.orderItems.orderId, orderRows[0].id));
    expect(itemRows.length).toBe(2);

    const payRows = await d
      .select()
      .from(schema.payments)
      .where(eq(schema.payments.orderId, orderRows[0].id));
    expect(payRows.length).toBe(1);
    expect(payRows[0].amount).toBe(res.total);

    const ticketRows = await d
      .select()
      .from(schema.kitchenTickets)
      .where(eq(schema.kitchenTickets.orderId, orderRows[0].id));
    const stations = ticketRows.map((t: any) => t.station).sort();
    expect(stations).toEqual(["Bar", "Food"]);
  });

  it("menolak transaksi tanpa open shift (kasir lain belum buka kas)", async () => {
    const other = session();
    (other.user as any).id = "user-itest-noshift";
    const d = getDb();
    await d
      .insert(schema.user)
      .values({ id: "user-itest-noshift", name: "Tanpa Shift", email: "noshift.itest@garage.local" });
    await expect(
      createOrder(
        {
          orderType: "takeaway",
          paymentMethod: "Cash",
          cashReceived: 20_000,
          items: [{ itemId: "itm-coffee", variantId: "reg", qty: 1 }],
        },
        other,
      ),
    ).rejects.toThrow(/open shift/i);
  });

  it("menolak diskon manual untuk non-member (cashier mode)", async () => {
    await expect(
      createOrder(
        {
          orderType: "takeaway",
          paymentMethod: "Cash",
          cashReceived: 20_000,
          manualDiscount: { type: "amount", rawValue: 5_000, amount: 5_000, reason: "tes" },
          items: [{ itemId: "itm-coffee", variantId: "reg", qty: 1 }],
        },
        session(),
      ),
    ).rejects.toThrow(/member/i);
  });

  it("menolak variant yang tidak dikenal", async () => {
    await expect(
      createOrder(
        {
          orderType: "takeaway",
          paymentMethod: "Cash",
          cashReceived: 20_000,
          items: [{ itemId: "itm-coffee", variantId: "tidak-ada", qty: 1 }],
        },
        session(),
      ),
    ).rejects.toThrow(/variant/i);
  });
});
