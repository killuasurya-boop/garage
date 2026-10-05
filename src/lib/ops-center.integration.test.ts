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
// TEST INTEGRASI Garage Control Center (DB nyata): order POS → tiket → live
// KPI, Smart Batch + efisiensi batch, READY → serving, remake, tanpa uang.
// =============================================================================

/* eslint-disable @typescript-eslint/no-explicit-any */
let t: GarageTestDb;
let svc: any;
let prod: any;
let ops: any;
let outletId = "";

const KASIR = "user-itest-ops-kasir";
const DAPUR = "user-itest-ops-dapur";
const BAR = "user-itest-ops-bar";
const WAITER = "user-itest-ops-waiter";

function makeSession(userId: string, name: string, role: Role, workstation: string | null = null): GarageSession {
  return {
    user: { id: userId, name },
    profile: {
      id: `sp-${userId}`,
      role,
      shiftLabel: "Pagi",
      deviceLabel: "OPS-1",
      passwordResetRequired: false,
      workstation,
      outlet: { id: outletId, code: "TST", name: "Outlet Test", timezone: "Asia/Jakarta" },
    },
  } as unknown as GarageSession;
}

const kasir = () => makeSession(KASIR, "Kasir Ops", "Kasir", null);
const dapur = () => makeSession(DAPUR, "Koki Ops", "Kasir", "dapur");
const bar = () => makeSession(BAR, "Barista Ops", "Kasir", "bar");
const waiter = () => makeSession(WAITER, "Waiter Ops", "Waiter");

async function order(table: string, name: string, items: Array<{ itemId: string; qty: number; note?: string }>) {
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

async function ticketOf(orderNo: string, station: "Bar" | "Food") {
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
  await t
    .getDb()
    .insert(t.schema.user)
    .values([
      { id: DAPUR, name: "Koki Ops", email: `${DAPUR}@garage.id` },
      { id: BAR, name: "Barista Ops", email: `${BAR}@garage.id` },
      { id: WAITER, name: "Waiter Ops", email: `${WAITER}@garage.id` },
    ]);
  await t
    .getDb()
    .insert(t.schema.staffProfiles)
    .values([
      { userId: WAITER, outletId, role: "Waiter" },
      { userId: BAR, outletId, role: "Kasir", workstation: "bar" },
      { userId: DAPUR, outletId, role: "Kasir", workstation: "dapur" },
    ]);
  svc = await import("@/lib/garage-service");
  prod = await import("@/lib/garage-production");
  ops = await import("@/lib/ops-center");
}, 60_000);

afterAll(async () => {
  await teardownGarageTestDb(t);
});

describe("Garage Control Center", () => {
  it("kosong: status NORMAL, angka nol/null — tidak mengarang", async () => {
    const data = await ops.getOpsCenter(waiter());
    expect(data.status.label).toBe("NORMAL");
    expect(data.live).toMatchObject({ activeOrders: 0, waiting: 0, readyToServe: 0, avgPrepMinutes: null, onTimePct: null });
    expect(data.forecast).toEqual({ status: "insufficient", weeksWithData: 0 });
    expect(data.insights).toEqual([]);
  });

  it("order POS masuk: antrean FIFO, station routing, NOW = Smart Batch, tanpa nominal uang", async () => {
    const a = await order("21", "ANDI", [{ itemId: "itm-food", qty: 2 }, { itemId: "itm-coffee", qty: 1 }]);
    const b = await order("22", "BUDI", [{ itemId: "itm-food", qty: 1 }]);

    const data = await ops.getOpsCenter(waiter());
    expect(data.live.activeOrders).toBe(2);
    expect(data.queue).toHaveLength(3); // 2 tiket order A (Bar + Dapur) + 1 tiket order B
    expect(data.queue.at(-1).orderNo).toBe(b.orderNo);
    expect(data.queue[0].orderNo).toBe(a.orderNo); // FIFO
    const food = data.stations.find((s: any) => s.station === "Food");
    const barStation = data.stations.find((s: any) => s.station === "Bar");
    expect(food.waiting).toBe(2);
    expect(barStation.waiting).toBe(1);
    expect(food.nextBestAction.kind).toBe("batch");
    expect(food.nextBestAction.suggestion.totalQty).toBe(3);
    expect(food.suggestions[0].score.orders).toBe(2);
    expect(data.canOperate).toEqual({ Bar: false, Food: false }); // waiter tidak produksi

    const json = JSON.stringify(data);
    expect(json).not.toMatch(/"(total|subtotal|amount|revenue|omzet|price|unitPrice|lineTotal)"/i);
  });

  it("batch selesai → efisiensi batch & KPI hari ini dari timestamp nyata; READY masuk serving", async () => {
    const board = await prod.getProductionBoard(dapur());
    const suggestion = board.suggestions.find((s: any) => s.station === "Food");
    const batch = await prod.startProductionBatch(suggestion.items.map((i: any) => i.id), dapur());
    const running = (await prod.getProductionBoard(dapur())).batches.find((x: any) => x.id === batch.id);
    await prod.completeProductionBatch(batch.id, running.allocations.map((r: any) => r.id), dapur());

    const data = await ops.getOpsCenter(dapur());
    expect(data.canOperate.Food).toBe(true);
    expect(data.live.batchEfficiencyPct).toBe(100);
    expect(data.team.today.ready).toBe(2);
    expect(data.team.today.onTimePct).toBe(100);
    expect(data.live.readyToServe).toBe(2);
    expect(data.serving.ready.every((r: any) => r.station === "Food" && !r.delayed)).toBe(true);
    // My KPI berdasar nama di tiket (readyByName).
    expect(data.me).toMatchObject({ name: "Koki Ops", handled: 2 });
    expect((await ops.getOpsCenter(waiter())).me.handled).toBe(0);
  });

  it("remake (tiket dikembalikan) tercatat; tiket Bar tanpa batch tetap FIFO", async () => {
    const c = await order("23", "CICI", [{ itemId: "itm-coffee", qty: 1 }]);
    const ticket = await ticketOf(c.orderNo, "Bar");
    await prod.productionTicketAction(ticket.ticketNo, "start", bar());
    await prod.productionTicketAction(ticket.ticketNo, "ready", bar(), { qcConfirmed: true });
    await prod.productionTicketAction(ticket.ticketNo, "reopen", bar(), { reason: "Salah kustomisasi" });

    const data = await ops.getOpsCenter(kasir());
    expect(data.team.remakeToday).toBeGreaterThanOrEqual(1);
    const barStation = data.stations.find((s: any) => s.station === "Bar");
    expect(["ticket", "batch"]).toContain(barStation.nextBestAction.kind);
    expect(data.team.ordersToday).toBe(3);
  });
});

describe("Target SLA dari Pengaturan", () => {
  it("tanpa setting: Bar 5 / Dapur 15; setelah diubah: tiket BARU memakai target baru, tiket lama tetap", async () => {
    const before = await order("31", "LAMA", [{ itemId: "itm-coffee", qty: 1 }, { itemId: "itm-food", qty: 1 }]);
    expect((await ticketOf(before.orderNo, "Bar")).targetMinutes).toBe(5);
    expect((await ticketOf(before.orderNo, "Food")).targetMinutes).toBe(15);

    await svc.updateAppSettings(outletId, { productionTargetBarMinutes: 7, productionTargetFoodMinutes: 20 }, kasir());
    const after = await order("32", "BARU", [{ itemId: "itm-coffee", qty: 1 }, { itemId: "itm-food", qty: 1 }]);
    expect((await ticketOf(after.orderNo, "Bar")).targetMinutes).toBe(7);
    expect((await ticketOf(after.orderNo, "Food")).targetMinutes).toBe(20);
    expect((await ticketOf(before.orderNo, "Bar")).targetMinutes).toBe(5);

    await svc.updateAppSettings(outletId, { productionTargetBarMinutes: 5, productionTargetFoodMinutes: 15 }, kasir());
  });
});
