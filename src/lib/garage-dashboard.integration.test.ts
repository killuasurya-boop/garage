import { describe, it, expect, beforeAll, afterAll } from "vitest";

import type { GarageSession } from "@/lib/server-auth";
import type { Role } from "@/lib/garage-data";
import {
  setupGarageTestDb,
  teardownGarageTestDb,
  seedGarageBasics,
  type GarageTestDb,
} from "@/lib/test-helpers/garage-test-db";

// =============================================================================
// STEP 6-7 (Manager & Owner) — TEST INTEGRASI dashboard monitoring (DB nyata).
// Keduanya membaca getDashboardData (Owner = superset). Membuktikan transaksi
// & tiket dari role operasional muncul sebagai omzet, order aktif, sales trend,
// dan menu terlaris — pusat monitoring tanpa masuk role lain satu per satu.
// =============================================================================

/* eslint-disable @typescript-eslint/no-explicit-any */
let t: GarageTestDb;
let createOrder: any;
let getDashboardData: any;
let getBestSellerMenuItemIds: any;
let outletId = "";
const KASIR = "user-itest-kasir";

function kasirSession(): GarageSession {
  return {
    user: { id: KASIR, name: "Kasir Test" },
    profile: {
      id: "sp-kasir",
      role: "Kasir" as Role,
      shiftLabel: "Pagi",
      deviceLabel: "Kasir-1",
      passwordResetRequired: false,
      outlet: { id: outletId, code: "TST", name: "Outlet Test", timezone: "Asia/Jakarta" },
    },
  } as unknown as GarageSession;
}

let revenueExpected = 0;

beforeAll(async () => {
  t = await setupGarageTestDb();
  const seeded = await seedGarageBasics(t, { userId: KASIR });
  outletId = seeded.outletId;

  const svc = await import("@/lib/garage-service");
  createOrder = svc.createOrder;
  getDashboardData = svc.getDashboardData;
  getBestSellerMenuItemIds = svc.getBestSellerMenuItemIds;

  // 2 order kopi + 1 order nasi (kopi jadi terlaris). Semua paid hari ini.
  for (let i = 0; i < 2; i += 1) {
    const r = await createOrder(
      {
        orderType: "takeaway",
        paymentMethod: "Cash",
        cashReceived: 100_000,
        items: [{ itemId: "itm-coffee", variantId: "reg", qty: 1 }],
      },
      kasirSession(),
    );
    revenueExpected += r.total;
  }
  const r3 = await createOrder(
    {
      orderType: "takeaway",
      paymentMethod: "QRIS",
      paymentReference: "QR-1",
      items: [{ itemId: "itm-food", variantId: "reg", qty: 1 }],
    },
    kasirSession(),
  );
  revenueExpected += r3.total;
}, 60_000);

afterAll(async () => {
  await teardownGarageTestDb(t);
});

describe("Manager/Owner — dashboard monitoring (DB nyata)", () => {
  it("metrik revenue mencerminkan order paid hari ini", async () => {
    const dash = await getDashboardData();
    const revenue = dash.headlineMetrics.find((m: any) => m.id === "revenue");
    expect(revenue).toBeTruthy();
    expect(revenue.delta).toBe("3 order paid");
    expect(revenue.tone).toBe("good");
  });

  it("sales trend menjumlah SELURUH omzet hari ini (F-02: tak ada jam tersembunyi)", async () => {
    const dash = await getDashboardData();
    // Baseline 08–19 (12 bar) tetap minimal; jendela melebar bila ada penjualan
    // di luar jam itu — jadi total chart SELALU = omzet, kapan pun transaksinya.
    expect(dash.salesTrend.length).toBeGreaterThanOrEqual(12);
    const trendSum = dash.salesTrend.reduce((s: number, p: any) => s + Number(p.sales), 0);
    expect(trendSum).toBe(revenueExpected);

    // Jam transaksi (Jakarta) wajib termasuk dalam jendela chart.
    const jakartaHour = Number(
      new Intl.DateTimeFormat("en-US", {
        timeZone: "Asia/Jakarta",
        hour: "2-digit",
        hour12: false,
      }).format(new Date()),
    );
    const hours = dash.salesTrend.map((p: any) => Number(p.hour));
    expect(Math.min(...hours)).toBeLessThanOrEqual(jakartaHour);
    expect(Math.max(...hours)).toBeGreaterThanOrEqual(jakartaHour);
  });

  it("metrik order aktif menghitung tiket queue/cooking", async () => {
    const dash = await getDashboardData();
    const active = dash.headlineMetrics.find((m: any) => m.id === "orders");
    // 3 order → 3 tiket (semua masih queue) ⇒ minimal 3.
    expect(Number(active.value)).toBeGreaterThanOrEqual(3);
  });

  it("menu terlaris memuat item yang paling banyak terjual (kopi)", async () => {
    const top = await getBestSellerMenuItemIds(6);
    expect(top).toContain("itm-coffee");
    // kopi (2 terjual) di atas nasi (1 terjual).
    if (top.includes("itm-food")) {
      expect(top.indexOf("itm-coffee")).toBeLessThan(top.indexOf("itm-food"));
    }
  });
});
