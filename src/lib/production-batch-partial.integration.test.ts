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
// TEST INTEGRASI V4 Batch Produksi: Partial Batch Completion (porsi terpilih
// READY, batch tetap jalan), batal batch tidak membatalkan porsi yang sudah
// jadi, tiket SELESAI keluar saat order lengkap, dan riwayat batch.
// =============================================================================

/* eslint-disable @typescript-eslint/no-explicit-any */
let t: GarageTestDb;
let svc: any;
let prod: any;
let outletId = "";
const KASIR = "user-itest-batch-kasir";

function kasir(): GarageSession {
  return {
    user: { id: KASIR, name: "Kasir Batch" },
    profile: {
      id: `sp-${KASIR}`,
      role: "Kasir" as Role,
      shiftLabel: "Pagi",
      deviceLabel: "BATCH-V4",
      passwordResetRequired: false,
      workstation: null,
      outlet: { id: outletId, code: "TST", name: "Outlet Test", timezone: "Asia/Jakarta" },
    },
  } as unknown as GarageSession;
}

async function order(table: string, name: string, items: Array<{ itemId: string; qty: number }>) {
  return svc.createOrder(
    {
      orderType: "dine-in",
      tableNumber: table,
      guestName: name,
      paymentMethod: "Cash",
      cashReceived: 500_000,
      items: items.map((line) => ({ ...line, variantId: "reg" })),
    },
    kasir(),
  );
}

async function ticket(orderNo: string, station: "Bar" | "Food") {
  const { and, eq } = await import("drizzle-orm");
  const [row] = await t
    .getDb()
    .select()
    .from(t.schema.kitchenTickets)
    .where(and(eq(t.schema.kitchenTickets.orderNo, orderNo), eq(t.schema.kitchenTickets.station, station)))
    .limit(1);
  return row;
}

beforeAll(async () => {
  t = await setupGarageTestDb();
  outletId = (await seedGarageBasics(t, { userId: KASIR })).outletId;
  svc = await import("@/lib/garage-service");
  prod = await import("@/lib/garage-production");
}, 60_000);

afterAll(async () => {
  await teardownGarageTestDb(t);
});

describe("Partial Batch Completion", () => {
  it("selesaikan sebagian → porsi terpilih READY, batch tetap jalan; batal batch menjaga porsi yang sudah jadi", async () => {
    const a = await order("41", "ANA", [
      { itemId: "itm-coffee", qty: 1 },
      { itemId: "itm-food", qty: 1 },
    ]);
    const b = await order("42", "BUDI", [{ itemId: "itm-coffee", qty: 1 }]);
    const board = await prod.getProductionBoard(kasir());
    const suggestion = board.suggestions.find(
      (s: any) => s.station === "Bar" && s.items.some((i: any) => i.orderNo === a.orderNo) && s.items.some((i: any) => i.orderNo === b.orderNo),
    );
    expect(suggestion?.menuItemId).toBe("itm-coffee");
    const batch = await prod.startProductionBatch(
      suggestion.items.map((i: any) => i.id),
      kasir(),
    );

    const view = (await prod.getProductionBoard(kasir())).batches.find((x: any) => x.id === batch.id);
    expect(view.menuItemId).toBe("itm-coffee");
    const allocB = view.allocations.find((x: any) => x.orderNo === b.orderNo);

    // Tanpa pilihan → ditolak; tidak ada yang berubah.
    await expect(prod.completeProductionBatch(batch.id, [], kasir(), { partial: true })).rejects.toMatchObject({
      code: "BATCH_INVALID",
    });

    const res = await prod.completeProductionBatch(batch.id, [allocB.id], kasir(), { partial: true });
    expect(res.partial).toBe(true);
    expect(res.batch.status).toBe("processing");
    expect((await ticket(b.orderNo, "Bar")).status).toBe("ready");
    expect((await ticket(a.orderNo, "Bar")).status).toBe("cooking");

    // Order B lengkap → tiket SELESAI antre; order A belum.
    const { eq } = await import("drizzle-orm");
    const jobs = await t.getDb().select().from(t.schema.printJobs).where(eq(t.schema.printJobs.jobType, "order_completion"));
    expect(jobs.some((j: any) => j.ticketNo === b.orderNo)).toBe(true);
    expect(jobs.some((j: any) => j.ticketNo === a.orderNo)).toBe(false);

    // Porsi yang sama tidak bisa diselesaikan dua kali.
    await expect(prod.completeProductionBatch(batch.id, [allocB.id], kasir(), { partial: true })).rejects.toMatchObject({
      code: "BATCH_INVALID",
    });

    // Batal batch: porsi A kembali Waiting, porsi B tetap READY.
    await prod.cancelProductionBatch(batch.id, "mesin espresso mati", kasir());
    expect((await ticket(b.orderNo, "Bar")).status).toBe("ready");
    const itemsA = await t
      .getDb()
      .select()
      .from(t.schema.productionTicketItems)
      .where(eq(t.schema.productionTicketItems.ticketId, (await ticket(a.orderNo, "Bar")).id));
    expect(itemsA.every((i: any) => i.status === "waiting" && i.batchId === null)).toBe(true);

    const history = await prod.getProductionBatchHistory(kasir());
    const row = history.batches.find((x: any) => x.id === batch.id);
    expect(row).toMatchObject({ status: "cancelled", doneQty: 1, totalQty: 2 });
    expect(row.allocations).toHaveLength(1);
    expect(row.allocations[0]).toMatchObject({ orderNo: b.orderNo, ticketStatus: "ready" });

    const audits = await t.getDb().select().from(t.schema.auditLogs);
    expect(audits.some((x: any) => x.action === "Production batch partially completed" && x.object === batch.batchNo)).toBe(true);
  });

  it("selesaikan sebagian sampai habis → batch completed", async () => {
    const a = await order("43", "CICI", [{ itemId: "itm-coffee", qty: 1 }]);
    const b = await order("44", "DODI", [{ itemId: "itm-coffee", qty: 1 }]);
    const board = await prod.getProductionBoard(kasir());
    const suggestion = board.suggestions.find(
      (s: any) => s.items.some((i: any) => i.orderNo === a.orderNo) && s.items.some((i: any) => i.orderNo === b.orderNo),
    );
    const batch = await prod.startProductionBatch(
      suggestion.items.filter((i: any) => [a.orderNo, b.orderNo].includes(i.orderNo)).map((i: any) => i.id),
      kasir(),
    );
    const view = (await prod.getProductionBoard(kasir())).batches.find((x: any) => x.id === batch.id);
    const [first, second] = view.allocations;
    await prod.completeProductionBatch(batch.id, [first.id], kasir(), { partial: true });
    const last = await prod.completeProductionBatch(batch.id, [second.id], kasir(), { partial: true });
    expect(last.partial).toBe(false);
    expect(last.batch.status).toBe("completed");
    expect((await ticket(a.orderNo, "Bar")).status).toBe("ready");
    expect((await ticket(b.orderNo, "Bar")).status).toBe("ready");
  });
});
