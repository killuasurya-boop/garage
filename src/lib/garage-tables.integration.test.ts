import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { GarageSession } from "@/lib/server-auth";
import type { Role } from "@/lib/garage-data";
import { formatTableDuration, parseTableNumber, tableLabelFor } from "@/lib/garage-tables";
import {
  seedGarageBasics,
  setupGarageTestDb,
  teardownGarageTestDb,
  type GarageTestDb,
} from "@/lib/test-helpers/garage-test-db";

// =============================================================================
// Logika meja: nomor ketat, label kanonik, pindah meja (semua bill + tiket),
// order QR setelah meja dibersihkan, meja nonaktif, sesi dari hari sebelumnya.
// =============================================================================

/* eslint-disable @typescript-eslint/no-explicit-any */
let t: GarageTestDb;
let svc: any;
let outletId = "";

const KASIR = "user-itest-tbl-kasir";
const OWNER = "user-itest-tbl-owner";

function makeSession(userId: string, name: string, role: Role): GarageSession {
  return {
    user: { id: userId, name },
    profile: {
      id: `sp-${userId}`,
      role,
      shiftLabel: "Pagi",
      deviceLabel: "TBL-1",
      passwordResetRequired: false,
      workstation: null,
      outlet: { id: outletId, code: "TST", name: "Outlet Test", timezone: "Asia/Jakarta" },
    },
  } as unknown as GarageSession;
}

const kasir = () => makeSession(KASIR, "Kasir Test", "Kasir");
const owner = () => makeSession(OWNER, "Owner Test", "Owner");

async function qrOrder(tableLabel: string, qty = 1) {
  const created = await svc.createCustomerOrder({
    orderType: "dine-in",
    tableLabel,
    customerMode: "guest",
    guestName: "Tamu Meja",
    paymentMethod: "Cash",
    source: "qr_table",
    items: [{ itemId: "itm-coffee", variantId: "reg", qty }],
  });
  return created.order.id as string;
}

async function liveRow(tableNumber: string) {
  return svc.getTableLiveRow(tableNumber, outletId);
}

beforeAll(async () => {
  t = await setupGarageTestDb();
  const seeded = await seedGarageBasics(t, { userId: KASIR });
  outletId = seeded.outletId;
  await t.getDb().insert(t.schema.user).values([{ id: OWNER, name: "Owner Test", email: `${OWNER}@garage.id` }]);
  await t.getDb().insert(t.schema.staffProfiles).values([{ userId: OWNER, outletId, role: "Owner" }]);
  svc = await import("@/lib/garage-service");
}, 60_000);

afterAll(async () => {
  await teardownGarageTestDb(t);
});

describe("Helper nomor meja", () => {
  it("menerima format umum dan menolak nomor di luar batas tanpa memotong", () => {
    expect(parseTableNumber("6")).toBe("06");
    expect(parseTableNumber("Meja 6")).toBe("06");
    expect(parseTableNumber("meja 06")).toBe("06");
    expect(parseTableNumber(12)).toBe("12");
    expect(parseTableNumber("123")).toBeNull();
    expect(parseTableNumber("Meja 100")).toBeNull();
    expect(parseTableNumber("Meja QR")).toBeNull();
    expect(parseTableNumber("0")).toBeNull();
    expect(parseTableNumber("Meja 1 2")).toBeNull();
    expect(tableLabelFor("6")).toBe("Meja 06");
  });

  it("durasi ringkas mudah dibaca", () => {
    expect(formatTableDuration(8)).toBe("8m");
    expect(formatTableDuration(85)).toBe("1j 25m");
    expect(formatTableDuration(120)).toBe("2j");
    expect(formatTableDuration(1500)).toBe("1h 1j");
  });
});

describe("Order QR & label meja", () => {
  it("label QR disimpan kanonik 'Meja 06' sehingga rincian item meja terbaca", async () => {
    const orderId = await qrOrder("Meja 6");
    const { eq } = await import("drizzle-orm");
    const [row] = await t.getDb().select().from(t.schema.orders).where(eq(t.schema.orders.id, orderId));
    expect(row.tableLabel).toBe("Meja 06");
    const items = await svc.getTableOrderItems("06", outletId);
    expect(items.bills.map((bill: any) => bill.id)).toContain(orderId);
  });

  it("nomor meja tidak valid ditolak (tidak pernah jadi meja lain)", async () => {
    await expect(qrOrder("Meja 123")).rejects.toThrow(/Nomor meja tidak dikenali/);
    await expect(qrOrder("Meja QR")).rejects.toThrow(/Nomor meja tidak dikenali/);
  });

  it("order QR baru tetap tampil di meja yang baru dibersihkan", async () => {
    const first = await qrOrder("Meja 7");
    await svc.updateCustomerOrderStatus(first, { action: "paid", paymentMethod: "Cash" }, kasir());
    await svc.updateTableStatus("07", { status: "empty" }, kasir());
    expect((await liveRow("07")).status).toBe("empty");

    const second = await qrOrder("Meja 7");
    const row = await liveRow("07");
    expect(row.currentOrderId).toBe(second);
    expect(row.openBillCount).toBe(1);
    // Bill rombongan sebelumnya (sudah dibersihkan) tidak ikut.
    expect(row.bills.map((bill: any) => bill.id)).not.toContain(first);
  });
});

describe("Pindah meja", () => {
  it("memindahkan semua bill aktif + label tiket produksi ke meja tujuan", async () => {
    const a = await qrOrder("Meja 10");
    const b = await qrOrder("Meja 10");
    await svc.updateCustomerOrderStatus(a, { action: "accept" }, kasir());
    await svc.updateCustomerOrderStatus(b, { action: "accept" }, kasir());

    const result = await svc.moveTable("10", "11", kasir());
    expect(result.orderIds.sort()).toEqual([a, b].sort());

    const { inArray } = await import("drizzle-orm");
    const movedOrders = await t
      .getDb()
      .select()
      .from(t.schema.orders)
      .where(inArray(t.schema.orders.id, [a, b]));
    expect(movedOrders.every((order: any) => order.tableLabel === "Meja 11")).toBe(true);
    const tickets = await t
      .getDb()
      .select()
      .from(t.schema.kitchenTickets)
      .where(inArray(t.schema.kitchenTickets.orderId, [a, b]));
    expect(tickets.length).toBeGreaterThan(0);
    expect(tickets.every((ticket: any) => ticket.tableLabel === "Meja 11")).toBe(true);

    const source = await liveRow("10");
    const target = await liveRow("11");
    expect(source.status).toBe("empty");
    expect(source.openBillCount).toBe(0);
    expect(target.openBillCount).toBe(2);
  });

  it("menolak pindah ke meja yang masih punya bill aktif", async () => {
    await qrOrder("Meja 12");
    await qrOrder("Meja 13");
    await expect(svc.moveTable("12", "13", kasir())).rejects.toThrow(/Meja tujuan/);
  });
});

describe("Master meja (Atur Meja)", () => {
  it("meja nonaktif hilang dari peta & order ke meja itu ditolak", async () => {
    const config = await svc.getOutletTables(outletId);
    expect(config.configured).toBe(false);
    expect(config.tables).toHaveLength(50);

    // Aktifkan 01–40 saja, kecuali meja yang sedang dipakai tes lain tetap aktif.
    const tables = config.tables.map((table: any) => ({
      tableNumber: table.tableNumber,
      area: Number(table.tableNumber) <= 20 ? "Indoor" : "Outdoor",
      capacity: 4,
      active: Number(table.tableNumber) <= 40,
    }));
    const saved = await svc.saveOutletTables({ tables }, owner());
    expect(saved.configured).toBe(true);
    expect(saved.tables.filter((table: any) => table.active)).toHaveLength(40);

    const live = await svc.getTableLiveData({ outletId });
    expect(live.some((row: any) => row.tableNumber === "45")).toBe(false);
    expect(live.find((row: any) => row.tableNumber === "21")?.area).toBe("Outdoor");

    await expect(qrOrder("Meja 45")).rejects.toThrow(/tidak aktif/);
  });

  it("meja yang masih dipakai tamu tidak bisa dinonaktifkan", async () => {
    await qrOrder("Meja 30");
    const config = await svc.getOutletTables(outletId);
    const tables = config.tables.map((table: any) => ({
      tableNumber: table.tableNumber,
      active: table.tableNumber === "30" ? false : table.active,
    }));
    await expect(svc.saveOutletTables({ tables }, owner())).rejects.toThrow(/Meja 30 masih dipakai/);
  });
});

describe("Sesi dari hari sebelumnya", () => {
  async function backdate(orderId: string) {
    const { eq } = await import("drizzle-orm");
    const yesterday = new Date(Date.now() - 26 * 60 * 60 * 1000);
    await t
      .getDb()
      .update(t.schema.orders)
      .set({ createdAt: yesterday, updatedAt: yesterday })
      .where(eq(t.schema.orders.id, orderId));
  }

  it("meja lunas kemarin kembali kosong; belum lunas kemarin ditandai cek kasir", async () => {
    const paid = await qrOrder("Meja 20");
    await svc.updateCustomerOrderStatus(paid, { action: "paid", paymentMethod: "Cash" }, kasir());
    await backdate(paid);
    const paidRow = await liveRow("20");
    expect(paidRow.status).toBe("empty");
    expect(paidRow.staleFromPreviousDay).toBe(false);

    const open = await qrOrder("Meja 21");
    await svc.updateCustomerOrderStatus(open, { action: "accept" }, kasir());
    await backdate(open);
    const openRow = await liveRow("21");
    expect(openRow.staleFromPreviousDay).toBe(true);
    expect(openRow.currentOrderId).toBe(open);
    expect(openRow.openBillCount).toBe(1);
  });
});
