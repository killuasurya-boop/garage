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
// Pakai poin member saat bayar (owner, Okt 2026):
// - 1 poin = Rp100, maks 50% harga menu setelah promo/voucher, minimal 50 poin;
// - poin didapat dari harga menu bersih (tanpa pajak/ongkir), 0,5 poin/Rp1.000;
// - void / tolak mengembalikan poin; split bill ditolak; poin tidak aktif hangus.
// =============================================================================

/* eslint-disable @typescript-eslint/no-explicit-any */
let t: GarageTestDb;
let svc: any;
let pts: any;
let outletId = "";
const KASIR = "user-itest-points-kasir";

function session(role: Role = "Kasir" as Role): GarageSession {
  return {
    user: { id: KASIR, name: "Kasir Poin" },
    profile: {
      id: "sp-points",
      role,
      shiftLabel: "Pagi",
      deviceLabel: "Kasir-1",
      passwordResetRequired: false,
      outlet: { id: outletId, code: "TST", name: "Outlet Test", timezone: "Asia/Jakarta" },
    },
  } as unknown as GarageSession;
}

async function member(phone: string, points: number, createdAt?: Date) {
  const d = t.getDb();
  const [cust] = await d
    .insert(t.schema.customers)
    .values({ name: `Member ${phone}`, phone, tier: "Silver", points, ...(createdAt ? { createdAt } : {}) })
    .returning();
  await d.insert(t.schema.memberAccounts).values({ customerId: cust.id, name: cust.name, phone, passwordHash: "x" });
  return cust;
}

async function customer(id: string) {
  const { eq } = await import("drizzle-orm");
  const [row] = await t.getDb().select().from(t.schema.customers).where(eq(t.schema.customers.id, id));
  return row;
}

beforeAll(async () => {
  t = await setupGarageTestDb();
  outletId = (await seedGarageBasics(t, { userId: KASIR })).outletId;
  svc = await import("@/lib/garage-service");
  pts = await import("@/lib/member-points");
}, 60_000);

afterAll(async () => {
  await teardownGarageTestDb(t);
});

describe("Pakai poin di kasir (POS)", () => {
  it("potong poin, diskon tercatat, poin baru dari menu bersih; void mengembalikan poin", async () => {
    const { eq } = await import("drizzle-orm");
    const cust = await member("081277770001", 300);
    const res = await svc.createOrder(
      {
        orderType: "takeaway",
        paymentMethod: "Cash",
        cashReceived: 500_000,
        customerId: cust.id,
        pointsToRedeem: 300,
        items: [{ itemId: "itm-food", variantId: "reg", qty: 2 }],
      },
      session(),
    );
    const [order] = await t.getDb().select().from(t.schema.orders).where(eq(t.schema.orders.orderNo, res.orderNo));
    // 300 poin × Rp100 = Rp30.000 (= 50% dari menu Rp60.000).
    expect(order.discount).toBe(30_000);
    const [redemption] = await t.getDb().select().from(t.schema.pointRedemptions).where(eq(t.schema.pointRedemptions.orderId, order.id));
    expect(redemption).toMatchObject({ pointsUsed: 300, discount: 30_000, source: "POS", status: "redeemed" });
    // Poin baru: (60.000 − 30.000) × 0,5 / 1.000 = 15 (Silver 1x), bukan dari pajak/service.
    expect((await customer(cust.id)).points).toBe(15);

    await svc.voidOrder(res.orderNo, "Tes kembali poin", session("Owner" as Role));
    expect((await customer(cust.id)).points).toBe(300);
    const [returned] = await t.getDb().select().from(t.schema.pointRedemptions).where(eq(t.schema.pointRedemptions.orderId, order.id));
    expect(returned.status).toBe("returned");
  });

  it("menolak poin melebihi batas tagihan, di bawah minimal, atau melebihi saldo", async () => {
    const cust = await member("081277770002", 1_000);
    const base = {
      orderType: "takeaway",
      paymentMethod: "Cash",
      cashReceived: 500_000,
      customerId: cust.id,
      items: [{ itemId: "itm-food", variantId: "reg", qty: 2 }],
    };
    await expect(svc.createOrder({ ...base, pointsToRedeem: 400 }, session())).rejects.toThrow(/Maksimal 300 poin/);
    await expect(svc.createOrder({ ...base, pointsToRedeem: 10 }, session())).rejects.toThrow(/Minimal/);
    const poor = await member("081277770003", 60);
    await expect(svc.createOrder({ ...base, customerId: poor.id, pointsToRedeem: 100 }, session())).rejects.toThrow(/Saldo poin/);
    await expect(
      svc.createOrder({ ...base, customerId: undefined, pointsToRedeem: 100 }, session()),
    ).rejects.toThrow(/member/);
    expect((await customer(cust.id)).points).toBe(1_000);
  });
});

describe("Pakai poin di menu digital (QR)", () => {
  it("poin dipotong saat order dibuat dan kembali saat order ditolak; split bill ditolak", async () => {
    const cust = await member("081277770004", 500);
    const created = await svc.createCustomerOrder({
      orderType: "takeaway",
      customerMode: "member",
      memberCustomerId: cust.id,
      paymentMethod: "Cash",
      source: "qr_takeaway",
      pointsToRedeem: 100,
      items: [{ itemId: "itm-coffee", variantId: "reg", qty: 2 }],
    });
    expect((await customer(cust.id)).points).toBe(400);
    expect(created.order.discount).toBeGreaterThanOrEqual(10_000);

    await expect(
      svc.splitCustomerOrder(created.order.id, { items: [] }, session("Owner" as Role)),
    ).rejects.toThrow(/poin member/);

    await svc.updateCustomerOrderStatus(created.order.id, { action: "reject", reason: "Tes" }, session());
    expect((await customer(cust.id)).points).toBe(500);
  });

  it("tamu (bukan member login) tidak bisa memakai poin", async () => {
    await expect(
      svc.createCustomerOrder({
        orderType: "takeaway",
        customerMode: "guest",
        guestName: "Tamu",
        paymentMethod: "Cash",
        source: "qr_takeaway",
        pointsToRedeem: 100,
        items: [{ itemId: "itm-coffee", variantId: "reg", qty: 1 }],
      }),
    ).rejects.toThrow(/Login member/);
  });
});

describe("Poin hangus bila tidak aktif", () => {
  it("member tidak aktif 12 bulan → poin 0 + riwayat EXPIRE; member aktif tidak tersentuh", async () => {
    const { eq } = await import("drizzle-orm");
    const old = new Date(Date.now() - 400 * 86_400_000);
    const sleeper = await member("081277770005", 120, old);
    const active = await member("081277770006", 80);
    const expired = await pts.expireInactivePoints(t.getDb(), { months: 12 });
    expect(expired.map((row: any) => row.customerId)).toContain(sleeper.id);
    expect((await customer(sleeper.id)).points).toBe(0);
    expect((await customer(active.id)).points).toBe(80);
    const history = await t.getDb().select().from(t.schema.memberTransactions).where(eq(t.schema.memberTransactions.customerId, sleeper.id));
    expect(history.some((row: any) => row.source === "EXPIRE" && row.pointsEarned === -120)).toBe(true);
    // 0 bulan = tidak pernah hangus.
    expect(await pts.expireInactivePoints(t.getDb(), { months: 0 })).toEqual([]);
  });
});
