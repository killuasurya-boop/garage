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
// Garage Financial Control (PRD V2.0) — test integrasi engine + closing di DB
// PGlite sementara: revenue dari POS, modal bukan revenue, LOCK DAY menolak
// expense backdate, buka ulang tercatat, checklist menahan closing.
// =============================================================================

/* eslint-disable @typescript-eslint/no-explicit-any */
let t: GarageTestDb;
let svc: any;
let control: any;
let closing: any;
let core: any;
let outletId = "";
const OWNER = "user-itest-owner";
let totalNet = 0;

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
  svc = await import("@/lib/garage-service");
  control = await import("@/lib/finance-control");
  closing = await import("@/lib/finance-closing");
  core = await import("@/lib/finance-control-core");

  const order = await svc.createOrder(
    {
      orderType: "takeaway",
      paymentMethod: "QRIS",
      paymentReference: "QR-FC-001",
      items: [{ itemId: "itm-coffee", variantId: "reg", qty: 2 }],
    },
    ownerSession(),
  );
  totalNet = order.total - order.tax;
}, 60_000);

afterAll(async () => {
  await teardownGarageTestDb(t);
});

describe("Financial engine (DB nyata)", () => {
  it("revenue = total order − pajak; modal Rp500 jt tidak masuk revenue", async () => {
    const dashboard = await control.getFinanceControlDashboard({ period: "today" });
    expect(dashboard.pnl.netSales).toBe(totalNet);
    expect(dashboard.capital.initialCapital).toBe(500_000_000);
    expect(dashboard.kpis.revenue.value).toBe(totalNet);
    // Akru biaya harian owner: listrik 35 + internet 10 + iklan 30 + sewa 25 + overhead 55 rb.
    expect(dashboard.pnl.operatingExpense).toBe(155_000);
  });

  it("HPP aktual memasukkan susut opname outlet + waste gudang WMS (PRD §11)", async () => {
    const d = t.getDb();
    const { schema } = t;
    await d.insert(schema.inventoryItems).values({
      sku: "ITEST-SUSU",
      name: "Susu Test",
      alternativeName: "Susu",
      category: "Dairy",
      unit: "ml",
      packageSize: "1000 ml",
      unitCost: 20,
      onHand: 1000,
      min: 100,
      status: "safe",
      movement: "normal",
    });
    // Opname: fisik kurang 50 ml → susut 50 × Rp20 = Rp1.000.
    await d.insert(schema.stockMovements).values({ itemSku: "ITEST-SUSU", type: "opname_outlet", note: "test", qty: -50 });
    // Transfer tidak boleh dihitung sebagai susut.
    await d.insert(schema.stockMovements).values({ itemSku: "ITEST-SUSU", type: "warehouse_issue", note: "test", qty: -500 });
    // Waste gudang WMS bernilai HPP batch Rp4.000.
    await d.insert(schema.wmsStockMovement).values({ type: "waste", qty: -2, valueHpp: 4_000, refDoc: "test" });

    const dashboard = await control.getFinanceControlDashboard({ period: "today" });
    expect(dashboard.pnl.cogsShrinkage).toBe(5_000);
    // Mode default "purchase": biaya bahan = belanja gudang; susut tetap tampil sebagai info
    // (nilainya sudah termasuk di belanja) sehingga tidak dikurangkan dua kali.
    expect(dashboard.pnl.cogsBasis).toBe("purchase");
    expect(dashboard.pnl.cogs).toBe(dashboard.pnl.purchaseBar + dashboard.pnl.purchaseDapur + dashboard.pnl.purchaseUmum);
  });

  it("expense ≥ batas approval default (Rp1 jt) masuk pending_approval", async () => {
    const expense = await svc.createExpense(
      { category: "Operasional", description: "Servis mesin", amount: 1_500_000, paymentMethod: "Transfer" },
      ownerSession(),
    );
    expect(expense.status).toBe("pending_approval");
  });
});

describe("Daily closing", () => {
  const today = () => core.jakartaDateKey();
  const yesterday = () => core.addDays(core.jakartaDateKey(), -1);

  it("closing hari ini ditahan karena shift kasir masih open & expense pending", async () => {
    const review = await closing.getDailyClosingReview(today());
    expect(review.blocking).toBeGreaterThan(0);
    await expect(
      closing.closeFinanceDay({ date: today(), acknowledgeWarnings: true }, ownerSession()),
    ).rejects.toMatchObject({ code: "CHECKLIST_BLOCKED" });
  });

  it("LOCK DAY kemarin → snapshot locked & expense backdate ditolak", async () => {
    const closed = await closing.closeFinanceDay({ date: yesterday(), acknowledgeWarnings: true }, ownerSession());
    expect(closed.status).toBe("closed");

    const [snapshot] = await t
      .getDb()
      .select()
      .from(t.schema.financialSnapshots)
      .where((await import("drizzle-orm")).eq(t.schema.financialSnapshots.date, yesterday()));
    expect(snapshot.status).toBe("locked");
    // Laporan Harian Rekening Bersama: ringkasan HPP produk ikut dibekukan di angka closing.
    const [dayClosing] = await t
      .getDb()
      .select()
      .from(t.schema.financeDailyClosings)
      .where((await import("drizzle-orm")).eq(t.schema.financeDailyClosings.date, yesterday()));
    expect((dayClosing.figures as { productSales?: { totals?: unknown } }).productSales?.totals).toBeTruthy();

    await expect(
      svc.createExpense(
        {
          category: "Operasional",
          description: "Backdate",
          amount: 20_000,
          paymentMethod: "Transfer",
          expenseDate: `${yesterday()}T12:00:00+07:00`,
        },
        ownerSession(),
      ),
    ).rejects.toMatchObject({ code: "DAY_LOCKED" });
  });

  it("buka ulang (Owner + alasan) membuka kunci dan tercatat di audit log", async () => {
    const reopened = await closing.reopenFinanceDay(
      { date: yesterday(), reason: "Ada nota listrik tertinggal" },
      ownerSession(),
    );
    expect(reopened.status).toBe("reopened");

    const expense = await svc.createExpense(
      {
        category: "Operasional",
        description: "Nota tertinggal",
        amount: 20_000,
        paymentMethod: "Transfer",
        expenseDate: `${yesterday()}T12:00:00+07:00`,
      },
      ownerSession(),
    );
    expect(expense.status).toBe("recorded");

    const logs = await t.getDb().select().from(t.schema.auditLogs);
    expect(logs.some((row: any) => row.action.startsWith("Daily closing dibuka ulang"))).toBe(true);
  });
});

describe("Approval expense 2 tingkat (PRD §46)", () => {
  function managerSession(): GarageSession {
    const owner = ownerSession() as any;
    return {
      ...owner,
      user: { id: "user-itest-manajer", name: "Manajer Test" },
      profile: { ...owner.profile, id: "sp-manajer", role: "Manajer" as Role },
    } as GarageSession;
  }

  beforeAll(async () => {
    await t
      .getDb()
      .insert(t.schema.user)
      .values({ id: "user-itest-manajer", name: "Manajer Test", email: "manajer-itest@garage.id" })
      .onConflictDoNothing();
  });

  it("≥ Rp5 jt: Manajer hanya review, keputusan final Owner", async () => {
    const expense = await svc.createExpense(
      { category: "Maintenance", description: "Servis mesin espresso", amount: 6_000_000, paymentMethod: "Transfer" },
      ownerSession(),
    );
    expect(expense.status).toBe("pending_approval");
    const approvalId = `APP-EXP-${expense.id}`;

    const reviewed = await svc.decideApproval(approvalId, { status: "approved" }, managerSession());
    expect(reviewed.status).toBe("pending");
    expect(reviewed.payload.managerReview.name).toContain("Manajer Test");
    expect(reviewed.reason).toContain("menunggu Owner");

    await expect(svc.decideApproval(approvalId, { status: "approved" }, managerSession())).rejects.toThrow(/Owner/);

    // Audit SA-01: biaya risiko tinggi (R3) = Owner + kode 2FA (Decision Center mengisi stepUpVerified).
    await expect(svc.decideApproval(approvalId, { status: "approved" }, ownerSession())).rejects.toMatchObject({ code: "R3_STEP_UP_REQUIRED" });
    const final = await svc.decideApproval(approvalId, { status: "approved" }, ownerSession(), { via: "decision_center", stepUpVerified: true });
    expect(final.status).toBe("approved");
    const [row] = await t
      .getDb()
      .select()
      .from(t.schema.expenses)
      .where((await import("drizzle-orm")).eq(t.schema.expenses.id, expense.id));
    expect(row.status).toBe("approved");
  });

  it("di bawah batas Owner: Manajer boleh memutuskan final", async () => {
    const expense = await svc.createExpense(
      { category: "Operasional", description: "Perbaikan kursi", amount: 2_000_000, paymentMethod: "Transfer" },
      ownerSession(),
    );
    const decided = await svc.decideApproval(`APP-EXP-${expense.id}`, { status: "approved" }, managerSession());
    expect(decided.status).toBe("approved");
  });
});

describe("Monthly closing", () => {
  it("bulan berjalan tidak bisa dikunci", async () => {
    const month = core.jakartaDateKey().slice(0, 7);
    const review = await closing.getMonthlyClosingReview(month);
    expect(review.checks.find((c: any) => c.id === "period").status).toBe("block");
    await expect(
      closing.closeFinanceMonth({ month, acknowledgeWarnings: true }, ownerSession()),
    ).rejects.toMatchObject({ code: "CHECKLIST_BLOCKED" });
  });
});
