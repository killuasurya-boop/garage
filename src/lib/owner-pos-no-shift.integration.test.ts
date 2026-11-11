import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { GarageSession } from "@/lib/server-auth";
import { seedGarageBasics, setupGarageTestDb, teardownGarageTestDb, type GarageTestDb } from "@/lib/test-helpers/garage-test-db";

// Owner (Nov 2026): POS tanpa shift untuk semua fitur NON-tunai. Tunai tetap wajib shift (uang masuk laci).
// Kasir/Manajer tetap wajib shift seperti sebelumnya.

let t: GarageTestDb;
let outletId = "";
let svc: typeof import("@/lib/garage-service");
const kasirId = "user-itest-ops-kasir";
const ownerId = "user-itest-ops-owner";
const managerId = "user-itest-ops-mgr";

const sessionFor = (id: string, role: "Owner" | "Manajer" | "Kasir"): GarageSession =>
  ({
    user: { id, name: `${role} Test` },
    profile: { id: `sp-${id}`, role, shiftLabel: "Pagi", deviceLabel: "T-1", passwordResetRequired: false, outlet: { id: outletId, code: "TST", name: "Outlet Test", timezone: "Asia/Jakarta" } },
  }) as unknown as GarageSession;
const owner = () => sessionFor(ownerId, "Owner");
const manager = () => sessionFor(managerId, "Manajer");

const sale = (extra: Record<string, unknown>, who: GarageSession) =>
  svc.createOrder(
    { orderType: "takeaway", items: [{ itemId: "itm-coffee", variantId: "reg", qty: 1 }], ...extra } as never,
    who,
  );

async function q(sql: string) {
  const res = await t.getDb().execute(sql as never);
  return ((res as { rows?: unknown[] }).rows ?? res) as Array<Record<string, unknown>>;
}

beforeAll(async () => {
  t = await setupGarageTestDb();
  ({ outletId } = await seedGarageBasics(t, { userId: kasirId }));
  await t.getDb().insert(t.schema.user).values([
    { id: ownerId, name: "Owner Test", email: `${ownerId}@garage.id` },
    { id: managerId, name: "Manajer Test", email: `${managerId}@garage.id` },
  ]);
  svc = await import("@/lib/garage-service");
}, 120_000);

afterAll(async () => {
  await teardownGarageTestDb(t);
});

describe("Owner POS tanpa shift", () => {
  it("QRIS / Transfer tanpa shift: tersimpan tanpa sesi kas, laci tidak berubah", async () => {
    const before = await q(`select coalesce(sum(amount),0)::int as total from cash_ledger_entries`);
    const res = (await sale({ paymentMethod: "QRIS", paymentReference: "QR-OWNER-0001" }, owner())) as { orderNo?: string; order?: { orderNo?: string } };
    const orderNo = res.orderNo ?? res.order?.orderNo;
    expect(orderNo).toBeTruthy();
    const [payment] = await q(`select p.cash_session_id, p.method from payments p join orders o on o.id = p.order_id where o.order_no = '${orderNo}'`);
    expect(payment).toMatchObject({ cash_session_id: null, method: "QRIS" });
    await expect(sale({ paymentMethod: "Transfer", paymentReference: "TRF-OWNER-01" }, owner())).resolves.toBeTruthy();
    const after = await q(`select coalesce(sum(amount),0)::int as total from cash_ledger_entries`);
    expect(after[0].total).toBe(before[0].total);
  });

  it("TUNAI tanpa shift ditolak (juga bila tunai hanya sebagian split)", async () => {
    await expect(sale({ paymentMethod: "Cash", cashReceived: 100_000 }, owner())).rejects.toThrow(/TUNAI wajib dari shift/);
    await expect(
      sale({ paymentMethod: "Cash", splits: [{ method: "Cash", amount: 10_000 }, { method: "QRIS", amount: 10_000, reference: "QR-SPLIT-1" }] }, owner()),
    ).rejects.toThrow(/TUNAI wajib dari shift/);
  });

  it("Bayar nanti (terima pesanan) tanpa shift boleh; pelunasan QRIS boleh; pelunasan tunai ditolak", async () => {
    const created = (await svc.createCustomerOrder({
      orderType: "takeaway",
      outletId,
      customerMode: "guest",
      guestName: "Budi",
      source: "qr_takeaway",
      staffOrder: true,
      paymentMethod: "Cash",
      items: [{ itemId: "itm-coffee", variantId: "reg", qty: 1 }],
    } as never)) as { order: { id: string } };
    await svc.updateCustomerOrderStatus(created.order.id, { action: "accept" }, owner(), { openBill: true });
    await expect(svc.updateCustomerOrderStatus(created.order.id, { action: "paid", paymentMethod: "Cash", cashReceived: 500_000 } as never, owner())).rejects.toThrow(/shift/i);
    await svc.updateCustomerOrderStatus(created.order.id, { action: "paid", paymentMethod: "QRIS", paymentReference: "QR-FINAL-01" } as never, owner());
    const [order] = await q(`select status from orders where id = '${created.order.id}'`);
    expect(order.status).toBe("paid");
  });

  it("Manajer tanpa shift tetap ditolak (hanya Owner)", async () => {
    await expect(sale({ paymentMethod: "QRIS", paymentReference: "QR-MGR-0001" }, manager())).rejects.toThrow(/Open shift wajib/);
  });
});
