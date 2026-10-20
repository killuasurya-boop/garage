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
// Kas Keluar / Masuk Laci (owner, Okt 2026): kategori + klasifikasi keuangan,
// saldo sebelum/sesudah, pengajuan/persetujuan, koreksi, kasbon terhubung
// Payroll, hak akses, rekonsiliasi tutup shift & PDF. Saldo laci, buku kas dan
// laporan harus konsisten di setiap langkah.
// =============================================================================

/* eslint-disable @typescript-eslint/no-explicit-any */
let t: GarageTestDb;
let svc: typeof import("@/lib/garage-service");
let outletId = "";
let sessionId = "";
const KASIR = "user-cd-kasir";
const KASIR_LAIN = "user-cd-kasir-2";
const MANAJER = "user-cd-manajer";
const BARISTA = "user-cd-barista";
const MANAGER_PIN = "482913";

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
const manajer = () => as(MANAJER, "Manajer");

async function expectedCash(id = sessionId) {
  const { eq } = await import("drizzle-orm");
  const [row] = await t.getDb().select().from(t.schema.cashSessions).where(eq(t.schema.cashSessions.id, id));
  return row.expectedCash as number;
}

async function movementRow(id: string) {
  const { eq } = await import("drizzle-orm");
  const [row] = await t.getDb().select().from(t.schema.cashMovements).where(eq(t.schema.cashMovements.id, id));
  return row;
}

async function expenseRow(id: string) {
  const { eq } = await import("drizzle-orm");
  const [row] = await t.getDb().select().from(t.schema.expenses).where(eq(t.schema.expenses.id, id));
  return row;
}

beforeAll(async () => {
  t = await setupGarageTestDb();
  const seeded = await seedGarageBasics(t, { userId: KASIR });
  outletId = seeded.outletId;
  svc = await import("@/lib/garage-service");
  const { hashPin } = await import("@/lib/attendance");
  const { eq } = await import("drizzle-orm");
  const d = t.getDb();
  await d.insert(t.schema.user).values([
    { id: KASIR_LAIN, name: "Kasir Lain", email: `${KASIR_LAIN}@garage.id` },
    { id: MANAJER, name: "Manajer Kas", email: `${MANAJER}@garage.id` },
    { id: BARISTA, name: "Barista Budi", email: `${BARISTA}@garage.id` },
  ]);
  await d.insert(t.schema.staffProfiles).values([
    { userId: KASIR_LAIN, outletId, role: "Kasir", status: "active" },
    { userId: MANAJER, outletId, role: "Manajer", status: "active", pinHash: hashPin(MANAGER_PIN) },
    { userId: BARISTA, outletId, role: "Barista", status: "active" },
  ]);
  const [session] = await d.select().from(t.schema.cashSessions).where(eq(t.schema.cashSessions.openedBy, KASIR));
  sessionId = session.id;
}, 60_000);

afterAll(async () => {
  await teardownGarageTestDb(t);
});

const ids: Record<string, string> = {};
let belanjaBarRef = "";

describe("Kas laci — pencatatan & klasifikasi", () => {
  it("kas keluar belanja bar: ref unik, saldo sebelum/sesudah, jadi biaya belanja bahan", async () => {
    expect(await expectedCash()).toBe(100_000);
    const res = await svc.recordCashMovement(
      {
        type: "out",
        categoryKey: "belanja_bar",
        description: "Beli 2 liter susu UHT",
        amount: 30_000,
        vendorName: "Toko Sumber Rejeki",
        receiptNo: "NT-881",
      },
      kasir(),
    );
    expect(res.status).toBe("recorded");
    expect(res.refNo).toMatch(/^KAS-\d{6}-0001$/);
    belanjaBarRef = res.refNo!;
    ids.bar = res.id;
    const row = await movementRow(res.id);
    expect(row.balanceBefore).toBe(100_000);
    expect(row.balanceAfter).toBe(70_000);
    expect(row.cashGroup).toBe("operational");
    const expense = await expenseRow(row.expenseId);
    expect(expense.category).toBe("Belanja Bar");
    expect(expense.paymentMethod).toBe("Cash");
    expect(expense.sourceDoc).toMatch(/#bar$/);
    expect(await expectedCash()).toBe(70_000);
  });

  it("kas keluar belanja dapur: nomor ref berurutan, saldo berantai", async () => {
    const res = await svc.recordCashMovement(
      { type: "out", categoryKey: "belanja_dapur", description: "Beli bawang merah 1 kg", amount: 20_000 },
      kasir(),
    );
    ids.dapur = res.id;
    expect(res.refNo).toMatch(/-0002$/);
    const row = await movementRow(res.id);
    expect([row.balanceBefore, row.balanceAfter]).toEqual([70_000, 50_000]);
  });

  it("kas masuk tambahan uang kembalian wajib pemberi uang; bukan biaya/pendapatan", async () => {
    await expect(
      svc.recordCashMovement(
        { type: "in", categoryKey: "kembalian", description: "Pecahan untuk kembalian", amount: 40_000 },
        kasir(),
      ),
    ).rejects.toMatchObject({ code: "FIELD_REQUIRED" });
    const res = await svc.recordCashMovement(
      { type: "in", categoryKey: "kembalian", description: "Pecahan untuk kembalian", amount: 40_000, counterparty: "Owner" },
      kasir(),
    );
    expect(res.expenseId).toBeNull();
    expect(await expectedCash()).toBe(90_000);
  });

  it("pengembalian sisa uang belanja mengurangi biaya belanja asal", async () => {
    const res = await svc.recordCashMovement(
      {
        type: "in",
        categoryKey: "sisa_belanja",
        description: "Sisa uang belanja susu",
        amount: 5_000,
        relatedRef: belanjaBarRef,
      },
      kasir(),
    );
    ids.sisa = res.id;
    const bar = await movementRow(ids.bar);
    expect((await expenseRow(bar.expenseId)).amount).toBe(25_000);
    expect(await expectedCash()).toBe(95_000);
  });

  it("kasbon karyawan masuk buku kasbon Payroll (non-biaya); pengembalian kasbon mengurangi sisa", async () => {
    await expect(
      svc.recordCashMovement({ type: "out", categoryKey: "kasbon", description: "Kasbon mendesak", amount: 20_000 }, kasir()),
    ).rejects.toMatchObject({ code: "FIELD_REQUIRED" });
    const res = await svc.recordCashMovement(
      { type: "out", categoryKey: "kasbon", description: "Kasbon mendesak", amount: 20_000, employeeUserId: BARISTA },
      kasir(),
    );
    ids.kasbon = res.id;
    expect(res.counterparty).toBe("Barista Budi");
    const row = await movementRow(res.id);
    expect((await expenseRow(row.expenseId)).category).toBe("Kasbon");
    const { eq } = await import("drizzle-orm");
    const advances = await t
      .getDb()
      .select()
      .from(t.schema.staffCashAdvances)
      .where(eq(t.schema.staffCashAdvances.staffUserId, BARISTA));
    expect(advances).toHaveLength(1);
    expect(advances[0]).toMatchObject({ amount: 20_000, settledAmount: 0, status: "active" });

    await expect(
      svc.recordCashMovement(
        { type: "in", categoryKey: "bayar_kasbon", description: "Bayar kasbon", amount: 30_000, employeeUserId: BARISTA },
        kasir(),
      ),
    ).rejects.toMatchObject({ code: "ADVANCE_EXCEEDED" });
    const repay = await svc.recordCashMovement(
      { type: "in", categoryKey: "bayar_kasbon", description: "Cicil kasbon", amount: 10_000, employeeUserId: BARISTA },
      kasir(),
    );
    ids.repay = repay.id;
    const [after] = await t
      .getDb()
      .select()
      .from(t.schema.staffCashAdvances)
      .where(eq(t.schema.staffCashAdvances.staffUserId, BARISTA));
    expect(after.settledAmount).toBe(10_000);
    const options = await svc.getCashMovementOptions(kasir());
    expect(options.employees.find((e) => e.userId === BARISTA)?.outstandingAdvance).toBe(10_000);
    expect(await expectedCash()).toBe(85_000);
  });

  it("validasi: nominal tidak valid, deskripsi kosong, kategori tidak sesuai jenis", async () => {
    for (const amount of [0, -5_000, 1500.5]) {
      await expect(
        svc.recordCashMovement({ type: "out", categoryKey: "air_es", description: "Es batu", amount }, kasir()),
      ).rejects.toMatchObject({ code: "AMOUNT_INVALID" });
    }
    await expect(
      svc.recordCashMovement({ type: "out", categoryKey: "air_es", description: "  ", amount: 5_000 }, kasir()),
    ).rejects.toMatchObject({ code: "DESCRIPTION_REQUIRED" });
    await expect(
      svc.recordCashMovement({ type: "in", categoryKey: "belanja_bar", description: "Salah arah", amount: 5_000 }, kasir()),
    ).rejects.toMatchObject({ code: "CATEGORY_INVALID" });
    expect(await expectedCash()).toBe(85_000);
  });

  it("tanpa shift terbuka ditolak", async () => {
    await expect(
      svc.recordCashMovement(
        { type: "out", categoryKey: "air_es", description: "Es batu", amount: 5_000 },
        as(KASIR_LAIN, "Kasir"),
      ),
    ).rejects.toBeInstanceOf(svc.CashSessionRequiredForCashOutError);
  });
});

describe("Kas laci — persetujuan, refund, setoran", () => {
  let cashOrderNo = "";

  it("refund pelanggan wajib order valid & persetujuan; pengajuan tidak menggerakkan uang", async () => {
    const order: any = await svc.createOrder(
      {
        orderType: "takeaway",
        paymentMethod: "Cash",
        cashReceived: 20_000,
        items: [{ itemId: "itm-coffee", variantId: "reg", qty: 1 }],
      } as any,
      kasir(),
    );
    cashOrderNo = order.orderNo;
    expect(await expectedCash()).toBe(105_000);

    await expect(
      svc.recordCashMovement(
        { type: "out", categoryKey: "refund_pelanggan", description: "Kelebihan bayar", amount: 5_000, orderRef: "TIDAK-ADA" },
        kasir(),
      ),
    ).rejects.toMatchObject({ code: "ORDER_NOT_FOUND" });
    await expect(
      svc.recordCashMovement(
        { type: "out", categoryKey: "refund_pelanggan", description: "Kelebihan bayar", amount: 5_000, orderRef: cashOrderNo },
        kasir(),
      ),
    ).rejects.toBeInstanceOf(svc.CashMovementPinRequiredError);

    const pending = await svc.recordCashMovement(
      {
        type: "out",
        categoryKey: "refund_pelanggan",
        description: "Kelebihan bayar",
        amount: 5_000,
        orderRef: cashOrderNo,
        submitForApproval: true,
      },
      kasir(),
    );
    ids.refund = pending.id;
    expect(pending.status).toBe("pending_approval");
    expect(await expectedCash()).toBe(105_000);
    const row = await movementRow(pending.id);
    expect(row.balanceBefore).toBeNull();

    await expect(svc.decideCashMovement(pending.id, { action: "approve" }, kasir())).rejects.toThrow(/Owner atau Manajer/);
    const approved = await svc.decideCashMovement(pending.id, { action: "approve", note: "Cek struk OK" }, manajer());
    expect(approved.status).toBe("recorded");
    expect(approved.expenseId).toBeNull();
    expect([approved.balanceBefore, approved.balanceAfter]).toEqual([105_000, 100_000]);
    expect(approved.approvedBy).toBe(MANAJER);
    expect(await expectedCash()).toBe(100_000);
  });

  it("setoran ke Manajer pakai PIN penerima → tercatat, bukan biaya", async () => {
    await expect(
      svc.recordCashMovement(
        { type: "out", categoryKey: "setoran", description: "Setoran siang", amount: 40_000, counterparty: "Manajer Kas", managerPin: "000000" },
        kasir(),
      ),
    ).rejects.toThrow(/PIN salah/);
    const res = await svc.recordCashMovement(
      { type: "out", categoryKey: "setoran", description: "Setoran siang", amount: 40_000, counterparty: "Manajer Kas", managerPin: MANAGER_PIN },
      kasir(),
    );
    expect(res.status).toBe("recorded");
    expect(res.approvedByName).toBe("Manajer Kas");
    expect(res.expenseId).toBeNull();
    expect(await expectedCash()).toBe(60_000);
  });

  it("pengajuan di atas batas yang ditolak tetap tersimpan dengan alasan", async () => {
    const pending = await svc.recordCashMovement(
      { type: "out", categoryKey: "belanja_bar", description: "Beli biji kopi 1 kg", amount: 60_000, submitForApproval: true },
      kasir(),
    );
    await expect(svc.decideCashMovement(pending.id, { action: "reject" }, manajer())).rejects.toMatchObject({
      code: "REASON_REQUIRED",
    });
    const rejected = await svc.decideCashMovement(pending.id, { action: "reject", note: "Pakai stok gudang" }, manajer());
    expect(rejected.status).toBe("rejected");
    expect(rejected.decisionNote).toBe("Pakai stok gudang");
    await expect(svc.decideCashMovement(pending.id, { action: "approve" }, manajer())).rejects.toMatchObject({
      code: "NOT_PENDING",
    });
    expect(await expectedCash()).toBe(60_000);
  });
});

describe("Kas laci — koreksi, pembatalan, akses", () => {
  it("koreksi oleh Manajer: baris lama dibatalkan, pengganti tercatat, before/after di riwayat", async () => {
    await expect(
      svc.correctCashMovement(ids.dapur, { type: "out", categoryKey: "belanja_dapur", description: "x", amount: 1, reason: "tes" } as any, kasir()),
    ).rejects.toThrow(/Owner atau Manajer/);
    const replacement = await svc.correctCashMovement(
      ids.dapur,
      { type: "out", categoryKey: "belanja_dapur", description: "Beli bawang merah 1 kg", amount: 25_000, reason: "Nota ternyata 25rb" },
      manajer(),
    );
    expect(replacement.correctsMovementId).toBe(ids.dapur);
    const old = await movementRow(ids.dapur);
    expect(old.status).toBe("voided");
    expect((await expenseRow(old.expenseId)).status).toBe("cancelled");
    expect((await expenseRow(replacement.expenseId!)).amount).toBe(25_000);
    // 60.000 + 20.000 (batal) − 25.000 (pengganti)
    expect(await expectedCash()).toBe(55_000);

    const detail = await svc.getCashMovementDetail(ids.dapur, manajer());
    const correction = detail!.history.find((h) => h.action === "Koreksi kas laci");
    expect(correction?.reason).toBe("Nota ternyata 25rb");
    expect(correction?.before).toMatchObject({ amount: 20_000 });
    expect(correction?.after).toMatchObject({ amount: 25_000 });
    expect(detail!.linked.map((l) => l.id)).toContain(replacement.id);
  });

  it("pengeluaran kas laci tidak bisa dibatalkan dari Finance (hindari koreksi kas ganda)", async () => {
    const row = await movementRow(ids.bar);
    await expect(
      t.getDb().transaction((tx: any) => svc.cancelExpenseInTx(tx, row.expenseId, manajer(), "tes")),
    ).rejects.toThrow(/Riwayat Kas Laci/);
  });

  it("kasbon yang sudah dicicil tidak bisa dibatalkan sebelum cicilannya dibatalkan", async () => {
    await expect(svc.voidCashMovement(ids.kasbon, "Salah orang", manajer())).rejects.toMatchObject({
      code: "ADVANCE_SETTLED",
    });
    await svc.voidCashMovement(ids.repay, "Cicilan salah input", manajer());
    await svc.voidCashMovement(ids.kasbon, "Salah orang", manajer());
    const { eq } = await import("drizzle-orm");
    const [advance] = await t
      .getDb()
      .select()
      .from(t.schema.staffCashAdvances)
      .where(eq(t.schema.staffCashAdvances.staffUserId, BARISTA));
    expect(advance).toMatchObject({ status: "cancelled", settledAmount: 0 });
    // 55.000 − 10.000 (batal cicilan masuk) + 20.000 (batal kasbon keluar)
    expect(await expectedCash()).toBe(65_000);
  });

  it("hak akses riwayat: Kasir hanya miliknya & tanpa saldo saat shift buka; Manajer seluruh outlet", async () => {
    const own = await svc.listCashMovements({}, kasir());
    expect(own.items.length).toBeGreaterThan(5);
    expect(own.canManage).toBe(false);
    expect(own.items.every((row) => row.balanceBefore === null)).toBe(true);
    const other = await svc.listCashMovements({}, as(KASIR_LAIN, "Kasir"));
    expect(other.items).toHaveLength(0);
    expect(await svc.getCashMovementDetail(ids.bar, as(KASIR_LAIN, "Kasir"))).toBeNull();

    const all = await svc.listCashMovements({}, manajer());
    expect(all.canManage).toBe(true);
    expect(all.items.find((row) => row.id === ids.bar)?.balanceAfter).toBe(70_000);
    const filtered = await svc.listCashMovements({ status: "rejected" }, manajer());
    expect(filtered.items).toHaveLength(1);
    const search = await svc.listCashMovements({ q: belanjaBarRef }, manajer());
    expect(search.items.map((row) => row.id)).toEqual([ids.bar]);
    const outOnly = await svc.listCashMovements({ type: "in", categoryKey: "kembalian" }, manajer());
    expect(outOnly.items).toHaveLength(1);
  });
});

describe("Kas laci — rekonsiliasi, tutup & ganti shift, PDF", () => {
  it("ringkasan shift: hanya transaksi tercatat, per kelompok, rumus kas akhir konsisten", async () => {
    const pending = await svc.recordCashMovement(
      { type: "out", categoryKey: "brankas", description: "Pindah ke brankas", amount: 50_000, counterparty: "Manajer", submitForApproval: true },
      kasir(),
    );
    expect(pending.status).toBe("pending_approval");
    const summary: any = await svc.getCashSessionSummary(sessionId, KASIR);
    // Masuk: kembalian 40k + sisa belanja 5k. Keluar: bar 30k + dapur(koreksi) 25k + refund 5k + setoran 40k.
    expect(summary.cashMovements).toMatchObject({ cashIn: 45_000, cashOut: 100_000, pendingCount: 1, pendingAmount: 50_000 });
    const groups = Object.fromEntries(summary.cashMovements.byGroup.map((g: any) => [g.group, [g.cashIn, g.cashOut]]));
    expect(groups).toEqual({
      operational: [0, 55_000],
      refund: [0, 5_000],
      capital: [40_000, 0],
      return: [5_000, 0],
      transfer: [0, 40_000],
    });
    const recon = summary.reconciliation;
    expect(recon.cashSales).toBe(20_000);
    expect(recon.openingCash + recon.cashSales + recon.cashIn - recon.cashOut + recon.otherAdjustments).toBe(recon.expectedCash);
    expect(recon.otherAdjustments).toBe(0);
    expect(recon.expectedCash).toBe(65_000);

    const { redactOpenShiftSummary } = await import("@/lib/cash-blind");
    const hidden: any = redactOpenShiftSummary(summary, "Kasir");
    expect(hidden.reconciliation.expectedCash).toBe(0);
    expect(hidden.movements.every((m: any) => m.balanceAfter === null)).toBe(true);
  });

  it("tutup shift pas; pengajuan & pembatalan setelah tutup ditolak; PDF memuat kas laci", async () => {
    const closed: any = await svc.closeCashSession(sessionId, { actualCash: 65_000 }, kasir());
    expect(closed.discrepancy).toBe(0);
    const pending = (await svc.listCashMovements({ status: "pending_approval" }, manajer())).items[0];
    await expect(svc.decideCashMovement(pending.id, { action: "approve" }, manajer())).rejects.toMatchObject({
      code: "SESSION_CLOSED",
    });
    await expect(svc.voidCashMovement(ids.bar, "Terlambat", manajer())).rejects.toMatchObject({ code: "SESSION_CLOSED" });
    await svc.decideCashMovement(pending.id, { action: "reject", note: "Shift sudah tutup" }, manajer());

    const summary = await svc.getCashSessionSummary(sessionId, KASIR);
    const transactions = await svc.getCashSessionTransactions(sessionId, KASIR);
    const { generateShiftReportPdf } = await import("@/lib/garage-shift-report-pdf");
    const pdf = await generateShiftReportPdf(summary!, transactions!);
    expect(pdf.subarray(0, 4).toString()).toBe("%PDF");
    expect(pdf.length).toBeGreaterThan(2_000);
    if (process.env.CASH_PDF_OUT) (await import("node:fs")).writeFileSync(process.env.CASH_PDF_OUT, pdf);
  });

  it("ganti shift: transaksi berikutnya masuk shift baru, nomor ref tetap berlanjut", async () => {
    const opened: any = await svc.createCashSession({ openingCash: 80_000 }, kasir());
    const res = await svc.recordCashMovement(
      { type: "out", categoryKey: "air_es", description: "Beli 1 galon air mineral", amount: 6_000 },
      kasir(),
    );
    expect(res.cashSessionId).toBe(opened.id);
    expect(Number(res.refNo!.slice(-4))).toBeGreaterThan(9);
    expect(await expectedCash(opened.id)).toBe(74_000);
  });
});

describe("Kas laci — foto nota", () => {
  it("foto nota dikompres ke WebP di storage privat; hanya pencatat/Manajer & bukan baris batal", async () => {
    const fs = await import("node:fs");
    const os = await import("node:os");
    const path = await import("node:path");
    const sharp = (await import("sharp")).default;
    const storage = await import("@/lib/cash-receipt-storage");
    const cwd = process.cwd();
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "cash-receipt-"));
    process.chdir(tmp);
    try {
      const photo = await sharp({ create: { width: 2400, height: 3200, channels: 3, background: "#f2efe6" } })
        .jpeg()
        .toBuffer();
      const relative = await storage.storeCashReceipt(ids.bar, photo);
      expect(relative).toMatch(/^\d{4}-\d{2}-\d{2}\/[0-9a-f-]{36}-[0-9a-f]{16}\.webp$/);
      const stored = await storage.readCashReceipt(relative);
      expect(stored!.length).toBeLessThanOrEqual(350 * 1024);
      expect((await sharp(stored!).metadata()).width).toBe(1280);
      expect(await storage.readCashReceipt("../../etc/passwd")).toBeNull();

      await expect(svc.setCashMovementReceiptPhoto(ids.bar, relative, as(KASIR_LAIN, "Kasir"))).rejects.toMatchObject({
        code: "FORBIDDEN",
      });
      await expect(svc.setCashMovementReceiptPhoto(ids.dapur, relative, kasir())).rejects.toMatchObject({
        code: "NOT_ACTIVE",
      });
      await svc.setCashMovementReceiptPhoto(ids.bar, relative, kasir());
      expect(await svc.getCashMovementReceiptPhoto(ids.bar, kasir())).toBe(relative);
      expect(await svc.getCashMovementReceiptPhoto(ids.bar, manajer())).toBe(relative);
      expect(await svc.getCashMovementReceiptPhoto(ids.bar, as(KASIR_LAIN, "Kasir"))).toBeNull();
      const listed = await svc.listCashMovements({ q: belanjaBarRef }, manajer());
      expect(listed.items[0].hasReceiptPhoto).toBe(true);
      const detail = await svc.getCashMovementDetail(ids.bar, manajer());
      expect(detail!.history.some((h) => h.action === "Foto nota kas laci dilampirkan")).toBe(true);
    } finally {
      process.chdir(cwd);
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("filter query string riwayat/ekspor dipetakan konsisten", async () => {
    const { cashMovementFiltersFrom } = await import("@/lib/cash-movement-http");
    const filters = cashMovementFiltersFrom(
      new URLSearchParams("q=susu&from=2026-10-01&to=2026-10-20&type=out&category=belanja_bar&status=recorded&type2=x"),
    );
    expect(filters).toMatchObject({ q: "susu", type: "out", categoryKey: "belanja_bar", status: "recorded" });
    expect(cashMovementFiltersFrom(new URLSearchParams("type=semua")).type).toBeUndefined();
  });
});
