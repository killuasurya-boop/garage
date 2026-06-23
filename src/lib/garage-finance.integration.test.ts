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
// STEP 5 (Admin Finance) — TEST INTEGRASI: transaksi kasir OTOMATIS masuk ke
// laporan keuangan. Membuktikan getFinanceSummary mengagregasi payment
// (status "captured") jadi omzet + rincian metode bayar, dan kas terpantau.
// =============================================================================

/* eslint-disable @typescript-eslint/no-explicit-any */
let t: GarageTestDb;
let createOrder: any;
let getFinanceSummary: any;
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

let totalCash = 0;
let totalQris = 0;

beforeAll(async () => {
  t = await setupGarageTestDb();
  const seeded = await seedGarageBasics(t, { userId: KASIR });
  outletId = seeded.outletId;

  const svc = await import("@/lib/garage-service");
  createOrder = svc.createOrder;
  getFinanceSummary = svc.getFinanceSummary;

  // Kasir buat 2 transaksi: 1 Cash (kopi) + 1 QRIS (nasi).
  const cash = await createOrder(
    {
      orderType: "takeaway",
      paymentMethod: "Cash",
      cashReceived: 100_000,
      items: [{ itemId: "itm-coffee", variantId: "reg", qty: 1 }],
    },
    kasirSession(),
  );
  totalCash = cash.total;

  const qris = await createOrder(
    {
      orderType: "takeaway",
      paymentMethod: "QRIS",
      paymentReference: "QR-TEST-001",
      items: [{ itemId: "itm-food", variantId: "reg", qty: 1 }],
    },
    kasirSession(),
  );
  totalQris = qris.total;
}, 60_000);

afterAll(async () => {
  await teardownGarageTestDb(t);
});

describe("Finance — transaksi kasir teragregasi (DB nyata)", () => {
  it("rincian metode bayar memuat Cash & QRIS dengan nominal benar", async () => {
    const summary = await getFinanceSummary({ outletId, openedBy: KASIR });
    const byMethod: Record<string, number> = {};
    for (const row of summary.paymentBreakdown) byMethod[row.method] = row.amount;

    expect(byMethod.Cash).toBe(totalCash);
    expect(byMethod.QRIS).toBe(totalQris);
  });

  it("omzet total = jumlah seluruh pembayaran captured", async () => {
    const summary = await getFinanceSummary({ outletId, openedBy: KASIR });
    const total = summary.paymentBreakdown.reduce((s: number, r: any) => s + r.amount, 0);
    expect(total).toBe(totalCash + totalQris);

    // share metode menjumlah ~100% (toleransi pembulatan).
    const shareSum = summary.paymentBreakdown.reduce((s: number, r: any) => s + r.share, 0);
    expect(Math.abs(shareSum - 100)).toBeLessThanOrEqual(1);
  });

  it("kas terpantau: shift terbuka, cash order menambah expectedCash", async () => {
    const summary = await getFinanceSummary({ outletId, openedBy: KASIR });
    expect(summary.cashSession.status).toBe("open");
    // opening 100.000 + total transaksi Cash (QRIS tidak menambah kas).
    expect(summary.cashSession.expectedCash).toBe(100_000 + totalCash);
  });
});
