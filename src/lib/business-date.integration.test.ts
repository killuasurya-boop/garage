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

// ─── B1b: laba-rugi, ekspresi SQL, dan validasi pengaturan ───────────────────

describe("tanggal operasional — laba-rugi harian (finance-control)", () => {
  it("default kalender vs aktif: net sales berpindah ke hari operasional, total tetap", async () => {
    const { loadDayRaws } = await import("@/lib/finance-control");
    const { normalizeBusinessDayPolicy, CALENDAR_POLICY } = await import("@/lib/business-date");
    const calendar = await loadDayRaws("2026-11-05", "2026-11-06", CALENDAR_POLICY);
    expect(calendar.get("2026-11-05")?.netSales).toBe(50_000);
    expect(calendar.get("2026-11-06")?.netSales).toBe(50_000);
    const policy = normalizeBusinessDayPolicy({ cutoffHour: 4, effectiveFrom: "2026-11-01" });
    const active = await loadDayRaws("2026-11-05", "2026-11-06", policy);
    expect(active.get("2026-11-05")?.netSales).toBe(80_000);
    expect(active.get("2026-11-06")?.netSales).toBe(20_000);
  });

  it("tanpa argumen policy: memuat pengaturan global", async () => {
    const { loadDayRaws } = await import("@/lib/finance-control");
    await setPolicy("2026-11-01");
    expect((await loadDayRaws("2026-11-05", "2026-11-05")).get("2026-11-05")?.netSales).toBe(80_000);
    await setPolicy(null);
    expect((await loadDayRaws("2026-11-05", "2026-11-05")).get("2026-11-05")?.netSales).toBe(50_000);
  });

  it("businessDaySql = businessDateKey untuk tiap jam di sekitar hari transisi", async () => {
    const { like } = await import("drizzle-orm");
    const { businessDateKey, normalizeBusinessDayPolicy } = await import("@/lib/business-date");
    const { businessDaySql } = await import("@/lib/business-date-sql");
    const { orders } = t.schema;
    const base = wib("2026-10-30T00:30:00").getTime();
    for (let h = 0; h < 96; h++) {
      await t.getDb().insert(orders).values({
        orderNo: `BDP-${String(h).padStart(3, "0")}`,
        outletId,
        channel: "Dine-in",
        status: "voided",
        subtotal: 0,
        service: 0,
        tax: 0,
        total: 0,
        createdAt: new Date(base + h * 3_600_000),
      } as any);
    }
    const policy = normalizeBusinessDayPolicy({ cutoffHour: 4, effectiveFrom: "2026-11-01" });
    const rows = await t
      .getDb()
      .select({ at: orders.createdAt, day: businessDaySql(orders.createdAt, policy) })
      .from(orders)
      .where(like(orders.orderNo, "BDP-%"));
    expect(rows).toHaveLength(96);
    for (const row of rows) expect(row.day, String(row.at)).toBe(businessDateKey(new Date(row.at), policy));
  });
});

describe("tanggal operasional — validasi pengaturan (updateAppSettings)", () => {
  const session = (role: string) =>
    ({
      user: { id: "user-bizdate", name: "Uji" },
      profile: {
        id: "sp-user-bizdate",
        role,
        shiftLabel: "Pagi",
        deviceLabel: "T-1",
        passwordResetRequired: false,
        workstation: null,
        outlet: { id: outletId, code: "TST", name: "Outlet Test", timezone: "Asia/Jakarta" },
      },
    }) as any;

  it("tanggal lalu ditolak, Manajer ditolak, outlet ditolak; Owner + hari ini/besok diterima", async () => {
    await setPolicy(null);
    const svc = await import("@/lib/garage-service");
    const { todayWibKey } = await import("@/lib/date-range");
    const today = todayWibKey();
    const yesterday = new Date(Date.parse(`${today}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10);
    const tomorrow = new Date(Date.parse(`${today}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
    await expect(svc.updateAppSettings(null, { businessDayEffectiveDate: yesterday }, session("Owner"))).rejects.toMatchObject({
      code: "BUSINESS_DAY_INVALID",
    });
    await expect(svc.updateAppSettings(null, { businessDayEffectiveDate: tomorrow }, session("Manajer"))).rejects.toMatchObject({
      code: "BUSINESS_DAY_OWNER_ONLY",
    });
    await expect(svc.updateAppSettings(outletId, { businessDayEffectiveDate: tomorrow }, session("Owner"))).rejects.toMatchObject({
      code: "BUSINESS_DAY_GLOBAL_ONLY",
    });
    const saved = await svc.updateAppSettings(null, { businessDayEffectiveDate: tomorrow }, session("Owner"));
    expect(saved.businessDayEffectiveDate).toBe(tomorrow);
    // Belum berlaku → masih boleh diubah; nilai sama dikirim Manajer (form) lolos.
    await svc.updateAppSettings(null, { businessDayEffectiveDate: tomorrow, businessDayCutoffHour: 4 }, session("Manajer"));
    await svc.updateAppSettings(null, { businessDayEffectiveDate: today }, session("Owner"));
    // Sudah berlaku → terkunci.
    await expect(svc.updateAppSettings(null, { businessDayCutoffHour: 5 }, session("Owner"))).rejects.toMatchObject({
      code: "BUSINESS_DAY_LOCKED",
    });
    await expect(svc.updateAppSettings(null, { businessDayEffectiveDate: "" }, session("Owner"))).rejects.toMatchObject({
      code: "BUSINESS_DAY_LOCKED",
    });
    await setPolicy(null);
  });
});
