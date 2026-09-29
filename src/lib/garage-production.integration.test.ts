import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { GarageSession } from "@/lib/server-auth";
import type { Role } from "@/lib/garage-data";
import {
  seedGarageBasics,
  setupGarageTestDb,
  teardownGarageTestDb,
  type GarageTestDb,
} from "@/lib/test-helpers/garage-test-db";

// =============================================================================
// TEST INTEGRASI Production Hub (DB nyata). Skenario development gate dokumen:
// batch produk sama lintas meja, allocation 100%, READY milik workstation,
// multi-order satu meja, reopen dengan alasan, pickup hanya setelah READY.
// =============================================================================

/* eslint-disable @typescript-eslint/no-explicit-any */
let t: GarageTestDb;
let svc: any;
let prod: any;
let outletId = "";

const KASIR = "user-itest-prod-kasir";
const DAPUR = "user-itest-prod-dapur";
const BAR = "user-itest-prod-bar";
const WAITER = "user-itest-prod-waiter";
const HELPER = "user-itest-prod-helper";

function makeSession(
  userId: string,
  name: string,
  role: Role,
  workstation: string | null = null,
): GarageSession {
  return {
    user: { id: userId, name },
    profile: {
      id: `sp-${userId}`,
      role,
      shiftLabel: "Pagi",
      deviceLabel: "PROD-1",
      passwordResetRequired: false,
      workstation,
      outlet: { id: outletId, code: "TST", name: "Outlet Test", timezone: "Asia/Jakarta" },
    },
  } as unknown as GarageSession;
}

const kasir = () => makeSession(KASIR, "Kasir Test", "Kasir", null);
const dapur = () => makeSession(DAPUR, "Koki Test", "Kasir", "dapur");
const bar = () => makeSession(BAR, "Barista Test", "Kasir", "bar");
const waiter = () => makeSession(WAITER, "Waiter Test", "Waiter");
const helperBar = () => makeSession(HELPER, "Helper Bar", "Kasir", "helper_bar");

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
  const seeded = await seedGarageBasics(t, { userId: KASIR });
  outletId = seeded.outletId;
  await t
    .getDb()
    .insert(t.schema.user)
    .values([
      { id: DAPUR, name: "Koki Test", email: `${DAPUR}@garage.id` },
      { id: BAR, name: "Barista Test", email: `${BAR}@garage.id` },
      { id: WAITER, name: "Waiter Test", email: `${WAITER}@garage.id` },
      { id: HELPER, name: "Helper Bar", email: `${HELPER}@garage.id` },
    ]);
  // Profil staf: target panggilan helper harus waiter aktif.
  await t
    .getDb()
    .insert(t.schema.staffProfiles)
    .values([
      { userId: WAITER, outletId, role: "Waiter" },
      { userId: BAR, outletId, role: "Kasir", workstation: "bar" },
    ]);
  svc = await import("@/lib/garage-service");
  prod = await import("@/lib/garage-production");
}, 60_000);

afterAll(async () => {
  await teardownGarageTestDb(t);
});

describe("Production Hub — routing & identitas", () => {
  it("order kasir → tiket Bar & Dapur dengan porsi + snapshot Nama/Meja/Order", async () => {
    const res = await order("3", "BUDI", [
      { itemId: "itm-coffee", qty: 1, note: "Less sugar" },
      { itemId: "itm-food", qty: 2 },
    ]);
    const barTicket = await ticketOf(res.orderNo, "Bar");
    const foodTicket = await ticketOf(res.orderNo, "Food");
    expect(barTicket.customerName).toBe("BUDI");
    expect(foodTicket.orderNo).toBe(res.orderNo);

    const board = await prod.getProductionBoard(dapur());
    const view = board.tickets.find((row: any) => row.ticketNo === foodTicket.ticketNo);
    expect(view.identity).toBe("BUDI");
    expect(view.items).toHaveLength(1);
    expect(view.items[0]).toMatchObject({ qty: 2, status: "waiting" });
    const barView = board.tickets.find((row: any) => row.ticketNo === barTicket.ticketNo);
    expect(barView.items[0].note).toBe("Less sugar");
  });

  it("satu meja banyak customer: identitas tetap terpisah per order", async () => {
    const a = await order("10", "RIZI", [{ itemId: "itm-coffee", qty: 1 }]);
    const b = await order("10", "SINTA", [{ itemId: "itm-coffee", qty: 1 }]);
    const board = await prod.getProductionBoard(bar());
    const names = board.tickets
      .filter((row: any) => [a.orderNo, b.orderNo].includes(row.orderNo))
      .map((row: any) => row.identity)
      .sort();
    expect(names).toEqual(["RIZI", "SINTA"]);
  });
});

describe("Production Hub — hak workstation & QC", () => {
  it("Waiter & Kasir tanpa workstation tidak boleh MULAI/READY; Bar tidak boleh tiket Dapur", async () => {
    const res = await order("4", "ANDI", [{ itemId: "itm-food", qty: 1 }]);
    const food = await ticketOf(res.orderNo, "Food");
    await expect(svc.updateKitchenStatus(food.ticketNo, "cooking", waiter())).rejects.toBeInstanceOf(
      svc.ProductionPermissionError,
    );
    await expect(svc.updateKitchenStatus(food.ticketNo, "cooking", kasir())).rejects.toBeInstanceOf(
      svc.ProductionPermissionError,
    );
    await expect(svc.updateKitchenStatus(food.ticketNo, "cooking", bar())).rejects.toBeInstanceOf(
      svc.ProductionPermissionError,
    );
    const started = await svc.updateKitchenStatus(food.ticketNo, "cooking", dapur());
    expect(started.status).toBe("cooking");
  });

  it("READY wajib konfirmasi QC", async () => {
    const res = await order("5", "DINA", [{ itemId: "itm-food", qty: 1 }]);
    const food = await ticketOf(res.orderNo, "Food");
    await prod.productionTicketAction(food.ticketNo, "start", dapur());
    await expect(prod.productionTicketAction(food.ticketNo, "ready", dapur())).rejects.toBeInstanceOf(
      svc.ProductionQcRequiredError,
    );
    const ready = await prod.productionTicketAction(food.ticketNo, "ready", dapur(), { qcConfirmed: true });
    expect(ready.status).toBe("ready");
  });

  it("pickup waiter hanya setelah READY + ACC helper; kembalikan butuh alasan & belum diambil", async () => {
    const res = await order("6", "EKO", [{ itemId: "itm-coffee", qty: 1 }]);
    const coffee = await ticketOf(res.orderNo, "Bar");
    await expect(svc.claimKitchenTicket(coffee.ticketNo, waiter())).rejects.toBeInstanceOf(
      svc.KitchenTransitionError,
    );
    await prod.productionTicketAction(coffee.ticketNo, "start", bar());
    await prod.productionTicketAction(coffee.ticketNo, "ready", bar(), { qcConfirmed: true });
    // READY tapi belum di-ACC helper → waiter belum boleh ambil/antar.
    await expect(svc.claimKitchenTicket(coffee.ticketNo, waiter())).rejects.toBeInstanceOf(
      svc.HandoverRequiredError,
    );
    await expect(svc.deliverClaimedTicket(coffee.ticketNo, waiter())).rejects.toBeInstanceOf(
      svc.HandoverRequiredError,
    );

    await expect(prod.productionTicketAction(coffee.ticketNo, "reopen", bar(), { reason: "" })).rejects.toBeInstanceOf(
      svc.ProductionReopenError,
    );
    const reopened = await prod.productionTicketAction(coffee.ticketNo, "reopen", bar(), {
      reason: "Es kurang",
    });
    expect(reopened).toMatchObject({ status: "cooking", issueReason: "Es kurang", readyAt: null });

    await prod.productionTicketAction(coffee.ticketNo, "ready", bar(), { qcConfirmed: true });
    await prod.productionHandover(coffee.ticketNo, null, bar());
    const claimed = await svc.claimKitchenTicket(coffee.ticketNo, waiter());
    expect(claimed.claimedBy).toBe(WAITER);
    await expect(
      prod.productionTicketAction(coffee.ticketNo, "reopen", bar(), { reason: "Salah varian" }),
    ).rejects.toBeInstanceOf(svc.ProductionReopenError);
  });
});

describe("Production Hub — helper serah-terima & panggil waiter", () => {
  it("helper BAR ACC & panggil waiter tertentu; helper tidak boleh produksi / station lain", async () => {
    const res = await order("7", "FANI", [
      { itemId: "itm-coffee", qty: 1 },
      { itemId: "itm-food", qty: 1 },
    ]);
    const coffee = await ticketOf(res.orderNo, "Bar");
    const food = await ticketOf(res.orderNo, "Food");

    // Helper tidak memproduksi.
    await expect(svc.updateKitchenStatus(coffee.ticketNo, "cooking", helperBar())).rejects.toBeInstanceOf(
      svc.ProductionPermissionError,
    );
    await prod.productionTicketAction(coffee.ticketNo, "start", bar());
    // Belum READY → belum bisa diserahkan.
    await expect(prod.productionHandover(coffee.ticketNo, WAITER, helperBar())).rejects.toBeInstanceOf(
      svc.KitchenTransitionError,
    );
    await prod.productionTicketAction(coffee.ticketNo, "ready", bar(), { qcConfirmed: true });

    // Waiter & helper station lain tidak boleh ACC.
    await expect(prod.productionHandover(coffee.ticketNo, WAITER, waiter())).rejects.toBeInstanceOf(
      svc.HandoverPermissionError,
    );
    await prod.productionTicketAction(food.ticketNo, "start", dapur());
    await prod.productionTicketAction(food.ticketNo, "ready", dapur(), { qcConfirmed: true });
    await expect(prod.productionHandover(food.ticketNo, WAITER, helperBar())).rejects.toBeInstanceOf(
      svc.HandoverPermissionError,
    );

    const called = await prod.productionHandover(coffee.ticketNo, WAITER, helperBar());
    expect(called).toMatchObject({ claimedBy: WAITER, handoverByName: "Helper Bar" });
    expect(called.handoverAt).toBeTruthy();

    // Waiter yang dipanggil langsung antar → delivered, fee antar ke dia.
    const delivered = await svc.deliverClaimedTicket(coffee.ticketNo, waiter());
    expect(delivered).toMatchObject({ status: "delivered", deliveredByName: "Waiter Test" });
  });

  it("helper tidak bisa memanggil akun yang bukan waiter aktif", async () => {
    const res = await order("8", "GITA", [{ itemId: "itm-coffee", qty: 1 }]);
    const coffee = await ticketOf(res.orderNo, "Bar");
    await prod.productionTicketAction(coffee.ticketNo, "start", bar());
    await prod.productionTicketAction(coffee.ticketNo, "ready", bar(), { qcConfirmed: true });
    await expect(prod.productionHandover(coffee.ticketNo, BAR, helperBar())).rejects.toBeInstanceOf(
      svc.HandoverPermissionError,
    );
  });
});

describe("Production Hub — Smart Batch + Allocation", () => {
  it("Nasi ×4 dari 3 meja: batch, UNALLOCATED menahan complete, lalu READY per order", async () => {
    const rizi = await order("11", "RIZI", [{ itemId: "itm-food", qty: 1 }]);
    const japanis = await order("12", "JAPANIS", [{ itemId: "itm-food", qty: 1 }]);
    const andi = await order("15", "ANDI", [{ itemId: "itm-food", qty: 2 }]);
    const orderNos = [rizi.orderNo, japanis.orderNo, andi.orderNo];

    const board = await prod.getProductionBoard(dapur());
    const suggestion = board.suggestions.find((row: any) =>
      row.items.some((item: any) => item.orderNo === rizi.orderNo),
    );
    expect(suggestion).toBeTruthy();
    const ids = suggestion.items
      .filter((item: any) => orderNos.includes(item.orderNo))
      .map((item: any) => item.id);
    expect(ids).toHaveLength(3);

    // Bar tidak boleh mengambil batch Dapur.
    await expect(prod.startProductionBatch(ids, bar())).rejects.toBeInstanceOf(
      svc.ProductionPermissionError,
    );

    const batch = await prod.startProductionBatch(ids, dapur());
    expect(batch.totalQty).toBe(4);

    // Tiket sudah PROCESSING, tapi READY diblok selama porsinya di batch aktif.
    const riziTicket = await ticketOf(rizi.orderNo, "Food");
    expect(riziTicket.status).toBe("cooking");
    await expect(
      prod.productionTicketAction(riziTicket.ticketNo, "ready", dapur(), { qcConfirmed: true }),
    ).rejects.toThrow(/batch/i);

    const afterStart = await prod.getProductionBoard(dapur());
    const running = afterStart.batches.find((row: any) => row.id === batch.id);
    expect(running.allocations.map((row: any) => row.identity).sort()).toEqual([
      "ANDI",
      "JAPANIS",
      "RIZI",
    ]);

    // Allocation kurang: ANDI (2 porsi) belum dicocokkan.
    const partialIds = running.allocations
      .filter((row: any) => row.identity !== "ANDI")
      .map((row: any) => row.id);
    await expect(prod.completeProductionBatch(batch.id, partialIds, dapur())).rejects.toMatchObject({
      code: "UNALLOCATED",
      unallocatedQty: 2,
    });

    const done = await prod.completeProductionBatch(
      batch.id,
      running.allocations.map((row: any) => row.id),
      dapur(),
    );
    expect(done.batch.status).toBe("completed");
    expect(done.readyTicketNos).toHaveLength(3);
    for (const orderNo of orderNos) {
      const ticket = await ticketOf(orderNo, "Food");
      expect(ticket.status).toBe("ready");
      expect(ticket.readyByName).toBe("Koki Test");
    }
  });

  it("void order di tengah batch: tiket batal, batch menyusut, order lain tetap bisa selesai", async () => {
    const a = await order("30", "NINA", [{ itemId: "itm-food", qty: 1 }]);
    const b = await order("31", "OKTA", [{ itemId: "itm-food", qty: 2 }]);
    const board = await prod.getProductionBoard(dapur());
    const suggestion = board.suggestions.find((row: any) =>
      row.items.some((item: any) => item.orderNo === a.orderNo),
    );
    const ids = suggestion.items
      .filter((item: any) => [a.orderNo, b.orderNo].includes(item.orderNo))
      .map((item: any) => item.id);
    const batch = await prod.startProductionBatch(ids, dapur());
    expect(batch.totalQty).toBe(3);

    const voided = await svc.voidOrder(a.orderNo, "Pelanggan batal pesan", kasir());
    expect(voided.cancelledTickets).toHaveLength(1);

    const cancelledTicket = await ticketOf(a.orderNo, "Food");
    expect(cancelledTicket.status).toBe("cancelled");
    const after = await prod.getProductionBoard(dapur());
    expect(after.tickets.some((row: any) => row.orderNo === a.orderNo)).toBe(false);
    expect(after.cancelled.some((row: any) => row.orderNo === a.orderNo)).toBe(true);
    const running = after.batches.find((row: any) => row.id === batch.id);
    expect(running.totalQty).toBe(2);
    expect(running.allocations.map((row: any) => row.identity)).toEqual(["OKTA"]);

    const done = await prod.completeProductionBatch(
      batch.id,
      running.allocations.map((row: any) => row.id),
      dapur(),
    );
    expect(done.readyTicketNos).toHaveLength(1);
    expect((await ticketOf(b.orderNo, "Food")).status).toBe("ready");
  });

  it("void satu-satunya order di batch → batch ikut batal", async () => {
    const a = await order("32", "PUTRI", [{ itemId: "itm-food", qty: 1 }]);
    const b = await order("33", "QORI", [{ itemId: "itm-food", qty: 1 }]);
    const board = await prod.getProductionBoard(dapur());
    const suggestion = board.suggestions.find((row: any) =>
      row.items.some((item: any) => item.orderNo === a.orderNo),
    );
    const ids = suggestion.items
      .filter((item: any) => [a.orderNo, b.orderNo].includes(item.orderNo))
      .map((item: any) => item.id);
    const batch = await prod.startProductionBatch(ids, dapur());
    await svc.voidOrder(a.orderNo, "Salah input", kasir());
    await svc.voidOrder(b.orderNo, "Salah input", kasir());
    const after = await prod.getProductionBoard(dapur());
    expect(after.batches.some((row: any) => row.id === batch.id)).toBe(false);
  });

  it("batal batch mengembalikan porsi ke WAITING", async () => {
    const a = await order("20", "LALA", [{ itemId: "itm-food", qty: 1 }]);
    const b = await order("21", "MIMI", [{ itemId: "itm-food", qty: 1 }]);
    const board = await prod.getProductionBoard(dapur());
    const suggestion = board.suggestions.find((row: any) =>
      row.items.some((item: any) => item.orderNo === a.orderNo),
    );
    const ids = suggestion.items
      .filter((item: any) => [a.orderNo, b.orderNo].includes(item.orderNo))
      .map((item: any) => item.id);
    const batch = await prod.startProductionBatch(ids, dapur());
    await expect(prod.cancelProductionBatch(batch.id, "", dapur())).rejects.toMatchObject({
      code: "BATCH_INVALID",
    });
    const cancelled = await prod.cancelProductionBatch(batch.id, "Salah pilih", dapur());
    expect(cancelled.status).toBe("cancelled");

    const after = await prod.getProductionBoard(dapur());
    const ticket = after.tickets.find((row: any) => row.orderNo === a.orderNo);
    expect(ticket.items[0]).toMatchObject({ status: "waiting", batchId: null });
    // Setelah batal, tiket tidak lagi diblok batch → bisa READY individual.
    const ready = await prod.productionTicketAction(ticket.ticketNo, "ready", dapur(), {
      qcConfirmed: true,
    });
    expect(ready.status).toBe("ready");
  });
});

describe("Meja — order mati tidak menyangkutkan meja (QA-audit)", () => {
  it.each(["rejected", "voided", "cancelled"])("sesi meja menunjuk order %s → meja kosong", async (dead) => {
    const { eq } = await import("drizzle-orm");
    const res = await order("41", `MATI-${dead}`, [{ itemId: "itm-coffee", qty: 1 }]);
    const db = t.getDb();
    const [row] = await db.select().from(t.schema.orders).where(eq(t.schema.orders.orderNo, res.orderNo)).limit(1);
    await db.update(t.schema.orders).set({ status: dead }).where(eq(t.schema.orders.id, row.id));
    await db
      .insert(t.schema.tableSessions)
      .values({ outletId, tableNumber: "41", tableLabel: "Meja 41", status: dead, currentOrderId: row.id })
      .onConflictDoUpdate({
        target: [t.schema.tableSessions.outletId, t.schema.tableSessions.tableNumber],
        set: { status: dead, currentOrderId: row.id, needsCleaning: false },
      });
    const live = await svc.getTableLiveData();
    const meja = live.find((r: any) => r.tableNumber === "41");
    expect(meja.status).toBe("empty");
    expect(meja.currentOrderId).toBeNull();
  });
});

describe("Production Hub — cetak chit stasiun", () => {
  it("tiket baru belum tercetak; ditandai sekali; tampil di papan; tanda tak tertimpa", async () => {
    const res = await order("21", "CETAK", [
      { itemId: "itm-coffee", qty: 1 },
      { itemId: "itm-food", qty: 1 },
    ]);
    const barTicket = await ticketOf(res.orderNo, "Bar");
    const foodTicket = await ticketOf(res.orderNo, "Food");
    expect(barTicket.chitPrintedAt).toBeNull();

    // Papan bawa penanda null untuk kedua tiket.
    let board = await prod.getProductionBoard(bar());
    for (const no of [barTicket.ticketNo, foodTicket.ticketNo]) {
      const view = board.tickets.find((row: any) => row.ticketNo === no);
      expect(view.chitPrintedAt).toBeNull();
    }

    // Perangkat Bar mencetak tiket Bar saja.
    expect(await prod.markProductionChitsPrinted([barTicket.ticketNo])).toBe(1);
    board = await prod.getProductionBoard(bar());
    expect(board.tickets.find((row: any) => row.ticketNo === barTicket.ticketNo).chitPrintedAt).toEqual(
      expect.any(String),
    );
    expect(board.tickets.find((row: any) => row.ticketNo === foodTicket.ticketNo).chitPrintedAt).toBeNull();

    // Kirim ulang tanda (dua perangkat menekan bersamaan) tidak mengubah apa pun.
    const first = board.tickets.find((row: any) => row.ticketNo === barTicket.ticketNo).chitPrintedAt;
    expect(await prod.markProductionChitsPrinted([barTicket.ticketNo, "TIDAK-ADA"])).toBe(0);
    board = await prod.getProductionBoard(bar());
    expect(board.tickets.find((row: any) => row.ticketNo === barTicket.ticketNo).chitPrintedAt).toBe(first);

    // Masukan kosong / tak valid aman.
    expect(await prod.markProductionChitsPrinted([])).toBe(0);
    expect(await prod.markProductionChitsPrinted(["", "  "])).toBe(0);
  });
});
