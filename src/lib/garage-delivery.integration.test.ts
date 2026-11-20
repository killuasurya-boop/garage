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

const STANDBY = "user-itest-dlv-standby";

beforeAll(async () => {
  t = await setupGarageTestDb();
  outletId = (await seedGarageBasics(t, { userId: KASIR })).outletId;
  // Delivery hanya bisa dipesan bila ada kurir "Siap antar" (Pengaturan default).
  await t.getDb().insert(t.schema.user).values({ id: STANDBY, name: "Zaki Standby", email: `${STANDBY}@garage.id` });
  await t
    .getDb()
    .insert(t.schema.staffProfiles)
    .values({ userId: STANDBY, outletId, role: "Waiter", workstation: "kurir", courierAvailability: "available" });
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

  it("ditolak: bukan QRIS (COD/transfer), belanja < Rp25.000, tanpa alamat, tanpa WA", async () => {
    await expect(svc.createCustomerOrder(deliveryInput({ paymentMethod: "Cash" }))).rejects.toThrow(/QRIS/);
    await expect(svc.createCustomerOrder(deliveryInput({ paymentMethod: "Bank Transfer" }))).rejects.toThrow(/QRIS/);
    await expect(
      svc.createCustomerOrder(deliveryInput({ items: [{ itemId: "itm-coffee", variantId: "reg", qty: 1 }] })),
    ).rejects.toThrow(/Minimal belanja delivery Rp25\.000/);
    await expect(svc.createCustomerOrder(deliveryInput({ deliveryAddress: "  " }))).rejects.toThrow(/Alamat/);
    await expect(svc.createCustomerOrder(deliveryInput({ guestPhone: undefined }))).rejects.toThrow(/WhatsApp/);
  });

  it("ongkir per km dari titik Garage; di luar radius ditolak; tanpa lokasi = ongkir dasar", async () => {
    // Garage di (3.3285, 99.1625). 0,01° lintang ≈ 1,11 km.
    await svc.updateAppSettings(outletId, { garageLat: 3.3285, garageLng: 99.1625 }, kasir());
    const near = await svc.createCustomerOrder(deliveryInput({ customerLat: 3.3285 + 0.0275, customerLng: 99.1625 }));
    // ± 3,1 km → dasar Rp5.000 (2 km) + 2 km × Rp2.000 = Rp9.000
    expect(near.order.deliveryFee).toBe(9000);
    const billing = await svc.getCustomerOrderBillingSettings(outletId);
    expect(billing.deliveryOrigin).toEqual({ lat: 3.3285, lng: 99.1625 });
    await expect(
      svc.createCustomerOrder(deliveryInput({ customerLat: 3.3285 + 0.09, customerLng: 99.1625 })),
    ).rejects.toThrow(/di luar jangkauan delivery \(maks 7 km\)/);
    const noLocation = await svc.createCustomerOrder(deliveryInput());
    expect(noLocation.order.deliveryFee).toBe(5000);
    await svc.updateAppSettings(outletId, { garageLat: 0, garageLng: 0 }, kasir());
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

    await expect(svc.updateCustomerOrderStatus(id, { action: "delivery_status", deliveryStatus: "delivered" }, kasir())).rejects.toThrow(/Urutan/);
    await expect(svc.updateCustomerOrderStatus(id, { action: "delivery_status", deliveryStatus: "on_the_way" }, kasir())).rejects.toThrow(/Bar\/Dapur/);
    const { eq } = await import("drizzle-orm");
    await t.getDb().update(t.schema.kitchenTickets).set({ status: "ready" }).where(eq(t.schema.kitchenTickets.orderId, id));
    const departed = await svc.updateCustomerOrderStatus(id, { action: "delivery_status", deliveryStatus: "on_the_way" }, kasir());
    expect(departed.order.deliveryStatus).toBe("on_the_way");
    await expect(svc.updateCustomerOrderStatus(id, { action: "delivery_status", deliveryStatus: "delivered" }, kasir())).rejects.toThrow(/foto bukti/);
    const cour = await import("@/lib/garage-courier");
    await cour.attachDeliveryProof(id, "/api/courier/proof/proof-legacy.jpg", { ...kasir(), profile: { ...kasir().profile, role: "Owner" } });
    const arrived = await svc.updateCustomerOrderStatus(id, { action: "delivery_status", deliveryStatus: "delivered" }, kasir());
    expect(arrived.order.deliveryStatus).toBe("delivered");
    await expect(svc.updateCustomerOrderStatus(id, { action: "delivery_status", deliveryStatus: "preparing" }, kasir())).rejects.toThrow(/Urutan/);
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

// =============================================================================
// Tahap 2: kurir + GPS, indikator status per tipe, tolak otomatis 30 menit.
// =============================================================================
const KURIR = "user-itest-dlv-kurir";
const KURIR2 = "user-itest-dlv-kurir2";

function courier(id = KURIR, name = "Andi Kurir"): GarageSession {
  return {
    user: { id, name },
    profile: {
      id: `sp-${id}`,
      role: "Waiter" as Role,
      shiftLabel: "Pagi",
      deviceLabel: "HP-KURIR",
      passwordResetRequired: false,
      workstation: "kurir",
      outlet: { id: outletId, code: "TST", name: "Outlet Test", timezone: "Asia/Jakarta" },
    },
  } as unknown as GarageSession;
}

async function paidDelivery(extra: Record<string, unknown> = {}) {
  const res = await svc.createCustomerOrder(deliveryInput(extra));
  await svc.updateCustomerOrderStatus(res.order.id, { action: "paid", paymentMethod: "QRIS" }, kasir());
  return res.order.id as string;
}

describe("Kurir + GPS", () => {
  let cour: any;
  beforeAll(async () => {
    cour = await import("@/lib/garage-courier");
    await t.getDb().insert(t.schema.user).values([
      { id: KURIR, name: "Andi Kurir", email: `${KURIR}@garage.id` },
      { id: KURIR2, name: "Bayu Kurir", email: `${KURIR2}@garage.id` },
    ]);
    await t.getDb().insert(t.schema.staffProfiles).values([
      { userId: KURIR, outletId, role: "Waiter", workstation: "kurir" },
      { userId: KURIR2, outletId, role: "Waiter", workstation: "kurir" },
    ]);
    // Andi menyalakan "Siap antar"; Bayu masih offline.
    await cour.setCourierAvailability({ available: true }, courier());
  });

  it("kasir menugaskan kurir; kurir lain & waiter biasa ditolak; GPS hanya saat diantar lalu dihapus", async () => {
    const id = await paidDelivery({ customerLat: 3.3285, customerLng: 99.1625 });
    const list = await cour.listCouriers(kasir());
    expect(list.map((c: any) => c.name)).toEqual(["Andi Kurir", "Bayu Kurir", "Zaki Standby"]);
    expect(list.find((c: any) => c.userId === KURIR)).toMatchObject({ status: "available", assignable: true });
    expect(list.find((c: any) => c.userId === KURIR2)).toMatchObject({ status: "offline", assignable: false });
    // Kurir offline tidak bisa ditugaskan.
    await expect(cour.assignCourier(id, KURIR2, kasir())).rejects.toThrow(/offline/);

    // Kurir tidak bisa menugaskan diri sendiri (bukan pegang uang).
    await expect(cour.assignCourier(id, KURIR, courier())).rejects.toThrow(/kasir/);
    const assigned = await cour.assignCourier(id, KURIR, kasir());
    expect(assigned.courierName).toBe("Andi Kurir");
    expect(assigned.deliveryStatus).toBe("preparing");

    // GPS sebelum berangkat ditolak; kurir lain ditolak.
    await expect(cour.updateCourierLocation(id, 3.33, 99.16, courier())).rejects.toThrow(/sedang diantar/);
    await expect(cour.courierDeliveryAction(id, "pickup", courier(KURIR2, "Bayu Kurir"))).rejects.toThrow(/tidak ditugaskan/);

    // Belum SIAP di Bar/Dapur → belum bisa diambil kurir.
    const { eq } = await import("drizzle-orm");
    const tickets = await t.getDb().select().from(t.schema.kitchenTickets).where(eq(t.schema.kitchenTickets.orderId, id));
    if (tickets.length) {
      await expect(cour.courierDeliveryAction(id, "pickup", courier())).rejects.toThrow(/Bar\/Dapur/);
      await t
        .getDb()
        .update(t.schema.kitchenTickets)
        .set({ status: "ready" })
        .where(eq(t.schema.kitchenTickets.orderId, id));
    }
    await cour.courierDeliveryAction(id, "pickup", courier());
    // Tiket SIAP otomatis tertutup (diserahkan ke kurir).
    const closed = await t.getDb().select().from(t.schema.kitchenTickets).where(eq(t.schema.kitchenTickets.orderId, id));
    expect(closed.every((ticket: any) => ticket.status === "delivered")).toBe(true);
    const otw = await cour.courierDeliveryAction(id, "depart", courier());
    expect(otw.deliveryStatus).toBe("on_the_way");
    await cour.updateCourierLocation(id, 3.3301, 99.1601, courier());
    await expect(cour.updateCourierLocation(id, 3.33, 99.16, courier(KURIR2, "Bayu Kurir"))).rejects.toThrow(/tidak ditugaskan/);
    await expect(cour.updateCourierLocation(id, 999, 99.16, courier())).rejects.toThrow(/tidak valid/);

    // Pelanggan (lewat id order) melihat kurir, posisi & jarak; lewat nomor order hanya nama.
    const pub = await svc.getPublicCustomerOrderStatus(id);
    expect(pub.fulfillment).toBe("delivery");
    expect(pub.courier).toMatchObject({ name: "Andi", lat: 3.3301, lng: 99.1601 });
    expect(pub.courier.distanceKm).toBeGreaterThan(0);
    expect(pub.steps.find((s: any) => s.key === "on_the_way").state).toBe("current");
    const byNo = await svc.getPublicCustomerOrderStatus(pub.orderNo);
    expect(byNo.courier).toMatchObject({ name: "Andi", lat: null, lng: null, distanceKm: null });

    // Melepas kurir saat sedang dibawa ditolak.
    await expect(cour.assignCourier(id, null, kasir())).rejects.toThrow(/sedang dibawa/);

    // Sudah sampai wajib foto bukti terkirim.
    await expect(cour.courierDeliveryAction(id, "arrive", courier())).rejects.toThrow(/foto bukti/);
    await cour.attachDeliveryProof(id, "/api/courier/proof/proof-test.jpg", courier());
    const arrived = await cour.courierDeliveryAction(id, "arrive", courier());
    expect(arrived.deliveryStatus).toBe("delivered");
    expect(arrived.deliveredAt).toBeTruthy();
    const after = await svc.getPublicCustomerOrderStatus(id);
    expect(after.courier.lat).toBeNull(); // GPS dihapus (privasi)
    expect(after.steps.at(-1)).toMatchObject({ key: "arrived", state: "done" });
    await expect(cour.updateCourierLocation(id, 3.33, 99.16, courier())).rejects.toThrow(/sedang diantar/);

    const board = await cour.getCourierBoard(courier());
    expect(board.isCourier).toBe(true);
    expect(board.done.map((o: any) => o.id)).toContain(id);
    expect(board.active.map((o: any) => o.id)).not.toContain(id);
  });

  it("delivery belum lunas tidak bisa ditugaskan", async () => {
    const res = await svc.createCustomerOrder(deliveryInput());
    await expect(cour.assignCourier(res.order.id, KURIR, kasir())).rejects.toThrow(/lunas/);
  });

  it("kurir Tersedia ambil sendiri; klaim kedua ditolak; kurir sibuk/offline tidak bisa ambil", async () => {
    const id = await paidDelivery();
    const board = await cour.getCourierBoard(courier());
    expect(board.me).toMatchObject({ status: "available" });
    expect(board.claimable.map((o: any) => o.id)).toContain(id);

    // Bayu offline → tidak bisa ambil.
    await expect(cour.claimDeliveryOrder(id, courier(KURIR2, "Bayu Kurir"))).rejects.toThrow(/Siap antar/);
    const claimed = await cour.claimDeliveryOrder(id, courier());
    expect(claimed.courierName).toBe("Andi Kurir");

    // Andi sekarang "Ditugaskan" → tidak bisa ambil pesanan lain; Bayu online tapi pesanan sudah diambil.
    const [andi] = (await cour.listCouriers(kasir())).filter((c: any) => c.userId === KURIR);
    expect(andi.status).toBe("assigned");
    await cour.setCourierAvailability({ available: true }, courier(KURIR2, "Bayu Kurir"));
    await expect(cour.claimDeliveryOrder(id, courier(KURIR2, "Bayu Kurir"))).rejects.toThrow(/sudah diambil/);
    const other = await paidDelivery();
    await expect(cour.claimDeliveryOrder(other, courier())).rejects.toThrow(/Selesaikan antaran/);
  });

  it("tanpa kurir siap antar, delivery tidak bisa dipesan & tidak tampil di menu", async () => {
    const { eq } = await import("drizzle-orm");
    await t
      .getDb()
      .update(t.schema.staffProfiles)
      .set({ courierAvailability: "offline" })
      .where(eq(t.schema.staffProfiles.workstation, "kurir"));
    const billing = await svc.getCustomerOrderBillingSettings(outletId);
    expect(billing.deliveryEnabled).toBe(false);
    expect(billing.deliveryUnavailableReason).toMatch(/Kurir sedang tidak tersedia/);
    await expect(svc.createCustomerOrder(deliveryInput())).rejects.toThrow(/Kurir sedang tidak tersedia/);
    await t
      .getDb()
      .update(t.schema.staffProfiles)
      .set({ courierAvailability: "available" })
      .where(eq(t.schema.staffProfiles.userId, STANDBY));
    expect((await svc.getCustomerOrderBillingSettings(outletId)).deliveryEnabled).toBe(true);
  });
});

describe("Indikator status per tipe pesanan", () => {
  it("take away: Pembayaran diterima → Diracik → Dipacking → Siap diambil", async () => {
    const res = await svc.createCustomerOrder({
      orderType: "takeaway",
      customerMode: "guest",
      guestName: "Tia",
      paymentMethod: "QRIS",
      source: "qr_takeaway",
      items: [{ itemId: "itm-coffee", variantId: "reg", qty: 1 }],
    });
    const waiting = await svc.getPublicCustomerOrderStatus(res.order.id);
    expect(waiting.fulfillment).toBe("takeaway");
    expect(waiting.steps.map((s: any) => s.label)).toEqual(["Pembayaran diterima", "Dimasak", "Dipacking", "Siap diambil"]);
    expect(waiting.steps.every((s: any) => s.state === "todo")).toBe(true);

    await svc.updateCustomerOrderStatus(res.order.id, { action: "paid", paymentMethod: "QRIS" }, kasir());
    const paid = await svc.getPublicCustomerOrderStatus(res.order.id);
    expect(paid.steps[0].state).toBe("done");
    expect(paid.steps[1].state).toBe("current");
    expect(paid.stations[0].verb).toBe(paid.stations[0].station === "Bar" ? "Diracik" : "Dimasak");
  });
});

describe("Tolak otomatis order belum bayar", () => {
  it("take away/delivery > 30 menit ditolak; dine-in & yang baru tidak disentuh", async () => {
    const cour = await import("@/lib/garage-courier");
    const { eq } = await import("drizzle-orm");
    const old = await svc.createCustomerOrder(deliveryInput());
    const fresh = await svc.createCustomerOrder(deliveryInput());
    const dine = await svc.createCustomerOrder({
      orderType: "dine-in",
      tableLabel: "Meja 7",
      customerMode: "guest",
      guestName: "Meja Tujuh",
      paymentMethod: "Cash",
      source: "qr_table",
      items: [{ itemId: "itm-coffee", variantId: "reg", qty: 1 }],
    });
    const past = new Date(Date.now() - 31 * 60_000);
    for (const id of [old.order.id, dine.order.id]) {
      await t.getDb().update(t.schema.orders).set({ createdAt: past }).where(eq(t.schema.orders.id, id));
    }
    const rejected = await cour.sweepUnpaidOrders();
    expect(rejected).toEqual([old.order.orderNo]);
    const [row] = await t.getDb().select().from(t.schema.orders).where(eq(t.schema.orders.id, old.order.id));
    expect(row.status).toBe("rejected");
    expect(row.rejectionReason).toBe("Tidak dibayar dalam 30 menit");
    expect(row.rejectedBy).toBeNull();
    const [freshRow] = await t.getDb().select().from(t.schema.orders).where(eq(t.schema.orders.id, fresh.order.id));
    expect(freshRow.status).toBe("awaiting_payment");

    // 0 = mati.
    await t.getDb().update(t.schema.orders).set({ createdAt: past }).where(eq(t.schema.orders.id, fresh.order.id));
    await svc.updateAppSettings(outletId, { unpaidOrderAutoRejectMinutes: 0 }, kasir());
    expect(await cour.sweepUnpaidOrders()).toEqual([]);
    await svc.updateAppSettings(outletId, { unpaidOrderAutoRejectMinutes: 30 }, kasir());
  });
});

describe("Ongkir terpisah dari penjualan", () => {
  it("loadDayRaws: net sales hari ini tidak memuat ongkir; ongkir tercatat di deliveryFees", async () => {
    const { loadDayRaws } = await import("@/lib/finance-control");
    const { jakartaDateKey } = await import("@/lib/finance-control-core");
    const today = jakartaDateKey();
    const before = (await loadDayRaws(today, today)).get(today);
    const id = await paidDelivery();
    const after = (await loadDayRaws(today, today)).get(today);
    const { eq } = await import("drizzle-orm");
    const [row] = await t.getDb().select().from(t.schema.orders).where(eq(t.schema.orders.id, id));
    expect((after?.deliveryFees ?? 0) - (before?.deliveryFees ?? 0)).toBe(5000);
    expect((after?.netSales ?? 0) - (before?.netSales ?? 0)).toBe(row.total - row.tax - 5000);
  });
});
