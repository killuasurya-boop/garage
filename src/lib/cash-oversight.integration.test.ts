import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { Role } from "@/lib/garage-data";
import type { GarageSession } from "@/lib/server-auth";
import { cashCount } from "@/lib/test-helpers/cash-count";
import { seedGarageBasics, setupGarageTestDb, teardownGarageTestDb, type GarageTestDb } from "@/lib/test-helpers/garage-test-db";

// Pengawasan Kas Owner (P5): setiap hal yang menggantung muncul di antrean yang benar,
// saldo = buku kas, dan Excel memuat angka yang sama dengan JSON.

/* eslint-disable @typescript-eslint/no-explicit-any */
let t: GarageTestDb;
let svc: typeof import("@/lib/garage-service");
let acc: typeof import("@/lib/cashier-accountability");
let oversight: typeof import("@/lib/cash-oversight");
let outletId = "";
const KASIR = "user-ov-kasir";
const KASIR2 = "user-ov-kasir2";
const MANAJER = "user-ov-manajer";
const OWNER = "user-ov-owner";
const PIN = "482913";

function as(userId: string, role: Role): GarageSession {
  return {
    user: { id: userId, name: `Nama ${userId}`, email: `${userId}@garage.id` },
    profile: {
      id: `sp-${userId}`,
      role,
      shiftLabel: "Pagi",
      deviceLabel: "Kasir-1",
      passwordResetRequired: false,
      outlet: { id: outletId, code: "TST", name: "Outlet Test", timezone: "Asia/Jakarta" },
    },
  } as unknown as GarageSession;
}
const kasir = () => as(KASIR, "Kasir");
const kasir2 = () => as(KASIR2, "Kasir");
const manajer = () => as(MANAJER, "Manajer");
const owner = () => as(OWNER, "Owner");
const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(new Date());

beforeAll(async () => {
  t = await setupGarageTestDb();
  ({ outletId } = await seedGarageBasics(t, { userId: KASIR }));
  svc = await import("@/lib/garage-service");
  acc = await import("@/lib/cashier-accountability");
  oversight = await import("@/lib/cash-oversight");
  const { hashPin } = await import("@/lib/attendance");
  const { eq } = await import("drizzle-orm");
  const d = t.getDb();
  await d.insert(t.schema.user).values([
    { id: KASIR2, name: "Kasir Dua", email: `${KASIR2}@garage.id` },
    { id: MANAJER, name: "Manajer OV", email: `${MANAJER}@garage.id` },
    { id: OWNER, name: "Owner OV", email: `${OWNER}@garage.id` },
  ]);
  await d.insert(t.schema.staffProfiles).values([
    { userId: KASIR, outletId, role: "Kasir", status: "active" },
    { userId: KASIR2, outletId, role: "Kasir", status: "active" },
    { userId: MANAJER, outletId, role: "Manajer", status: "active", pinHash: hashPin(PIN) },
    { userId: OWNER, outletId, role: "Owner", status: "active" },
  ]).onConflictDoNothing();
  await d.insert(t.schema.menuItems).values({ id: "itm-ov", name: "Item OV", category: "Coffee", section: "Coffee", prep: "1m" });
  await d.insert(t.schema.menuVariants).values({ itemId: "itm-ov", variantId: "reg", label: "Regular", price: 1_000 });
  // Sesi bawaan seedGarageBasics ditutup supaya kasir bisa buka shift baru.
  await d.update(t.schema.cashSessions).set({ status: "closed", closedAt: new Date() }).where(eq(t.schema.cashSessions.status, "open"));
}, 90_000);

afterAll(async () => {
  if (t) await teardownGarageTestDb(t);
});

describe("Pengawasan kas Owner (P5)", () => {
  it("menampilkan setiap hal yang menggantung di antrean yang benar; saldo = buku kas; Excel = JSON", async () => {
    // Shift 1: jual tunai, setor ke Jago (belum dikonfirmasi), tutup kurang Rp5.000.
    const s1: any = await svc.createCashSession({ openingCash: 100_000, managerPin: PIN } as any, kasir());
    await svc.createOrder(
      { orderType: "takeaway", paymentMethod: "Cash", cashReceived: 60_000, items: [{ itemId: "itm-ov", variantId: "reg", qty: 60 }] } as any,
      kasir(),
    );
    const deposit: any = await svc.recordCashMovement(
      { type: "out", categoryKey: "setoran", description: "Setor siang", amount: 50_000, counterparty: "Kasir", depositAccount: "bank_jago", managerPin: PIN } as any,
      kasir(),
    );
    await svc.recordCashMovement(
      { type: "out", categoryKey: "belanja_bar", description: "Susu UHT 1 dus", amount: 150_000, submitForApproval: true } as any,
      kasir(),
    );
    await svc.closeCashSession(s1.id, { actualCash: 105_000, denominations: cashCount(105_000) } as any, kasir());
    await acc.createShiftIncident({ cashSessionId: s1.id, category: "Gangguan QRIS", description: "QRIS BNI timeout" }, kasir());

    // Shift 2: QRIS, tutup darurat tanpa pecahan (alasan + PIN).
    const s2: any = await svc.createCashSession({ openingCash: 100_000, managerPin: PIN } as any, kasir2());
    await svc.createOrder(
      { orderType: "takeaway", paymentMethod: "QRIS", items: [{ itemId: "itm-ov", variantId: "reg", qty: 25 }] } as any,
      kasir2(),
    );
    await svc.closeCashSession(s2.id, { actualCash: 100_000, countSkippedReason: "Kasir sakit mendadak", managerPin: PIN } as any, kasir2());

    // Petty: isi dana Owner (tanpa pemeriksa kedua), pengajuan kasir disetujui tapi belum dibayar, satu masih diajukan.
    await acc.createPettyCashEntry({ type: "topup", category: "Pengisian dana", description: "Dana awal", amount: 200_000, fundSource: "bank_jago" } as any, owner());
    const unpaid: any = await acc.createPettyCashEntry(
      { type: "expense", category: "Kebersihan", description: "Sabun", amount: 20_000, recipient: "Toko A" } as any,
      kasir(),
    );
    await acc.decidePettyCashEntry(unpaid.id, { decision: "approve" }, manajer());
    await acc.createPettyCashEntry({ type: "expense", category: "Lain-lain", description: "Lakban", amount: 8_000, recipient: "Toko B" } as any, kasir());

    const data = await oversight.getCashOversight({ fromDate: today(), toDate: today() });
    const refs = (key: keyof typeof data.queues) => data.queues[key].map((item) => item.ref);

    expect(refs("discrepancy_unverified")).toEqual([s1.code]);
    expect(data.queues.discrepancy_unverified[0].amount).toBe(-5_000);
    expect(data.queues.deposit_unconfirmed.map((item) => item.id)).toEqual([deposit.id]);
    expect(data.queues.cash_out_pending).toHaveLength(1);
    expect(data.queues.petty_unpaid.map((item) => item.id)).toEqual([unpaid.id]);
    expect(data.queues.petty_submitted).toHaveLength(1);
    expect(data.queues.incident_open).toHaveLength(1);
    expect(refs("qris_mismatch")).toEqual([s2.code]);
    expect(data.exceptions.emergency_close.map((item) => item.ref)).toEqual([s2.code]);
    expect(data.exceptions.petty_self_approved).toHaveLength(1);
    expect(data.exceptions.cache_mismatch).toHaveLength(0);
    expect(data.summary).toMatchObject({ closedShifts: 3, short: -5_000, depositsInTransit: 50_000, depositsConfirmed: 0 });
    expect(data.summary.byStatus.minor).toBe(1);
    expect(data.summary.openItems).toBe(7);

    const { accountBalance } = await import("@/lib/cash-ledger");
    const balance = (account: string) => data.balances.find((row) => row.account === account)?.balance;
    expect(balance("deposit_transit")).toBe(50_000);
    expect(balance("petty")).toBe(await accountBalance("petty", null));

    // Excel dari objek yang sama.
    const { oversightWorkbook } = await import("@/lib/cash-oversight-xlsx");
    const ExcelJS = (await import("exceljs")).default;
    const book = new ExcelJS.Workbook();
    await book.xlsx.load((await oversightWorkbook(data)) as any);
    const queueSheet = book.getWorksheet("Antrean tindakan")!;
    expect(String(queueSheet.getCell("A1").value)).toContain("Snapshot");
    expect(queueSheet.rowCount - 2).toBe(data.summary.openItems);
    const summarySheet = book.getWorksheet("Ringkasan")!;
    const summaryRows = new Map<string, unknown>();
    summarySheet.eachRow((row) => summaryRows.set(String(row.getCell(1).value), row.getCell(2).value));
    expect(summaryRows.get("Setoran dalam perjalanan (Rp)")).toBe(50_000);
    expect(summaryRows.get("Setoran dalam perjalanan")).toBe(50_000);

    // Setelah setoran dikonfirmasi & shift diverifikasi + diakui, antreannya hilang.
    await svc.confirmCashDeposit(deposit.id, { bankRef: "JAGO-1" }, owner());
    await acc.reviewCashSession(s1.id, { status: "verified", note: "Kembalian kurang", acknowledgeDiscrepancy: true }, manajer());
    const after = await oversight.getCashOversight({ fromDate: today(), toDate: today() });
    expect(after.queues.deposit_unconfirmed).toHaveLength(0);
    expect(after.queues.discrepancy_unverified).toHaveLength(0);
    expect(after.summary.depositsConfirmed).toBe(50_000);
    expect(after.exceptions.deposit_self_confirmed).toHaveLength(0);
    expect(after.balances.find((row) => row.account === "bank_jago")?.balance).toBe(
      (await accountBalance("bank_jago", null)),
    );
  });

  it("filter outlet lain → kosong", async () => {
    const data = await oversight.getCashOversight({ fromDate: today(), toDate: today(), outletId: "00000000-0000-4000-8000-000000000999" });
    expect(data.summary.shifts).toBe(0);
    expect(data.summary.openItems).toBe(0);
  });
});
