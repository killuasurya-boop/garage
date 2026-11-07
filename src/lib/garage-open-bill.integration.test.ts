import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { Role } from "@/lib/garage-data";
import type { GarageSession } from "@/lib/server-auth";
import {
  seedGarageBasics,
  setupGarageTestDb,
  teardownGarageTestDb,
  type GarageTestDb,
} from "@/lib/test-helpers/garage-test-db";

// "Bayar nanti" dari POS: tagihan terbuka → tiket Bar/Dapur langsung jalan →
// dilunasi Final Bayar dengan kembalian tercatat. Rokok (tersembunyi dari menu
// digital) tetap bisa dipesan kasir dan tidak membuat tiket.

/* eslint-disable @typescript-eslint/no-explicit-any */
let t: GarageTestDb;
let svc: any;
let outletId = "";
const KASIR = "user-itest-openbill-kasir";

const kasir = () =>
  ({
    user: { id: KASIR, name: "Kasir Test", email: `${KASIR}@garage.id` },
    profile: {
      id: `sp-${KASIR}`,
      role: "Kasir" as Role,
      shiftLabel: "Pagi",
      deviceLabel: "Kasir-1",
      passwordResetRequired: false,
      workstation: null,
      outlet: { id: outletId, code: "TST", name: "Outlet Test", timezone: "Asia/Jakarta" },
    },
  }) as unknown as GarageSession;

const asRole = (role: Role) => {
  const session = kasir() as any;
  return { ...session, profile: { ...session.profile, role } } as GarageSession;
};

async function rowsWhere(table: any, column: any, value: string) {
  const { eq } = await import("drizzle-orm");
  return t.getDb().select().from(table).where(eq(column, value));
}

beforeAll(async () => {
  t = await setupGarageTestDb();
  outletId = (await seedGarageBasics(t, { userId: KASIR })).outletId;
  await t.getDb().insert(t.schema.menuItems).values({
    id: "itm-rokok",
    name: "Rokok Test",
    category: "Rokok",
    section: "Rokok",
    prep: "0m",
    showInDigitalMenu: false,
  });
  await t.getDb().insert(t.schema.menuVariants).values({ itemId: "itm-rokok", variantId: "reg", label: "Regular", price: 18000 });
  svc = await import("@/lib/garage-service");
}, 60_000);

afterAll(async () => {
  await teardownGarageTestDb(t);
});

describe("Bayar nanti (open bill)", () => {
  it("tagihan terbuka, tiket jalan, lalu Final Bayar tunai dengan kembalian", async () => {
    // Pelanggan QR biasa tidak boleh memesan produk tersembunyi.
    await expect(
      svc.createCustomerOrder({
        orderType: "takeaway",
        customerMode: "guest",
        guestName: "Andi",
        paymentMethod: "Cash",
        items: [{ itemId: "itm-rokok", variantId: "reg", qty: 1 }],
      }),
    ).rejects.toThrow(/tidak tersedia di menu digital/);

    const created = await svc.createCustomerOrder({
      orderType: "takeaway",
      outletId,
      customerMode: "guest",
      guestName: "Andi",
      source: "qr_takeaway",
      staffOrder: true,
      allowHiddenItems: true,
      paymentMethod: "Cash",
      items: [
        { itemId: "itm-food", variantId: "reg", qty: 1 },
        { itemId: "itm-rokok", variantId: "reg", qty: 1 },
      ],
    });
    const orderId = created.order.id;
    await svc.updateCustomerOrderStatus(orderId, { action: "accept" }, kasir(), { openBill: true });

    const [open] = await rowsWhere(t.schema.orders, t.schema.orders.id, orderId);
    expect(open.status).not.toBe("paid");
    const tickets = await rowsWhere(t.schema.kitchenTickets, t.schema.kitchenTickets.orderId, orderId);
    expect(tickets.map((ticket: any) => ticket.station)).toEqual(["Food"]);

    await svc.updateCustomerOrderStatus(
      orderId,
      { action: "paid", paymentMethod: "Cash", cashReceived: open.total + 7_000 },
      kasir(),
    );
    const [paid] = await rowsWhere(t.schema.orders, t.schema.orders.id, orderId);
    expect(paid.status).toBe("paid");
  });

  it("hapus invoice belum lunas: hanya Owner/Manajer, wajib konfirmasi nomor, tercatat audit; lunas ditolak", async () => {
    const created = await svc.createCustomerOrder({
      orderType: "dine-in",
      tableLabel: "Meja 05",
      outletId,
      customerMode: "guest",
      guestName: "Budi",
      source: "qr_table",
      staffOrder: true,
      allowHiddenItems: true,
      paymentMethod: "Cash",
      items: [{ itemId: "itm-food", variantId: "reg", qty: 2 }],
    });
    const orderId = created.order.id;
    const orderNo = created.order.orderNo;
    await svc.updateCustomerOrderStatus(orderId, { action: "accept" }, kasir(), { openBill: true });

    await expect(
      svc.deleteUnpaidInvoice(orderId, { reason: "Salah input pesanan", confirmOrderNo: orderNo }, kasir()),
    ).rejects.toThrow(/Owner atau Manajer/);
    await expect(
      svc.deleteUnpaidInvoice(orderId, { reason: "Salah input pesanan", confirmOrderNo: "POS-SALAH" }, asRole("Manajer")),
    ).rejects.toThrow(/tidak cocok/);

    await svc.deleteUnpaidInvoice(orderId, { reason: "Salah input pesanan", confirmOrderNo: orderNo }, asRole("Manajer"));
    const [deleted] = await rowsWhere(t.schema.orders, t.schema.orders.id, orderId);
    expect(deleted.status).toBe("voided");
    const tickets = await rowsWhere(t.schema.kitchenTickets, t.schema.kitchenTickets.orderId, orderId);
    expect(tickets.every((ticket: any) => ticket.status === "cancelled")).toBe(true);
    const { like } = await import("drizzle-orm");
    const audit = await t.getDb().select().from(t.schema.auditLogs).where(like(t.schema.auditLogs.action, `Hapus invoice ${orderNo}%`));
    expect(audit).toHaveLength(1);
    expect((audit[0].metadata as any).reason).toMatch(/Salah input pesanan/);

    // Invoice lunas tidak bisa dihapus (harus Batal/Refund).
    const paidOrder = await svc.createCustomerOrder({
      orderType: "takeaway",
      outletId,
      customerMode: "guest",
      guestName: "Cici",
      source: "qr_takeaway",
      staffOrder: true,
      paymentMethod: "Cash",
      items: [{ itemId: "itm-food", variantId: "reg", qty: 1 }],
    });
    await svc.updateCustomerOrderStatus(paidOrder.order.id, { action: "accept" }, kasir(), { openBill: true });
    const [open2] = await rowsWhere(t.schema.orders, t.schema.orders.id, paidOrder.order.id);
    await svc.updateCustomerOrderStatus(
      paidOrder.order.id,
      { action: "paid", paymentMethod: "Cash", cashReceived: open2.total },
      kasir(),
    );
    await expect(
      svc.deleteUnpaidInvoice(
        paidOrder.order.id,
        { reason: "Coba hapus lunas", confirmOrderNo: paidOrder.order.orderNo },
        asRole("Owner"),
      ),
    ).rejects.toThrow(/LUNAS/);

    const receipt = await svc.getOrderForReceipt(paidOrder.order.id);
    expect(receipt.order.paymentStatus).toBe("paid");
    expect(receipt.items.length).toBe(1);
    const deletedReceipt = await svc.getOrderForReceipt(orderNo);
    expect(deletedReceipt.order.paymentStatus).toBe("cancelled");
    expect(deletedReceipt.items.length).toBe(1);
  });

  it("Belum Bayar: scope unpaid = outlet sendiri, semua status belum lunas, ditandai staffOrder + WA", async () => {
    const created = await svc.createCustomerOrder({
      orderType: "takeaway",
      outletId,
      customerMode: "guest",
      guestName: "Citra",
      guestPhone: "081234567890",
      source: "qr_takeaway",
      staffOrder: true,
      allowHiddenItems: true,
      paymentMethod: "Cash",
      items: [{ itemId: "itm-food", variantId: "reg", qty: 1 }],
    });
    await svc.updateCustomerOrderStatus(created.order.id, { action: "accept" }, kasir(), { openBill: true });

    const unpaid = await svc.getCustomerOrderData({ scope: "unpaid", outletId });
    const row = unpaid.find((order: any) => order.id === created.order.id);
    expect(row).toBeTruthy();
    expect(row.staffOrder).toBe(true);
    expect(row.customerPhone).toBe("081234567890");
    expect(row.items).toHaveLength(1);
    expect(unpaid.every((order: any) => ["pending_cashier", "awaiting_payment", "accepted"].includes(order.status))).toBe(true);

    // Outlet lain tidak melihat tagihan ini.
    const other = await svc.getCustomerOrderData({ scope: "unpaid", outletId: "00000000-0000-0000-0000-000000000000" });
    expect(other.some((order: any) => order.id === created.order.id)).toBe(false);

    // Setelah lunas, hilang dari daftar Belum Bayar.
    await svc.updateCustomerOrderStatus(
      created.order.id,
      { action: "paid", paymentMethod: "Cash", cashReceived: created.order.total },
      kasir(),
    );
    const after = await svc.getCustomerOrderData({ scope: "unpaid", outletId });
    expect(after.some((order: any) => order.id === created.order.id)).toBe(false);
  });
});
