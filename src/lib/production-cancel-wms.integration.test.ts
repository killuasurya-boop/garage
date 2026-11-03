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
// Reproduksi bug uji browser (Nov 2026): batal item bill belum lunas saat bahan
// dikelola WMS dan stoknya NEGATIF (penjualan boleh minus, kebijakan owner) →
// eksekusi persetujuan gagal "Stok tidak cukup". Bahan porsi yang belum dibuat
// harus kembali ke stok, bukan menolak pembatalan.
// =============================================================================

/* eslint-disable @typescript-eslint/no-explicit-any */
let t: GarageTestDb;
let svc: any;
let wms: any;
let outletId = "";
let productId = "";
const KASIR = "user-itest-cxw-kasir";
const BAR = "user-itest-cxw-bar";
const MANAJER = "user-itest-cxw-manajer";

function session(userId: string, role: Role, name: string, workstation: string | null = null): GarageSession {
  return {
    user: { id: userId, name, email: `${userId}@garage.id` },
    profile: {
      id: `sp-${userId}`,
      role,
      shiftLabel: "Pagi",
      deviceLabel: "CXW-1",
      passwordResetRequired: false,
      workstation,
      outlet: { id: outletId, code: "TST", name: "Outlet Test", timezone: "Asia/Jakarta" },
    },
  } as unknown as GarageSession;
}
const kasir = () => session(KASIR, "Kasir" as Role, "Kasir CXW");
const bar = () => session(BAR, "Kasir" as Role, "Barista CXW", "bar");
const manajer = () => session(MANAJER, "Manajer" as Role, "Manajer CXW");

async function wmsTotal() {
  const { eq } = await import("drizzle-orm");
  const rows = await t.getDb().select().from(t.schema.wmsWarehouseStock).where(eq(t.schema.wmsWarehouseStock.productId, productId));
  return rows.reduce((sum: number, r: any) => sum + Number(r.qty), 0);
}

beforeAll(async () => {
  t = await setupGarageTestDb();
  outletId = (await seedGarageBasics(t, { userId: KASIR })).outletId;
  await t.getDb().insert(t.schema.user).values([
    { id: BAR, name: "Barista CXW", email: `${BAR}@garage.id` },
    { id: MANAJER, name: "Manajer CXW", email: `${MANAJER}@garage.id` },
  ]);
  svc = await import("@/lib/garage-service");
  wms = await import("@/lib/wms-service");
  await wms.listWmsWarehouses(); // memicu seed gudang default (self-healing)
  await t.getDb().insert(t.schema.wmsCategory).values({ name: "Bar · Kopi Test", area: "bar" }).onConflictDoNothing();
  const prod = await wms.createWmsProduct({ sku: "BEANW", name: "Biji Kopi WMS", category: "Bar · Kopi Test", unit: "gram", packPrice: 0, packQty: 1 });
  productId = prod.id;
  await t.getDb().insert(t.schema.menuRecipes).values({
    menuItemId: "itm-coffee",
    variantId: "all",
    inventorySku: "BEANW",
    qty: 18,
    unit: "gram",
    wastePct: 0,
    status: "active",
  });
}, 60_000);

afterAll(async () => {
  await teardownGarageTestDb(t);
});

describe("Batal item saat stok WMS negatif", () => {
  it("persetujuan batal 1 kopi (belum dibuat) berhasil & stok kembali 18 g", async () => {
    const created = await svc.createCustomerOrder({
      orderType: "dine-in",
      tableLabel: "21",
      customerMode: "guest",
      guestName: "Tamu WMS",
      paymentMethod: "Cash",
      items: [
        { itemId: "itm-coffee", variantId: "reg", qty: 2 },
        { itemId: "itm-food", variantId: "reg", qty: 1 },
      ],
    });
    const order = created.order ?? created;
    await svc.updateCustomerOrderStatus(order.id, { action: "accept" }, kasir());
    expect(await wmsTotal()).toBe(-36);
    const { eq } = await import("drizzle-orm");
    const rows = await t.getDb().select().from(t.schema.orderItems).where(eq(t.schema.orderItems.orderId, order.id));
    const coffee = rows.find((i: any) => i.menuItemId === "itm-coffee");
    const res = await svc.requestUnpaidItemCancelApproval(
      order.id,
      { reasonCode: "salah_input", note: null, items: [{ orderItemId: coffee.id, qty: 1 }] },
      bar(),
    );
    await svc.decideApproval(res.approvalId, { status: "approved", reasonDecided: "ok" }, manajer());
    expect(await wmsTotal()).toBe(-18);
  });

  it("void kasir biasa (seluruh order) saat stok minus juga berhasil — bug lama WMS", async () => {
    const created = await svc.createCustomerOrder({
      orderType: "dine-in",
      tableLabel: "22",
      customerMode: "guest",
      guestName: "Tamu Void",
      paymentMethod: "Cash",
      items: [{ itemId: "itm-coffee", variantId: "reg", qty: 1 }],
    });
    const order = created.order ?? created;
    await svc.updateCustomerOrderStatus(order.id, { action: "accept" }, kasir());
    const before = await wmsTotal();
    const res = await svc.requestOrderVoidApproval(order.id, { reasonCode: "salah_input", note: null }, kasir());
    await svc.decideApproval(res.approvalId, { status: "approved", reasonDecided: "ok" }, manajer());
    expect(await wmsTotal()).toBe(before + 18);
  });
});
