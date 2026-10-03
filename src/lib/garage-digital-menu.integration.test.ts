import { describe, it, expect, beforeAll, afterAll } from "vitest";

import { itemMinPrice, variantPrice } from "@/components/garage/order/order-ui";
import type { MenuItem } from "@/lib/garage-api-types";
import {
  setupGarageTestDb,
  teardownGarageTestDb,
  seedGarageBasics,
  type GarageTestDb,
} from "@/lib/test-helpers/garage-test-db";

// =============================================================================
// MENU DIGITAL (QR /order) — flag show_in_digital_menu & featured, plus harga
// promo yang sama antara HP pelanggan (variantPrice) dan server (createCustomerOrder).
// =============================================================================

/* eslint-disable @typescript-eslint/no-explicit-any */
let t: GarageTestDb;
let svc: any;

async function setItem(id: string, values: Record<string, unknown>) {
  const { eq } = await import("drizzle-orm");
  await t.getDb().update(t.schema.menuItems).set(values).where(eq(t.schema.menuItems.id, id));
}

function guestOrder(items: Array<{ itemId: string; variantId: string; qty: number }>) {
  return svc.createCustomerOrder({
    orderType: "dine-in",
    tableLabel: "Meja 9",
    customerMode: "guest",
    guestName: "Tamu QR",
    paymentMethod: "Cash",
    items,
  });
}

beforeAll(async () => {
  t = await setupGarageTestDb();
  await seedGarageBasics(t); // itm-coffee (Coffee 20.000) + itm-food (Makanan 30.000), shift open
  svc = await import("@/lib/garage-service");
}, 60_000);

afterAll(async () => {
  await teardownGarageTestDb(t);
});

describe("Menu digital — tampil/sembunyi & unggulan", () => {
  it("default: item baru tampil di menu digital dan bukan unggulan", async () => {
    const menu = await svc.getMenuData({ channel: "digital" });
    const coffee = menu.find((m: any) => m.id === "itm-coffee");
    expect(coffee).toBeTruthy();
    expect(coffee.showInDigitalMenu).toBe(true);
    expect(coffee.featured).toBe(false);
  });

  it("item disembunyikan hilang dari menu digital tapi tetap ada untuk POS", async () => {
    await setItem("itm-food", { showInDigitalMenu: false });
    const digital = await svc.getMenuData({ channel: "digital" });
    const pos = await svc.getMenuData();
    expect(digital.find((m: any) => m.id === "itm-food")).toBeUndefined();
    expect(pos.find((m: any) => m.id === "itm-food")).toBeTruthy();
  });

  it("order QR untuk item disembunyikan ditolak server", async () => {
    await expect(guestOrder([{ itemId: "itm-food", variantId: "reg", qty: 1 }])).rejects.toThrow(
      /tidak tersedia di menu digital/,
    );
  });

  it("deskripsi singkat terbaca; kosong/spasi dianggap tidak ada", async () => {
    await setItem("itm-coffee", { description: "  Espresso, susu, gula aren  " });
    let menu = await svc.getMenuData({ channel: "digital" });
    expect(menu.find((m: any) => m.id === "itm-coffee")?.description).toBe("Espresso, susu, gula aren");

    await setItem("itm-coffee", { description: "   " });
    menu = await svc.getMenuData({ channel: "digital" });
    expect(menu.find((m: any) => m.id === "itm-coffee")?.description).toBeUndefined();
  });

  it("flag unggulan terbaca di menu digital", async () => {
    await setItem("itm-coffee", { featured: true });
    const menu = await svc.getMenuData({ channel: "digital" });
    expect(menu.find((m: any) => m.id === "itm-coffee")?.featured).toBe(true);
  });
});

describe("Menu digital — harga promo HP = server", () => {
  it("total order QR memakai harga promo, sama dengan variantPrice di HP", async () => {
    await setItem("itm-coffee", { promoActive: true, promoPrice: 15_000 });
    const menu = await svc.getMenuData({ channel: "digital" });
    const coffee: MenuItem = menu.find((m: any) => m.id === "itm-coffee");
    const clientUnit = variantPrice(coffee, coffee.variants[0]);
    expect(clientUnit).toBe(15_000);

    const created = await guestOrder([{ itemId: "itm-coffee", variantId: "reg", qty: 2 }]);
    const order = created.order ?? created;
    expect(order.subtotal).toBe(clientUnit * 2);
  });
});

describe("variantPrice / itemMinPrice (rumus sama dengan effectiveMenuPrice server)", () => {
  const base: MenuItem = {
    id: "x",
    name: "X",
    category: "Coffee",
    section: "Bar",
    stock: "ready",
    prep: "4m",
    tags: [],
    variants: [
      { id: "hot", label: "Hot", price: 18_000 },
      { id: "cold", label: "Cold", price: 20_000 },
    ],
  };

  it("tanpa promo memakai harga varian", () => {
    expect(variantPrice(base, base.variants[1])).toBe(20_000);
    expect(itemMinPrice(base)).toBe(18_000);
  });

  it("promo aktif dan lebih murah meng-override semua varian", () => {
    const item = { ...base, promoActive: true, promoPrice: 15_000 };
    expect(variantPrice(item, item.variants[0])).toBe(15_000);
    expect(variantPrice(item, item.variants[1])).toBe(15_000);
  });

  it("promo tidak dipakai bila nonaktif, 0, atau tidak lebih murah", () => {
    expect(variantPrice({ ...base, promoActive: false, promoPrice: 10_000 }, base.variants[0])).toBe(18_000);
    expect(variantPrice({ ...base, promoActive: true, promoPrice: 0 }, base.variants[0])).toBe(18_000);
    expect(variantPrice({ ...base, promoActive: true, promoPrice: 19_000 }, base.variants[0])).toBe(18_000);
    expect(variantPrice({ ...base, promoActive: true, promoPrice: 19_000 }, base.variants[1])).toBe(19_000);
  });
});
