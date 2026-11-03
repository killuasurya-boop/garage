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
// TEST INTEGRASI Production Hub V4 — tiket SELESAI (DB nyata, PGlite).
// Satu job per order saat Bar + Dapur selesai, klaim atomik, gagal pasti diulang,
// klaim kedaluwarsa tidak dicetak ulang otomatis, cetak ulang terkendali, audit.
// =============================================================================

/* eslint-disable @typescript-eslint/no-explicit-any */
let t: GarageTestDb;
let svc: any;
let prod: any;
let cp: any;
let history: any;
let outletId = "";

const KASIR = "user-itest-cp-kasir";
const OWNER = "user-itest-cp-owner";

function makeSession(userId: string, name: string, role: Role, workstation: string | null = null): GarageSession {
  return {
    user: { id: userId, name },
    profile: {
      id: `sp-${userId}`,
      role,
      shiftLabel: "Pagi",
      deviceLabel: "PROD-V4",
      passwordResetRequired: false,
      workstation,
      outlet: { id: outletId, code: "TST", name: "Outlet Test", timezone: "Asia/Jakarta" },
    },
  } as unknown as GarageSession;
}
const kasir = () => makeSession(KASIR, "Kasir V4", "Kasir");
const owner = () => makeSession(OWNER, "Owner V4", "Owner");

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

async function jobsOf(orderId: string) {
  const { and, eq, like } = await import("drizzle-orm");
  // Struk kasir ("receipt") juga ada di print_jobs — hanya job tiket SELESAI.
  return t
    .getDb()
    .select()
    .from(t.schema.printJobs)
    .where(and(eq(t.schema.printJobs.orderId, orderId), like(t.schema.printJobs.jobType, "order_completion%")));
}

async function finish(orderNo: string, station: "Bar" | "Food") {
  const ticket = await ticketOf(orderNo, station);
  await prod.productionTicketAction(ticket.ticketNo, "start", kasir());
  return prod.productionTicketAction(ticket.ticketNo, "ready", kasir(), { qcConfirmed: true });
}

async function completedOrder(table: string, name: string) {
  const res = await order(table, name, [
    { itemId: "itm-coffee", qty: 2, note: "Less ice" },
    { itemId: "itm-food", qty: 1 },
  ]);
  await finish(res.orderNo, "Bar");
  await finish(res.orderNo, "Food");
  const [job] = await jobsOf((await ticketOf(res.orderNo, "Bar")).orderId);
  return { res, job, orderId: job.orderId as string };
}

beforeAll(async () => {
  t = await setupGarageTestDb();
  const seeded = await seedGarageBasics(t, { userId: KASIR });
  outletId = seeded.outletId;
  await t.getDb().insert(t.schema.user).values([{ id: OWNER, name: "Owner V4", email: `${OWNER}@garage.id` }]);
  svc = await import("@/lib/garage-service");
  prod = await import("@/lib/garage-production");
  cp = await import("@/lib/production-completion-print");
  history = await import("@/lib/production-hub-history");
}, 60_000);

afterAll(async () => {
  await teardownGarageTestDb(t);
});

describe("Tiket SELESAI — antre sekali per order", () => {
  it("Bar selesai saja belum mencetak; Bar + Dapur selesai → tepat satu job", async () => {
    const res = await order("31", "SATU", [
      { itemId: "itm-coffee", qty: 1 },
      { itemId: "itm-food", qty: 2 },
    ]);
    const orderId = (await ticketOf(res.orderNo, "Bar")).orderId;
    await finish(res.orderNo, "Bar");
    expect(await jobsOf(orderId)).toHaveLength(0);
    await finish(res.orderNo, "Food");
    const jobs = await jobsOf(orderId);
    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({ jobType: "order_completion", status: "pending", ticketNo: res.orderNo });
    expect(jobs[0].payload.items.map((i: any) => i.station).sort()).toEqual(["Bar", "Dapur"]);
  });

  it("enqueue berulang, reopen lalu READY lagi → tetap satu job (tanpa dobel)", async () => {
    const res = await order("32", "ULANG", [
      { itemId: "itm-coffee", qty: 1 },
      { itemId: "itm-food", qty: 1 },
    ]);
    await finish(res.orderNo, "Bar");
    await finish(res.orderNo, "Food");
    const orderId = (await ticketOf(res.orderNo, "Bar")).orderId;
    const again = await cp.enqueueOrderCompletionPrint(orderId, kasir());
    expect(again.created).toBe(false);
    await Promise.all([
      cp.enqueueOrderCompletionPrint(orderId, kasir()),
      cp.enqueueOrderCompletionPrint(orderId, kasir()),
    ]);
    const food = await ticketOf(res.orderNo, "Food");
    await prod.productionTicketAction(food.ticketNo, "reopen", kasir(), { reason: "salah varian" });
    await prod.productionTicketAction(food.ticketNo, "ready", kasir(), { qcConfirmed: true });
    expect(await jobsOf(orderId)).toHaveLength(1);
  });

  it("order waiter: tiket SELESAI mencetak nama TAMU, bukan 'Meja · Tamu · Waiter'", async () => {
    const res = await order("39", "Meja 39 · Andi · Waiter Budi", [{ itemId: "itm-coffee", qty: 1 }]);
    const bar = await ticketOf(res.orderNo, "Bar");
    await finish(res.orderNo, "Bar");
    const [job] = await jobsOf(bar.orderId);
    expect(job.payload.customerName).toBe("Andi");
  });

  it("order hanya satu station langsung antre saat station itu selesai; order belum selesai tidak antre", async () => {
    const res = await order("33", "BARONLY", [{ itemId: "itm-coffee", qty: 1 }]);
    const orderId = (await ticketOf(res.orderNo, "Bar")).orderId;
    expect(await cp.enqueueOrderCompletionPrint(orderId, kasir())).toBeNull();
    await finish(res.orderNo, "Bar");
    expect(await jobsOf(orderId)).toHaveLength(1);
  });
});

describe("Tiket SELESAI — klaim, gagal, kedaluwarsa", () => {
  it("klaim atomik: perangkat kedua ditolak (CONFLICT)", async () => {
    const { job } = await completedOrder("34", "KLAIM");
    const first = await cp.claimCompletionPrint(job.id, "tablet-bar", kasir());
    expect(first.job.status).toBe("printing");
    await expect(cp.claimCompletionPrint(job.id, "tablet-dapur", kasir())).rejects.toMatchObject({ code: "CONFLICT" });
    const done = await cp.reportCompletionPrint(job.id, { token: first.token, ok: true, printer: "RPP02N" }, kasir());
    expect(done).toMatchObject({ status: "printed", attempts: 1 });
    // Token lama tidak bisa dipakai lagi.
    await expect(
      cp.reportCompletionPrint(job.id, { token: first.token, ok: false, error: "x" }, kasir()),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("gagal pasti → kembali antre; 5x gagal → failed; ulang manual → pending", async () => {
    const { job } = await completedOrder("35", "OFFLINE");
    for (let attempt = 1; attempt <= 5; attempt += 1) {
      const claim = await cp.claimCompletionPrint(job.id, "tablet-bar", kasir());
      const after = await cp.reportCompletionPrint(
        job.id,
        { token: claim.token, ok: false, error: "Printer belum terhubung" },
        kasir(),
      );
      expect(after.attempts).toBe(attempt);
      expect(after.status).toBe(attempt < 5 ? "pending" : "failed");
    }
    await expect(cp.claimCompletionPrint(job.id, "tablet-bar", kasir())).rejects.toMatchObject({ code: "CONFLICT" });
    const retried = await cp.retryCompletionPrint(job.id, kasir());
    expect(retried.status).toBe("pending");
  });

  it("klaim kedaluwarsa → failed 'tidak pasti', TIDAK otomatis diantrekan ulang", async () => {
    const { job } = await completedOrder("36", "HILANG");
    await cp.claimCompletionPrint(job.id, "tablet-mati", kasir());
    const later = new Date(Date.now() + 5 * 60_000);
    const list = await cp.listCompletionPrints(kasir(), later);
    const row = list.find((r: any) => r.id === job.id);
    expect(row.status).toBe("failed");
    expect(row.error).toBe(cp.UNCERTAIN_PRINT_ERROR);
    const audits = await t.getDb().select().from(t.schema.auditLogs);
    expect(audits.some((a: any) => a.action === "Completion ticket print uncertain" && a.object === job.ticketNo)).toBe(true);
  });

  it("job outlet lain tidak bisa diklaim", async () => {
    const { job } = await completedOrder("37", "OUTLET");
    const other = makeSession(KASIR, "Kasir Lain", "Kasir");
    (other.profile.outlet as any).id = "00000000-0000-0000-0000-000000000000";
    await expect(cp.claimCompletionPrint(job.id, "x", other)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("Tiket SELESAI — cetak ulang terkendali & riwayat", () => {
  it("alasan wajib, tidak dobel saat masih antre, batas kasir 3x, Owner bebas; semua diaudit", async () => {
    const { job, orderId, res } = await completedOrder("38", "REPRINT");
    // Masih ada job antre → cetak ulang ditolak.
    await expect(cp.reprintOrderCompletion(orderId, "kertas sobek", kasir())).rejects.toMatchObject({
      code: "CONFLICT",
    });
    const claim = await cp.claimCompletionPrint(job.id, "tablet-bar", kasir());
    await cp.reportCompletionPrint(job.id, { token: claim.token, ok: true }, kasir());
    await expect(cp.reprintOrderCompletion(orderId, "x", kasir())).rejects.toMatchObject({ code: "INVALID" });

    for (let n = 1; n <= 3; n += 1) {
      const re = await cp.reprintOrderCompletion(orderId, `kertas sobek ${n}`, kasir());
      expect(re.payload.reprint).toMatchObject({ sequence: n });
      const c = await cp.claimCompletionPrint(re.id, "tablet-bar", kasir());
      await cp.reportCompletionPrint(re.id, { token: c.token, ok: true }, kasir());
    }
    await expect(cp.reprintOrderCompletion(orderId, "lagi", kasir())).rejects.toMatchObject({ code: "LIMIT" });
    const byOwner = await cp.reprintOrderCompletion(orderId, "arsip owner", owner());
    expect(byOwner.payload.reprint.sequence).toBe(4);

    const audits = await t.getDb().select().from(t.schema.auditLogs);
    const mine = audits.filter((a: any) => a.object === res.orderNo).map((a: any) => a.action);
    expect(mine).toEqual(
      expect.arrayContaining([
        "Completion ticket queued",
        "Completion ticket print claimed",
        "Completion ticket printed",
        "Completion ticket reprint requested",
      ]),
    );

    const h = await history.getProductionHistory(kasir(), { q: res.orderNo });
    expect(h.orders).toHaveLength(1);
    expect(h.orders[0].tickets).toHaveLength(2);
    expect(h.orders[0].prints.length).toBe(5);
  });

  it("papan produksi membawa antrean tiket SELESAI outlet ini", async () => {
    const board = await prod.getProductionBoard(kasir());
    expect(Array.isArray(board.completionPrints)).toBe(true);
    expect(board.completionPrints.length).toBeGreaterThan(0);
    expect(board.completionPrints[0].payload.orderNo).toBeTruthy();
  });

  it("riwayat: cari meja & filter status", async () => {
    const byTable = await history.getProductionHistory(kasir(), { q: "38" });
    expect(byTable.orders.some((o: any) => o.customerName === "REPRINT")).toBe(true);
    const cancelled = await history.getProductionHistory(kasir(), { status: "cancelled" });
    expect(cancelled.orders.every((o: any) => o.tickets.every((tk: any) => tk.status !== "ready"))).toBe(true);
  });
});
