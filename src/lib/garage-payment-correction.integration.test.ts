import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { cashCount } from "@/lib/test-helpers/cash-count";

import type { GarageSession } from "@/lib/server-auth";
import type { Role } from "@/lib/garage-data";
import {
  seedGarageBasics,
  setupGarageTestDb,
  teardownGarageTestDb,
  type GarageTestDb,
} from "@/lib/test-helpers/garage-test-db";

// =============================================================================
// QRIS & laci: koreksi metode bayar (Cash↔QRIS) selama shift terbuka menyesuaikan
// kas seharusnya; QRIS dicocokkan terpisah dari selisih laci saat/sesudah tutup.
// =============================================================================

/* eslint-disable @typescript-eslint/no-explicit-any */
let t: GarageTestDb;
let svc: typeof import("@/lib/garage-service");
let outletId = "";
const KASIR = "user-pay-kasir";
const MANAJER = "user-pay-manajer";
const PIN = "602418";

function sessionFor(userId: string, name: string, role: Role): GarageSession {
  return {
    user: { id: userId, name, email: `${userId}@garage.id` },
    profile: {
      id: `sp-${userId}`,
      role,
      shiftLabel: "Pagi",
      deviceLabel: "Kasir-1",
      passwordResetRequired: false,
      outlet: { id: outletId, code: "TST", name: "Outlet Test", timezone: "Asia/Jakarta" },
    },
  } as unknown as GarageSession;
}
const kasir = () => sessionFor(KASIR, "Kasir Satu", "Kasir");
const manajer = () => sessionFor(MANAJER, "Mira", "Manajer");

async function sessionRow(id: string) {
  const { eq } = await import("drizzle-orm");
  const [row] = await t.getDb().select().from(t.schema.cashSessions).where(eq(t.schema.cashSessions.id, id));
  return row;
}

async function payOrder(method: string) {
  return svc.createOrder(
    {
      orderType: "takeaway",
      paymentMethod: method,
      // Tender guard: tunai wajib uang diterima.
      cashReceived: method === "Cash" ? 50_000 : undefined,
      items: [{ itemId: "itm-coffee", variantId: "reg", qty: 1 }],
    } as any,
    kasir(),
  ) as Promise<any>;
}

beforeAll(async () => {
  t = await setupGarageTestDb();
  const seeded = await seedGarageBasics(t, { userId: KASIR });
  outletId = seeded.outletId;
  svc = await import("@/lib/garage-service");
  const { hashPin } = await import("@/lib/attendance");
  const d = t.getDb();
  await d.delete(t.schema.cashSessions);
  await d.insert(t.schema.user).values([{ id: MANAJER, name: "Mira", email: `${MANAJER}@garage.id` }]);
  await d.insert(t.schema.staffProfiles).values([
    { userId: KASIR, outletId, role: "Kasir", status: "active" },
    { userId: MANAJER, outletId, role: "Manajer", status: "active", pinHash: hashPin(PIN) },
  ]);
}, 60_000);

afterAll(async () => {
  await teardownGarageTestDb(t);
});

describe("Koreksi metode bayar & pencocokan QRIS", () => {
  let shiftId = "";
  let cashOrder: any;
  let qrisOrder: any;

  it("Cash tercatat padahal QRIS: koreksi mengurangi kas seharusnya (kasir wajib PIN)", async () => {
    const shift: any = await svc.createCashSession({ openingCash: 100_000 }, kasir());
    shiftId = shift.id;
    cashOrder = await payOrder("Cash");
    qrisOrder = await payOrder("QRIS");
    expect((await sessionRow(shiftId)).expectedCash).toBe(100_000 + cashOrder.total);

    await expect(
      svc.correctPaymentMethod(cashOrder.orderId, { method: "QRIS", reason: "salah tekan" }, kasir()),
    ).rejects.toThrow(/PIN Manajer\/Owner/);
    await expect(
      svc.correctPaymentMethod(cashOrder.orderId, { method: "QRIS", reason: "salah tekan", managerPin: "000000" }, kasir()),
    ).rejects.toThrow(/PIN salah/);

    const result: any = await svc.correctPaymentMethod(
      cashOrder.orderId,
      { method: "QRIS", reason: "pelanggan bayar QRIS", managerPin: PIN },
      kasir(),
    );
    expect(result).toMatchObject({ from: "Cash", to: "QRIS", cashDelta: -cashOrder.total });
    expect(result.expectedCash).toBeUndefined(); // tutup shift tetap "blind"
    expect((await sessionRow(shiftId)).expectedCash).toBe(100_000);

    const { eq } = await import("drizzle-orm");
    const [log] = await t
      .getDb()
      .select()
      .from(t.schema.auditLogs)
      .where(eq(t.schema.auditLogs.action, "Koreksi metode bayar"));
    expect((log?.metadata as any)?.approvedBy).toBe("Mira");
  });

  it("QRIS → Cash menambah kas seharusnya; metode sama ditolak", async () => {
    await expect(
      svc.correctPaymentMethod(qrisOrder.orderId, { method: "QRIS", reason: "tes" }, manajer()),
    ).rejects.toThrow(/Metode sudah/);
    await svc.correctPaymentMethod(qrisOrder.orderId, { method: "Cash", reason: "bayar tunai" }, manajer());
    expect((await sessionRow(shiftId)).expectedCash).toBe(100_000 + qrisOrder.total);
    // Kembalikan agar QRIS shift = 2 order.
    await svc.correctPaymentMethod(qrisOrder.orderId, { method: "QRIS", reason: "kembalikan" }, manajer());
  });

  it("tutup shift: selisih laci hanya tunai, QRIS dicocokkan terpisah; Owner bisa cocokkan ulang", async () => {
    const qrisTotal = cashOrder.total + qrisOrder.total;
    const closed: any = await svc.closeCashSession(
      shiftId,
      { actualCash: 100_000, denominations: cashCount(100_000), qrisCounted: qrisTotal - 5_000 },
      kasir(),
    );
    expect(closed).toMatchObject({
      discrepancy: 0,
      qrisRecorded: qrisTotal,
      qrisCounted: qrisTotal - 5_000,
      qrisDiscrepancy: -5_000,
    });

    // Setelah ditutup, koreksi metode ditolak.
    await expect(
      svc.correctPaymentMethod(cashOrder.orderId, { method: "Cash", reason: "telat" }, manajer()),
    ).rejects.toThrow(/sudah ditutup/);

    const fixed: any = await svc.reconcileCashSessionQris(shiftId, { qrisCounted: qrisTotal }, manajer());
    expect(fixed).toMatchObject({ qrisDiscrepancy: 0, qrisCheckedBy: MANAJER });

    const { jakartaDateKey } = await import("@/lib/attendance");
    const report: any = await svc.getDailyCashSessionReport({
      date: jakartaDateKey(),
      outletId,
      requesterUserId: MANAJER,
    });
    const row = report.rows.find((r: any) => r.id === shiftId);
    expect(row).toMatchObject({ qrisTotal, qrisCounted: qrisTotal, qrisDiscrepancy: 0 });
  });
});
