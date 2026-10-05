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
// Take away & Delivery menu digital (keputusan owner Okt 2026):
// - Take away: QRIS / Transfer / bayar di kasir — WAJIB lunas dulu baru dibuat.
// - Delivery: QRIS saja (tanpa COD), WA + alamat wajib, min. 2 produk,
//   ongkir Rp5.000 di luar service/pajak; status antar dikelola kasir.
// =============================================================================

/* eslint-disable @typescript-eslint/no-explicit-any */
let t: GarageTestDb;
let svc: any;
let outletId = "";

const KASIR = "user-itest-dlv-kasir";

function kasir(): GarageSession {
  return {
    user: { id: KASIR, name: "Kasir Delivery" },
    profile: {
      id: `sp-${KASIR}`,
      role: "Kasir" as Role,
      shiftLabel: "Pagi",
      deviceLabel: "DLV-1",
      passwordResetRequired: false,
      workstation: null,
      outlet: { id: outletId, code: "TST", name: "Outlet Test", timezone: "Asia/Jakarta" },
    },
  } as unknown as GarageSession;
}

const ADDRESS = "Jl. Sudirman No. 12, dekat Masjid Raya — Patokan: pagar hijau";

function deliveryInput(overrides: Record<string, unknown> = {}) {
  return {
    orderType: "delivery",
    customerMode: "guest",
    guestName: "Rina",
    guestPhone: "081234567890",
    paymentMethod: "QRIS",
    paymentProvider: "QRIS GARAGE",
    source: "instagram",
    deliveryAddress: ADDRESS,
    items: [{ itemId: "itm-coffee", variantId: "reg", qty: 2 }],
    ...overrides,
  };
}

async function ticketsOf(orderId: string) {
  const { eq } = await import("drizzle-orm");
  return t.getDb().select().from(t.schema.kitchenTickets).where(eq(t.schema.kitchenTickets.orderId, orderId));
}

beforeAll(async () => {
  t = await setupGarageTestDb();
  outletId = (await seedGarageBasics(t, { userId: KASIR })).outletId;
  svc = await import("@/lib/garage-service");
}, 60_000);

afterAll(async () => {
  await teardownGarageTestDb(t);
});

describe("Delivery: syarat pemesanan", () => {
  it("valid: ongkir Rp5.000 di luar service/pajak, alamat & WA tersimpan, label Delivery", async () => {
    const res = await svc.createCustomerOrder(deliveryInput());
    const o = res.order;
    expect(o.fulfillment).toBe("delivery");
    expect(o.channel).toBe("Delivery");
    expect(o.tableLabel).toBe("Delivery");
    expect(o.deliveryFee).toBe(5000);
    expect(o.deliveryAddress).toBe(ADDRESS);
    expect(o.customerPhone).toBeTruthy();
    expect(o.total).toBe(o.subtotal + o.service + o.tax - o.discount + 5000);
    expect(o.status).toBe("awaiting_payment");
  });

  it("ditolak: bukan QRIS (COD/transfer), < 2 produk, tanpa alamat, tanpa WA", async () => {
    await expect(svc.createCustomerOrder(deliveryInput({ paymentMethod: "Cash" }))).rejects.toThrow(/QRIS/);
    await expect(svc.createCustomerOrder(deliveryInput({ paymentMethod: "Bank Transfer" }))).rejects.toThrow(/QRIS/);
    await expect(
      svc.createCustomerOrder(deliveryInput({ items: [{ itemId: "itm-coffee", variantId: "reg", qty: 1 }] })),
    ).rejects.toThrow(/Minimal pemesanan delivery 2/);
    await expect(svc.createCustomerOrder(deliveryInput({ deliveryAddress: "  " }))).rejects.toThrow(/Alamat/);
    await expect(svc.createCustomerOrder(deliveryInput({ guestPhone: undefined }))).rejects.toThrow(/WhatsApp/);
  });

  it("delivery nonaktif di Pengaturan → ditolak", async () => {
    await svc.updateAppSettings(outletId, { deliveryEnabled: false }, kasir());
    await expect(svc.createCustomerOrder(deliveryInput())).rejects.toThrow(/tidak tersedia/);
    await svc.updateAppSettings(outletId, { deliveryEnabled: true }, kasir());
  });
});

describe("Wajib bayar dulu (take away & delivery)", () => {
  it("take away: 'Terima' tanpa bayar ditolak & tidak membuat tiket; Terima Pembayaran → tiket", async () => {
    const res = await svc.createCustomerOrder({
      orderType: "takeaway",
      customerMode: "guest",
      guestName: "Budi",
      paymentMethod: "Cash",
      source: "qr_takeaway",
      items: [{ itemId: "itm-coffee", variantId: "reg", qty: 1 }],
    });
    expect(res.order.fulfillment).toBe("takeaway");
    await expect(
      svc.updateCustomerOrderStatus(res.order.id, { action: "accept" }, kasir()),
    ).rejects.toThrow(/wajib lunas dulu/);
    expect(await ticketsOf(res.order.id)).toHaveLength(0);

    const paid = await svc.updateCustomerOrderStatus(
      res.order.id,
      { action: "paid", paymentMethod: "Cash", cashReceived: 100_000 },
      kasir(),
    );
    expect(paid.order.status).toBe("paid");
    expect(await ticketsOf(res.order.id)).not.toHaveLength(0);
  });

  it("delivery: lunas hanya QRIS; lalu status antar Diproses → Dalam pengantaran → Selesai", async () => {
    const res = await svc.createCustomerOrder(deliveryInput());
    const id = res.order.id;
    await expect(svc.updateCustomerOrderStatus(id, { action: "accept" }, kasir())).rejects.toThrow(/wajib lunas/);
    await expect(
      svc.updateCustomerOrderStatus(id, { action: "paid", paymentMethod: "Cash" }, kasir()),
    ).rejects.toThrow(/QRIS/);
    // Status antar sebelum lunas ditolak.
    await expect(
      svc.updateCustomerOrderStatus(id, { action: "delivery_status", deliveryStatus: "on_the_way" }, kasir()),
    ).rejects.toThrow(/lunas/);

    const paid = await svc.updateCustomerOrderStatus(id, { action: "paid", paymentMethod: "QRIS" }, kasir());
    expect(paid.order.status).toBe("paid");
    expect(await ticketsOf(id)).not.toHaveLength(0);

    for (const step of ["preparing", "on_the_way", "delivered"]) {
      const r = await svc.updateCustomerOrderStatus(id, { action: "delivery_status", deliveryStatus: step }, kasir());
      expect(r.order.deliveryStatus).toBe(step);
    }
  });

  it("dine-in QR tidak berubah: 'Terima' tanpa bayar tetap boleh", async () => {
    const res = await svc.createCustomerOrder({
      orderType: "dine-in",
      tableLabel: "Meja 3",
      customerMode: "guest",
      guestName: "Meja Tiga",
      paymentMethod: "Cash",
      source: "qr_table",
      items: [{ itemId: "itm-coffee", variantId: "reg", qty: 1 }],
    });
    const accepted = await svc.updateCustomerOrderStatus(res.order.id, { action: "accept" }, kasir());
    expect(accepted.order.status).toBe("accepted");
    await expect(
      svc.updateCustomerOrderStatus(res.order.id, { action: "delivery_status", deliveryStatus: "on_the_way" }, kasir()),
    ).rejects.toThrow(/hanya untuk order delivery/);
  });
});
