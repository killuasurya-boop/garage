import { describe, it, expect, beforeAll, afterAll } from "vitest";

import type { GarageSession } from "@/lib/server-auth";
import type { Role } from "@/lib/garage-data";
import {
  setupGarageTestDb,
  teardownGarageTestDb,
  seedGarageBasics,
  type GarageTestDb,
} from "@/lib/test-helpers/garage-test-db";

// =============================================================================
// Regresi audit logika (Sep 2026):
// - Order QR ditolak SETELAH diterima dapur → stok (WMS) kembali & tiket batal.
// - Bayar invoice supplier bertahap dijumlah; invoice lunas tak bisa dibayar lagi.
// - Receiving WMS membuat tagihan supplier (hutang) supaya belanja tercatat.
// =============================================================================

/* eslint-disable @typescript-eslint/no-explicit-any */
let t: GarageTestDb;
let svc: any;
let wms: any;
let outletId = "";
let milkId = "";
const KASIR = "user-itest-kasir";

function session(role: Role = "Kasir" as Role): GarageSession {
  return {
    user: { id: KASIR, name: "Kasir Test" },
    profile: {
      id: "sp",
      role,
      shiftLabel: "Pagi",
      deviceLabel: "Kasir-1",
      passwordResetRequired: false,
      outlet: { id: outletId, code: "TST", name: "Outlet Test", timezone: "Asia/Jakarta" },
    },
  } as unknown as GarageSession;
}

async function wmsTotal(sku: string) {
  const rows = await wms.getWmsProducts({ warehouseId: "all" });
  return Number(rows.find((r: any) => r.sku === sku)?.onHand ?? NaN);
}

beforeAll(async () => {
  t = await setupGarageTestDb();
  ({ outletId } = await seedGarageBasics(t, { userId: KASIR }));
  svc = await import("@/lib/garage-service");
  wms = await import("@/lib/wms-service");
  await wms.listWmsWarehouses();
  await t.getDb().insert(t.schema.wmsCategory).values({ name: "Bar · Susu Audit", area: "bar" }).onConflictDoNothing();
  const prod = await wms.createWmsProduct({
    sku: "A-MILK",
    name: "Susu Audit",
    category: "Bar · Susu Audit",
    unit: "ml",
    packPrice: 24_000,
    packQty: 1000,
  });
  milkId = prod.id;
  await t.getDb().insert(t.schema.menuRecipes).values({
    menuItemId: "itm-coffee",
    variantId: "all",
    inventorySku: "A-MILK",
    qty: 120,
    unit: "ml",
  });
}, 60_000);

afterAll(async () => {
  await teardownGarageTestDb(t);
});

describe("Receiving WMS → belanja cash lunas (tanpa hutang)", () => {
  it("receiving selesai → stok masuk & belanja Bar lunas tercatat (termasuk ongkir), tanpa invoice hutang", async () => {
    const rec = await wms.createReceiving({
      supplier: "Toko Susu",
      additionalCost: 5_000,
      items: [
        {
          productId: milkId,
          orderedQty: 2000,
          receivedQty: 2000,
          hpp: 24,
          expiredAt: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString(),
        },
      ],
    });
    await wms.completeReceiving(rec.id);
    expect(await wmsTotal("A-MILK")).toBe(2000);

    const { eq, like } = await import("drizzle-orm");
    const invoices = await t
      .getDb()
      .select()
      .from(t.schema.supplierInvoices)
      .where(like(t.schema.supplierInvoices.invoiceNo, `${rec.doc}%`));
    expect(invoices).toHaveLength(0);

    const [exp] = await t
      .getDb()
      .select()
      .from(t.schema.expenses)
      .where(eq(t.schema.expenses.sourceDoc, `WMS:${rec.doc}#bar`));
    expect(exp).toBeTruthy();
    expect(exp.amount).toBe(2000 * 24 + 5_000);
    expect(exp.status).toBe("paid");
    expect(exp.paymentMethod).toBe("Cash");
    expect(exp.category).toBe("Belanja Bar");

    // Selesaikan ulang (retry) → tidak membuat belanja kedua.
    await wms.completeReceiving(rec.id);
    const all = await t.getDb().select().from(t.schema.expenses).where(like(t.schema.expenses.sourceDoc, `WMS:${rec.doc}%`));
    expect(all.length).toBe(1);

    // Laba rugi hari ini: belanja Bar = biaya bahan (mode default "purchase").
    const fc = await import("@/lib/finance-control");
    const { jakartaDateKey } = await import("@/lib/finance-control-core");
    const config = await fc.loadFinanceConfig();
    expect(config.cogsBasis).toBe("purchase");
    const raws = await fc.loadDayRaws(jakartaDateKey(), jakartaDateKey());
    const raw = raws.get(jakartaDateKey())!;
    expect(raw.purchases.bar).toBe(2000 * 24 + 5_000);
  });
});

describe("Bayar invoice supplier", () => {
  it("bayar bertahap dijumlah, lunas tidak bisa dibayar lagi, uang keluar tidak dobel", async () => {
    const inv = await svc.createSupplierInvoice(
      { invoiceNo: "INV-AUDIT-1", amount: 900_000, dueDate: new Date().toISOString(), category: "Belanja Bar" },
      session("Owner" as Role),
    );
    const first = await svc.markSupplierInvoicePaid({ id: inv.id, amount: 400_000 }, session("Owner" as Role));
    expect(first.status).toBe("partial");
    expect(first.paidAmount).toBe(400_000);

    const second = await svc.markSupplierInvoicePaid({ id: inv.id, amount: 500_000 }, session("Owner" as Role));
    expect(second.status).toBe("paid");
    expect(second.paidAmount).toBe(900_000);

    await expect(svc.markSupplierInvoicePaid({ id: inv.id }, session("Owner" as Role))).rejects.toThrow(/lunas/i);

    const { eq } = await import("drizzle-orm");
    const expenses = await t
      .getDb()
      .select()
      .from(t.schema.expenses)
      .where(eq(t.schema.expenses.supplierInvoiceId, inv.id));
    expect(expenses.reduce((sum: number, e: any) => sum + Number(e.amount), 0)).toBe(900_000);
  });
});

describe("Void order member → poin & voucher ditarik", () => {
  it("poin dari order hilang, kunjungan turun, kuota voucher kembali", async () => {
    const d = t.getDb();
    const { eq } = await import("drizzle-orm");
    const [cust] = await d
      .insert(t.schema.customers)
      .values({ name: "Member Audit", phone: "081299990001", tier: "Bronze" })
      .returning();
    await d.insert(t.schema.memberAccounts).values({
      customerId: cust.id,
      name: "Member Audit",
      phone: "081299990001",
      passwordHash: "x",
    });
    const [voucher] = await d
      .insert(t.schema.vouchers)
      .values({ code: "AUDIT5K", title: "Diskon 5K", type: "fixed", value: 5_000, minSpend: 0, audience: "all", status: "active" })
      .returning();

    const res = await svc.createOrder(
      {
        orderType: "takeaway",
        paymentMethod: "Cash",
        cashReceived: 500_000,
        customerId: cust.id,
        voucherCode: "AUDIT5K",
        items: [{ itemId: "itm-food", variantId: "reg", qty: 5 }],
      },
      session(),
    );
    const [afterSale] = await d.select().from(t.schema.customers).where(eq(t.schema.customers.id, cust.id));
    expect(afterSale.points).toBeGreaterThan(0);
    expect(afterSale.visits).toBe(1);
    const [usedVoucher] = await d.select().from(t.schema.vouchers).where(eq(t.schema.vouchers.id, voucher.id));
    expect(usedVoucher.usedCount).toBe(1);

    await svc.voidOrder(res.orderNo, "Tes tarik poin", session("Owner" as Role));
    const [afterVoid] = await d.select().from(t.schema.customers).where(eq(t.schema.customers.id, cust.id));
    expect(afterVoid.points).toBe(0);
    expect(afterVoid.visits).toBe(0);
    const [restoredVoucher] = await d.select().from(t.schema.vouchers).where(eq(t.schema.vouchers.id, voucher.id));
    expect(restoredVoucher.usedCount).toBe(0);
  });
});

describe("Bonus referral ikut ditarik saat void", () => {
  it("void order pertama menarik bonus kedua pihak; transaksi sah berikutnya memberi bonus lagi", async () => {
    const d = t.getDb();
    const { eq } = await import("drizzle-orm");
    const { REFERRAL_BONUS_POINTS } = await import("@/lib/member-types");
    const [ajak] = await d
      .insert(t.schema.customers)
      .values({ name: "Pengajak", phone: "081299990010", tier: "Silver", referralCode: "AJAKAUDIT" })
      .returning();
    const [baru] = await d
      .insert(t.schema.customers)
      .values({ name: "Member Baru", phone: "081299990011", tier: "Silver", referredByCode: "AJAKAUDIT" })
      .returning();
    await d.insert(t.schema.memberAccounts).values({
      customerId: baru.id,
      name: "Member Baru",
      phone: "081299990011",
      passwordHash: "x",
    });
    const points = async (id: string) =>
      (await d.select().from(t.schema.customers).where(eq(t.schema.customers.id, id)))[0].points;
    const order = () =>
      svc.createOrder(
        {
          orderType: "takeaway",
          paymentMethod: "Cash",
          cashReceived: 500_000,
          customerId: baru.id,
          items: [{ itemId: "itm-food", variantId: "reg", qty: 2 }],
        },
        session(),
      );

    const first = await order();
    expect(await points(ajak.id)).toBe(REFERRAL_BONUS_POINTS);
    expect(await points(baru.id)).toBe(first.memberReward.pointsEarned + REFERRAL_BONUS_POINTS);

    await svc.voidOrder(first.orderNo, "Tes tarik bonus referral", session("Owner" as Role));
    expect(await points(ajak.id)).toBe(0);
    expect(await points(baru.id)).toBe(0);

    const second = await order();
    expect(await points(ajak.id)).toBe(REFERRAL_BONUS_POINTS);
    expect(await points(baru.id)).toBe(second.memberReward.pointsEarned + REFERRAL_BONUS_POINTS);

    // Transaksi ketiga bukan transaksi pertama lagi → tanpa bonus.
    const third = await order();
    expect(await points(ajak.id)).toBe(REFERRAL_BONUS_POINTS);
    expect(await points(baru.id)).toBe(
      second.memberReward.pointsEarned + third.memberReward.pointsEarned + REFERRAL_BONUS_POINTS,
    );
  });
});

describe("Order dobel dicegah oleh database", () => {
  const input = {
    orderType: "takeaway",
    paymentMethod: "Cash",
    cashReceived: 100_000,
    items: [{ itemId: "itm-food", variantId: "reg", qty: 1 }],
  };

  it("kirim ulang dengan kunci sama (mis. setelah server restart) → order & struk yang sama", async () => {
    const key = `${KASIR}:retry-key-0001`;
    const first = await svc.createOrder(input, session(), { requestKey: key });
    const again = await svc.createOrder(input, session(), { requestKey: key });
    expect(again.orderId).toBe(first.orderId);
    expect(again.orderNo).toBe(first.orderNo);
    expect(again.replayed).toBe(true);
    expect(again.total).toBe(first.total);
    expect(again.receipt.items).toEqual(first.receipt.items);
    expect(again.invoiceWebUrl).toBe(first.invoiceWebUrl);
  });

  it("dua kiriman berbarengan dengan kunci sama → hanya satu order", async () => {
    const key = `${KASIR}:race-key-0002`;
    const [a, b] = await Promise.all([
      svc.createOrder(input, session(), { requestKey: key }),
      svc.createOrder(input, session(), { requestKey: key }),
    ]);
    expect(a.orderId).toBe(b.orderId);
    const { eq } = await import("drizzle-orm");
    const rows = await t.getDb().select().from(t.schema.orders).where(eq(t.schema.orders.clientRequestKey, key));
    expect(rows.length).toBe(1);
  });
});

describe("Backup database terjadwal", () => {
  it("backup harian sekali per hari, lalu berkala bila backup terakhir > 6 jam", async () => {
    const fs = await import("node:fs/promises");
    const os = await import("node:os");
    const path = await import("node:path");
    const { runScheduledBackup, listBackups } = await import("@/lib/garage-db-backup");
    const local = await fs.mkdtemp(path.join(os.tmpdir(), "garage-bk-sched-"));
    process.env.GARAGE_BACKUP_DIR = local;
    try {
      const t0 = new Date("2026-10-01T03:00:00Z"); // 10.00 WIB
      expect((await runScheduledBackup(t0))?.label).toBe("harian");
      expect(await runScheduledBackup(new Date(t0.getTime() + 60 * 60 * 1000))).toBeNull();
      expect((await runScheduledBackup(new Date(t0.getTime() + 7 * 60 * 60 * 1000)))?.label).toBe("berkala");
      const all = await listBackups();
      expect(all.map((b) => b.label)).toEqual(["berkala", "harian"]);
      expect(all[1].createdAt).toBe(t0.toISOString());
    } finally {
      delete process.env.GARAGE_BACKUP_DIR;
      await fs.rm(local, { recursive: true, force: true });
    }
  });
});

describe("Tolak order QR setelah diterima dapur", () => {
  it("stok WMS kembali & tiket produksi dibatalkan", async () => {
    const before = await wmsTotal("A-MILK");
    const created = await svc.createCustomerOrder({
      orderType: "dine-in",
      tableLabel: "Meja 05",
      customerMode: "guest",
      guestName: "Tamu",
      paymentMethod: "QRIS",
      items: [{ itemId: "itm-coffee", variantId: "reg", qty: 2 }],
    });
    const order = created.order ?? created;
    await svc.updateCustomerOrderStatus(order.id, { action: "accept" }, session());
    expect(await wmsTotal("A-MILK")).toBe(before - 240);

    await svc.updateCustomerOrderStatus(order.id, { action: "request_bill" }, session());
    await svc.updateCustomerOrderStatus(order.id, { action: "reject", reason: "Tamu pergi sebelum dibuat" }, session());
    expect(await wmsTotal("A-MILK")).toBe(before);

    const { eq } = await import("drizzle-orm");
    const tickets = await t.getDb().select().from(t.schema.kitchenTickets).where(eq(t.schema.kitchenTickets.orderId, order.id));
    expect(tickets.length).toBeGreaterThan(0);
    expect(tickets.every((ticket: any) => ticket.status === "cancelled")).toBe(true);
  });
});
