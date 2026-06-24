import { describe, it, expect, beforeAll, afterAll } from "vitest";

import {
  setupGarageTestDb,
  teardownGarageTestDb,
  seedGarageBasics,
  type GarageTestDb,
} from "@/lib/test-helpers/garage-test-db";

// =============================================================================
// WEBSITE / HALAMAN PUBLIK — TEST INTEGRASI sinkronisasi menu dashboard ↔
// halaman customer (/order pakai getMenuData). Membuktikan: satu sumber data
// (tak ada duplikat), perubahan menu dashboard langsung tampil di publik, dan
// item arsip disembunyikan dari customer.
// =============================================================================

/* eslint-disable @typescript-eslint/no-explicit-any */
let t: GarageTestDb;
let getMenuData: any;

beforeAll(async () => {
  t = await setupGarageTestDb();
  await seedGarageBasics(t); // itm-coffee (Coffee 20.000) + itm-food (Makanan 30.000)
  const svc = await import("@/lib/garage-service");
  getMenuData = svc.getMenuData;
}, 60_000);

afterAll(async () => {
  await teardownGarageTestDb(t);
});

describe("Website publik — menu sinkron dengan dashboard (satu sumber DB)", () => {
  it("menu customer memuat item aktif + varian & harga dari DB yang sama", async () => {
    const menu = await getMenuData();
    const coffee = menu.find((m: any) => m.id === "itm-coffee");
    const food = menu.find((m: any) => m.id === "itm-food");
    expect(coffee).toBeTruthy();
    expect(food).toBeTruthy();
    expect(coffee.variants[0].price).toBe(20_000);
    expect(food.variants[0].price).toBe(30_000);
  });

  it("ubah harga di dashboard → langsung tampil di menu publik", async () => {
    // Simulasi owner mengubah harga varian di dashboard (tabel yang sama).
    const d = t.getDb();
    const { eq, and } = await import("drizzle-orm");
    await d
      .update(t.schema.menuVariants)
      .set({ price: 25_000 })
      .where(
        and(
          eq(t.schema.menuVariants.itemId, "itm-coffee"),
          eq(t.schema.menuVariants.variantId, "reg"),
        ),
      );
    const menu = await getMenuData();
    const coffee = menu.find((m: any) => m.id === "itm-coffee");
    expect(coffee.variants[0].price).toBe(25_000);
  });

  it("item diarsip (status non-active) disembunyikan dari customer", async () => {
    const d = t.getDb();
    const { eq } = await import("drizzle-orm");
    await d
      .update(t.schema.menuItems)
      .set({ status: "archived" })
      .where(eq(t.schema.menuItems.id, "itm-food"));
    const menu = await getMenuData();
    expect(menu.find((m: any) => m.id === "itm-food")).toBeUndefined();
    // item aktif lain tetap tampil.
    expect(menu.find((m: any) => m.id === "itm-coffee")).toBeTruthy();
  });

  it("filter kategori bekerja untuk halaman publik", async () => {
    const menu = await getMenuData({ category: "Coffee" });
    expect(menu.every((m: any) => m.category === "Coffee")).toBe(true);
    expect(menu.find((m: any) => m.id === "itm-coffee")).toBeTruthy();
  });
});
