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
// B3 (PRD V4.0 §09.2–§09.3): tender guard CASH/QRIS, referensi pembayaran
// tidak boleh dipakai dua order, dan Penjualan Langsung (Quick Retail).
// =============================================================================

/* eslint-disable @typescript-eslint/no-explicit-any */
let t: GarageTestDb;
let svc: typeof import("@/lib/garage-service");
let outletId = "";
const KASIR = "user-b3-kasir";

function session(role: Role = "Kasir"): GarageSession {
  return {
    user: { id: KASIR, name: "Kasir B3", email: `${KASIR}@garage.id` },
    profile: {
      id: `sp-${KASIR}`,
      role,
      shiftLabel: "Pagi",
      deviceLabel: "Kasir-1",
      passwordResetRequired: false,
      outlet: { id: outletId, code: "TST", name: "Outlet Test", timezone: "Asia/Jakarta" },
    },
  } as unknown as GarageSession;
}

const coffee = [{ itemId: "itm-coffee", variantId: "reg", qty: 1 }];
const water = [{ itemId: "itm-water", variantId: "btl", qty: 2 }];

async function expectedCash() {
  const { eq } = await import("drizzle-orm");
  const [row] = await t
    .getDb()
    .select({ expectedCash: t.schema.cashSessions.expectedCash })
    .from(t.schema.cashSessions)
    .where(eq(t.schema.cashSessions.status, "open"));
  return row.expectedCash;
}

beforeAll(async () => {
  t = await setupGarageTestDb();
  const seeded = await seedGarageBasics(t, { userId: KASIR });
  outletId = seeded.outletId;
  svc = await import("@/lib/garage-service");
  const d = t.getDb();
  await d.insert(t.schema.staffProfiles).values({ userId: KASIR, outletId, role: "Kasir", status: "active" });
  await d.insert(t.schema.menuItems).values({
    id: "itm-water",
    name: "Air Mineral Test",
    category: "Minuman Botol",
    section: "Lainnya",
    prep: "0m",
    productType: "retail",
  });
  await d.insert(t.schema.menuVariants).values({ itemId: "itm-water", variantId: "btl", label: "Botol", price: 5_000 });
}, 60_000);

afterAll(async () => {
  await teardownGarageTestDb(t);
});

describe("Tender guard tunai", () => {
  it("tunai tanpa uang diterima ditolak; laci tidak berubah", async () => {
    const before = await expectedCash();
    await expect(
      svc.createOrder({ orderType: "takeaway", paymentMethod: "Cash", items: coffee }, session()),
    ).rejects.toThrow(/uang diterima/i);
    expect(await expectedCash()).toBe(before);
  });

  it("uang diterima ≥ total: laci bertambah sebesar total (kembalian tidak masuk)", async () => {
    const before = await expectedCash();
    const order: any = await svc.createOrder(
      { orderType: "takeaway", paymentMethod: "Cash", cashReceived: 50_000, items: coffee },
      session(),
    );
    expect(await expectedCash()).toBe(before + order.total);
  });

  it("split tidak seimbang ditolak dengan selisihnya", async () => {
    await expect(
      svc.createOrder(
        {
          orderType: "takeaway",
          paymentMethod: "Cash",
          splits: [
            { method: "Cash", amount: 5_000 },
            { method: "QRIS", amount: 5_000 },
          ],
          items: coffee,
        },
        session(),
      ),
    ).rejects.toThrow(/kurang/);
  });
});

describe("Referensi QRIS (F34)", () => {
  let firstOrderNo = "";

  it("referensi disimpan ter-normalisasi & QRIS tidak masuk laci", async () => {
    const before = await expectedCash();
    const order: any = await svc.createOrder(
      { orderType: "takeaway", paymentMethod: "QRIS", paymentReference: " rrn 778899 ", items: coffee },
      session(),
    );
    firstOrderNo = order.orderNo;
    expect(await expectedCash()).toBe(before);
    const { eq } = await import("drizzle-orm");
    const [payment] = await t.getDb().select().from(t.schema.payments).where(eq(t.schema.payments.orderId, order.orderId));
    expect((payment.metadata as any).reference).toBe("RRN 778899");
  });

  it("referensi yang sama (beda format) untuk order lain ditolak & menyebut order pertama", async () => {
    await expect(
      svc.createOrder(
        { orderType: "takeaway", paymentMethod: "QRIS", paymentReference: "RRN-778899", items: coffee },
        session(),
      ),
    ).rejects.toThrow(new RegExp(firstOrderNo));
  });

  it("split: referensi QRIS yang sudah dipakai juga ditolak", async () => {
    await expect(
      svc.createOrder(
        {
          orderType: "takeaway",
          paymentMethod: "Cash",
          splits: [
            { method: "Cash", amount: 10_000 },
            { method: "QRIS", amount: 10_000, reference: "rrn778899" },
          ],
          items: coffee,
        },
        session(),
      ),
    ).rejects.toThrow(/sudah dipakai/);
  });

  it("Owner mewajibkan referensi: QRIS tanpa referensi ditolak, tunai tidak terpengaruh", async () => {
    await svc.updateAppSettings(null, { qrisReferenceRequired: true }, session("Owner"));
    await expect(
      svc.createOrder({ orderType: "takeaway", paymentMethod: "QRIS", items: coffee }, session()),
    ).rejects.toThrow(/referensi QRIS/i);
    await expect(
      svc.createOrder({ orderType: "takeaway", paymentMethod: "Cash", cashReceived: 20_000, items: coffee }, session()),
    ).resolves.toBeTruthy();
    await svc.updateAppSettings(null, { qrisReferenceRequired: false }, session("Owner"));
  });

  it("Final Bayar QRIS dengan referensi yang sudah dipakai ditolak; referensi baru lunas", async () => {
    const created: any = await svc.createCustomerOrder({
      orderType: "takeaway",
      outletId,
      customerMode: "guest",
      guestName: "Tamu B3",
      source: "qr_takeaway",
      staffOrder: true,
      allowHiddenItems: true,
      skipCashierNotify: true,
      paymentMethod: "Cash",
      items: coffee,
    } as any);
    await svc.updateCustomerOrderStatus(created.order.id, { action: "accept" }, session(), { openBill: true });
    await expect(
      svc.updateCustomerOrderStatus(
        created.order.id,
        { action: "paid", paymentMethod: "QRIS", paymentReference: "RRN778899" } as any,
        session(),
      ),
    ).rejects.toThrow(/sudah dipakai/);
    const paid: any = await svc.updateCustomerOrderStatus(
      created.order.id,
      { action: "paid", paymentMethod: "QRIS", paymentReference: "RRN990011" } as any,
      session(),
    );
    expect(paid?.order?.status ?? paid?.status).toBe("paid");
  });
});

describe("Penjualan Langsung (Quick Retail, POS-05)", () => {
  it("produk non-retail ditolak", async () => {
    await expect(
      svc.createOrder(
        { orderType: "takeaway", saleChannel: "quick_retail", paymentMethod: "Cash", cashReceived: 50_000, items: coffee },
        session(),
      ),
    ).rejects.toThrow(/bukan produk kemasan/);
  });

  it("tidak memakai meja", async () => {
    await expect(
      svc.createOrder(
        { orderType: "dine-in", tableNumber: "05", saleChannel: "quick_retail", paymentMethod: "Cash", cashReceived: 50_000, items: water },
        session(),
      ),
    ).rejects.toThrow(/tidak memakai meja/);
  });

  it("lunas sekali: kanal Penjualan Langsung, tanpa tiket produksi, masuk filter laporan", async () => {
    const before = await expectedCash();
    const order: any = await svc.createOrder(
      { orderType: "takeaway", saleChannel: "quick_retail", paymentMethod: "Cash", cashReceived: 10_000, items: water },
      session(),
    );
    expect(order.ticketNos).toEqual([]);
    expect(await expectedCash()).toBe(before + order.total);

    const { eq } = await import("drizzle-orm");
    const [row] = await t.getDb().select().from(t.schema.orders).where(eq(t.schema.orders.id, order.orderId));
    expect(row.channel).toBe("Penjualan Langsung");
    expect(row.tableLabel).toBe("Penjualan Langsung");
    expect(row.status).toBe("paid");
    const tickets = await t.getDb().select().from(t.schema.kitchenTickets).where(eq(t.schema.kitchenTickets.orderId, order.orderId));
    expect(tickets).toHaveLength(0);

    const retail = await svc.listInvoicesForFinance({ channelGroup: "quick_retail" });
    expect(retail.rows.map((r: any) => r.orderNo)).toEqual([order.orderNo]);
    expect(retail.rows[0].channelGroup).toBe("quick_retail");
    const dineIn = await svc.listInvoicesForFinance({ channelGroup: "pos_dine_in" });
    expect(dineIn.rows.map((r: any) => r.orderNo)).not.toContain(order.orderNo);
  });
});
