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
// Garage Financial Control Fase 5 — product profitability, forecast, What-If,
// CEO brief, dan export 9 laporan × PDF/Excel/CSV di DB PGlite sementara.
// =============================================================================

/* eslint-disable @typescript-eslint/no-explicit-any */
let t: GarageTestDb;
let intel: any;
let reports: any;
let outletId = "";
const OWNER = "user-itest-owner-intel";

function ownerSession(): GarageSession {
  return {
    user: { id: OWNER, name: "Owner Test" },
    profile: {
      id: "sp-owner",
      role: "Owner" as Role,
      shiftLabel: "Pagi",
      deviceLabel: "Owner-1",
      passwordResetRequired: false,
      outlet: { id: outletId, code: "TST", name: "Outlet Test", timezone: "Asia/Jakarta" },
    },
  } as unknown as GarageSession;
}

beforeAll(async () => {
  t = await setupGarageTestDb();
  const seeded = await seedGarageBasics(t, { userId: OWNER });
  outletId = seeded.outletId;
  const svc = await import("@/lib/garage-service");
  intel = await import("@/lib/finance-intelligence");
  reports = await import("@/lib/finance-reports");
  await svc.createOrder(
    {
      orderType: "takeaway",
      paymentMethod: "Cash",
      cashReceived: 500_000,
      items: [
        { itemId: "itm-coffee", variantId: "reg", qty: 3 },
        { itemId: "itm-food", variantId: "reg", qty: 1 },
      ],
    },
    ownerSession(),
  );
  // 120 dtk: migrasi PGlite penuh bisa >60 dtk saat 68 suite jalan paralel (QA-audit).
}, 120_000);

afterAll(async () => {
  await teardownGarageTestDb(t);
});

describe("Intelligence", () => {
  it("product profitability memuat produk terjual dengan qty benar", async () => {
    const { jakartaDateKey } = await import("@/lib/finance-control-core");
    const today = jakartaDateKey();
    const result = await intel.getProductProfitability(today, today);
    const coffee = result.rows.find((row: any) => row.key.startsWith("itm-coffee"));
    expect(coffee.qty).toBe(3);
    expect(result.totals.qty).toBe(4);
  });

  it("forecast berlabel PROYEKSI dengan jumlah bulan sesuai horizon", async () => {
    const forecast = await intel.getFinanceForecast({ horizon: 3 });
    expect(forecast.label).toBe("PROYEKSI");
    expect(forecast.months).toHaveLength(3);
    expect(forecast.reliable).toBe(false);
  });

  it("What-If disimpan tanpa mengubah angka aktual", async () => {
    const before = await intel.getScenarioBase("this_month");
    const saved = await intel.saveScenario(
      { name: "Revenue naik 20%", period: "this_month", params: { revenuePct: 20, hppPct: 0, payrollPct: 0, advertisingPct: 0, expensePct: 0 } },
      ownerSession(),
    );
    expect(saved.result.projected.revenue).toBe(Math.round(before.lines.revenue * 1.2));
    const after = await intel.getScenarioBase("this_month");
    expect(after.lines).toEqual(before.lines);
    const list = await intel.listScenarios();
    expect(list[0].name).toBe("Revenue naik 20%");
  });

  it("CEO brief memuat revenue & main attention", async () => {
    const brief = await intel.getCeoBrief();
    expect(brief.text).toContain("GARAGE CEO FINANCIAL BRIEF");
    expect(brief.text).toContain("Revenue hari ini: Rp");
    expect(brief.text).toContain("Main attention:");
  });
});

describe("AI Financial Assistant", () => {
  it("ringkasan AI memuat angka aktual, forecast PROYEKSI, dan aturan jawab", async () => {
    const summary = await intel.getFinanceControlAiSummary();
    expect(summary).not.toBeNull();
    expect(summary.today.revenue).toBeGreaterThan(0);
    expect(summary.capitalRecovery.initialCapital).toBe(500_000_000);
    expect(summary.forecast.label).toBe("PROYEKSI");
    expect(summary.answerRules.join(" ")).toContain("Jangan mengarang angka");
  });
});

describe("Export laporan", () => {
  it("9 laporan × PDF/Excel/CSV menghasilkan file valid", async () => {
    for (const type of reports.REPORT_TYPES) {
      const pdf = await reports.exportFinanceReport({ type, format: "pdf", period: "this_month" });
      expect(pdf.body.subarray(0, 4).toString()).toBe("%PDF");
      const xlsx = await reports.exportFinanceReport({ type, format: "xlsx", period: "this_month" });
      expect(xlsx.body.subarray(0, 2).toString()).toBe("PK");
      const csv = await reports.exportFinanceReport({ type, format: "csv", period: "this_month" });
      expect(csv.body.toString("utf8")).toContain(reports.REPORT_LABEL[type]);
    }
  }, 60_000);
});
