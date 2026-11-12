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
// TEST INTEGRASI Production V7: tiket aktif tidak pernah hilang karena waktu,
// urutan FIFO dari server, dan override prioritas (Owner/Manajer, alasan, audit).
// Seed: Kopi Test (Bar), Nasi Test (Dapur).
// =============================================================================

/* eslint-disable @typescript-eslint/no-explicit-any */
let t: GarageTestDb;
let svc: any;
let prod: any;
let outletId = "";
const OWNER = "user-itest-v7-owner";

function session(role: Role, id = OWNER, workstation: string | null = null): GarageSession {
  return {
    user: { id, name: `${role} V7` },
    profile: {
      id: `sp-${id}`,
      role,
      shiftLabel: "Pagi",
      deviceLabel: "PROD-V7",
      passwordResetRequired: false,
      workstation,
      outlet: { id: outletId, code: "TST", name: "Outlet Test", timezone: "Asia/Jakarta" },
    },
  } as unknown as GarageSession;
}
const owner = () => session("Owner" as Role);

async function order(table: string, items = [{ itemId: "itm-coffee", variantId: "reg", qty: 1 }]) {
  return svc.createOrder({ orderType: "dine-in", tableNumber: table, guestName: "V7", paymentMethod: "Cash", cashReceived: 500_000, items }, owner());
}
async function ticketsOf(orderNo: string) {
  const { eq } = await import("drizzle-orm");
  return t.getDb().select().from(t.schema.kitchenTickets).where(eq(t.schema.kitchenTickets.orderNo, orderNo));
}
async function board() {
  return prod.getProductionBoard(owner());
}

beforeAll(async () => {
  t = await setupGarageTestDb();
  outletId = (await seedGarageBasics(t, { userId: OWNER })).outletId;
  svc = await import("@/lib/garage-service");
  prod = await import("@/lib/garage-production");
}, 60_000);

afterAll(async () => {
  await teardownGarageTestDb(t);
});

describe("Production V7 — tiket aktif tidak hilang", () => {
  it("tiket SIAP yang sudah lebih dari 8 jam tetap ada di papan (dulu disembunyikan)", async () => {
    const { eq } = await import("drizzle-orm");
    const res = await order("3");
    const [ticket] = await ticketsOf(res.orderNo);
    const old = new Date(Date.now() - 30 * 3_600_000);
    await t.getDb().update(t.schema.kitchenTickets).set({ status: "ready", readyAt: old, updatedAt: old, createdAt: old }).where(eq(t.schema.kitchenTickets.id, ticket.id));
    const view = (await board()).tickets.find((row: any) => row.ticketNo === ticket.ticketNo);
    expect(view).toMatchObject({ status: "ready" });
  });

  it("tiket menunggu berhari-hari tetap ada dan berada paling depan (FIFO server)", async () => {
    const { eq } = await import("drizzle-orm");
    const a = await order("4");
    const b = await order("5");
    const [ta] = await ticketsOf(a.orderNo);
    const [tb] = await ticketsOf(b.orderNo);
    await t.getDb().update(t.schema.kitchenTickets).set({ createdAt: new Date(Date.now() - 3 * 86_400_000) }).where(eq(t.schema.kitchenTickets.id, tb.id));
    const waiting = (await board()).tickets.filter((row: any) => row.status === "queue").map((row: any) => row.ticketNo);
    expect(waiting).toContain(ta.ticketNo);
    expect(waiting[0]).toBe(tb.ticketNo);
    const b2 = await board();
    expect(b2.truncated ?? null).toBeNull();
  });

  it("papan dimuat ulang berkali-kali: daftar tiket sama (tidak ada yang lenyap antar-muat)", async () => {
    const first = (await board()).tickets.map((row: any) => row.ticketNo);
    const second = (await board()).tickets.map((row: any) => row.ticketNo);
    expect(second).toEqual(first);
  });
});

describe("Production V7 — dahulukan dari FIFO", () => {
  it("hanya Owner/Manajer, alasan wajib, tercatat di audit; status produksi tidak berubah", async () => {
    const { eq, desc } = await import("drizzle-orm");
    const res = await order("6");
    const [ticket] = await ticketsOf(res.orderNo);
    await expect(prod.setFifoOverride(ticket.ticketNo, { prioritize: true, reason: "tamu menunggu lama" }, session("Kasir" as Role, "user-v7-kasir"))).rejects.toThrow(/Owner\/Manajer/);
    await expect(prod.setFifoOverride(ticket.ticketNo, { prioritize: true, reason: " " }, owner())).rejects.toThrow(/Alasan/);
    const before = (await board()).tickets.find((row: any) => row.ticketNo === ticket.ticketNo);
    expect(before.fifoOverride ?? null).toBeNull();

    const out = await prod.setFifoOverride(ticket.ticketNo, { prioritize: true, reason: "tamu menunggu lama" }, owner());
    expect(out).toMatchObject({ ticketNo: ticket.ticketNo, prioritized: true });
    const b = await board();
    expect(b.canOverrideFifo).toBe(true);
    const after = b.tickets.find((row: any) => row.ticketNo === ticket.ticketNo);
    expect(after).toMatchObject({ status: "queue", createdAt: before.createdAt });
    expect(after.fifoOverride).toMatchObject({ reason: "tamu menunggu lama" });

    const [audit] = await t.getDb().select().from(t.schema.auditLogs).where(eq(t.schema.auditLogs.action, "Production FIFO override")).orderBy(desc(t.schema.auditLogs.createdAt)).limit(1);
    expect(audit.metadata).toMatchObject({ ticketNo: ticket.ticketNo, reason: "tamu menunggu lama", before: null });

    await prod.setFifoOverride(ticket.ticketNo, { prioritize: false, reason: "sudah tidak perlu" }, owner());
    const back = (await board()).tickets.find((row: any) => row.ticketNo === ticket.ticketNo);
    expect(back.fifoOverride ?? null).toBeNull();
    const [removed] = await t.getDb().select().from(t.schema.auditLogs).where(eq(t.schema.auditLogs.action, "Production FIFO override removed")).limit(1);
    expect((removed.metadata as any).before).toMatchObject({ reason: "tamu menunggu lama" });
  });

  it("tiket yang sudah SIAP tidak bisa diubah urutannya; tiket tak dikenal = null", async () => {
    const { eq } = await import("drizzle-orm");
    const res = await order("7");
    const [ticket] = await ticketsOf(res.orderNo);
    await t.getDb().update(t.schema.kitchenTickets).set({ status: "ready", readyAt: new Date() }).where(eq(t.schema.kitchenTickets.id, ticket.id));
    await expect(prod.setFifoOverride(ticket.ticketNo, { prioritize: true, reason: "uji siap" }, owner())).rejects.toThrow(/menunggu\/diproses/);
    expect(await prod.setFifoOverride("TIDAK-ADA", { prioritize: true, reason: "uji tidak ada" }, owner())).toBeNull();
  });
});
