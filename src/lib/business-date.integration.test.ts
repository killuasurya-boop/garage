import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { seedGarageBasics, setupGarageTestDb, teardownGarageTestDb, type GarageTestDb } from "@/lib/test-helpers/garage-test-db";

// =============================================================================
// Tanggal operasional (B1, keputusan Owner: cut-off 04:00 WIB mulai tanggal
// efektif). Default = kalender (perilaku lama); setelah diaktifkan, buku kas &
// laporan penjualan memasukkan transaksi 00:00–03:59 ke hari sebelumnya.
// =============================================================================

/* eslint-disable @typescript-eslint/no-explicit-any */
let t: GarageTestDb;
let outletId = "";
let sessionId = "";
const wib = (iso: string) => new Date(`${iso}+07:00`);

async function setPolicy(effective: string | null) {
  const { appSettings } = t.schema;
  const d = t.getDb();
  for (const key of ["businessDayCutoffHour", "businessDayEffectiveDate"]) await d.delete(appSettings).where(eq(appSettings.key, key));
  if (!effective) return;
  await d.insert(appSettings).values([
    { key: "businessDayCutoffHour", valueJson: 4, outletId: null },
    { key: "businessDayEffectiveDate", valueJson: effective, outletId: null },
  ] as any);
}

async function paidOrder(orderNo: string, at: Date, total: number) {
  await t.getDb().insert(t.schema.orders).values({
    orderNo,
    outletId,
    channel: "Dine-in",
    status: "paid",
    subtotal: total,
    service: 0,
    tax: 0,
    total,
    createdAt: at,
  } as any);
}

beforeAll(async () => {
  t = await setupGarageTestDb();
  ({ outletId } = await seedGarageBasics(t, { userId: "user-bizdate" }));
  const [session] = await t.getDb().select().from(t.schema.cashSessions).where(eq(t.schema.cashSessions.code, "CS-ITEST"));
  sessionId = session.id;
}, 60_000);

afterAll(async () => {
  await teardownGarageTestDb(t);
});

describe("tanggal operasional — buku kas", () => {
  it("default (belum diaktifkan): posting 01:30 = tanggal kalender", async () => {
    await setPolicy(null);
    const { postDrawerCash } = await import("@/lib/cash-ledger");
    const posting = await postDrawerCash(t.getDb(), { sessionId, delta: 10_000, sourceType: "drawer_in" as any, occurredAt: wib("2026-11-06T01:30:00") });
    const [row] = await t.getDb().select().from(t.schema.cashLedgerEntries).where(eq(t.schema.cashLedgerEntries.id, posting!.entryId));
    expect(row.businessDate).toBe("2026-11-06");
  });

  it("aktif mulai 2026-11-01: posting 01:30 tgl 6 = hari operasional tgl 5 (juga di dalam transaksi)", async () => {
    await setPolicy("2026-11-01");
    const { postDrawerCash } = await import("@/lib/cash-ledger");
    const entryId = await t.getDb().transaction(async (tx: any) => {
      const posting = await postDrawerCash(tx, { sessionId, delta: 5_000, sourceType: "drawer_in" as any, occurredAt: wib("2026-11-06T01:30:00") });
      return posting!.entryId;
    });
    const [row] = await t.getDb().select().from(t.schema.cashLedgerEntries).where(eq(t.schema.cashLedgerEntries.id, entryId));
    expect(row.businessDate).toBe("2026-11-05");
  });
});

describe("tanggal operasional — laporan penjualan", () => {
  beforeAll(async () => {
    await paidOrder("BD-EVE", wib("2026-11-05T21:00:00"), 50_000);
    await paidOrder("BD-NIGHT", wib("2026-11-06T01:30:00"), 30_000);
    await paidOrder("BD-MORNING", wib("2026-11-06T09:00:00"), 20_000);
  });

  async function report(date: string) {
    const { getSalesReport } = await import("@/lib/sales-report");
    return getSalesReport({ outletId, range: { from: date, to: date } as any });
  }
  const orderNos = (rep: any) => rep.transactions.map((row: any) => row.orderNo).sort();

  it("default: penjualan 01:30 masuk tanggal kalender (perilaku lama)", async () => {
    await setPolicy(null);
    expect(orderNos(await report("2026-11-05"))).toEqual(["BD-EVE"]);
    expect(orderNos(await report("2026-11-06"))).toEqual(["BD-MORNING", "BD-NIGHT"]);
  });

  it("aktif: shift malam utuh di hari tgl 5, tidak terhitung dua kali di tgl 6", async () => {
    await setPolicy("2026-11-01");
    const day5 = await report("2026-11-05");
    const day6 = await report("2026-11-06");
    expect(orderNos(day5)).toEqual(["BD-EVE", "BD-NIGHT"]);
    expect(orderNos(day6)).toEqual(["BD-MORNING"]);
    expect(day5.summary.netSales + day6.summary.netSales).toBe(100_000);
    // Pengelompokan per hari ikut tanggal operasional.
    expect((day5.transactions as any[]).find((row: any) => row.orderNo === "BD-NIGHT")?.date).toBe("2026-11-05");
  });
});
