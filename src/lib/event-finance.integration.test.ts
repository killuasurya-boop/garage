import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import type { Role } from "@/lib/garage-data";
import type { GarageSession } from "@/lib/server-auth";
import { seedGarageBasics, setupGarageTestDb, teardownGarageTestDb, type GarageTestDb } from "@/lib/test-helpers/garage-test-db";

// GIGS EO Fase 2 (Owner 17 Nov 2026): anggaran, pembayaran biaya event (buku kas), laba rugi, untung/rugi event.

/* eslint-disable @typescript-eslint/no-explicit-any */
let t: GarageTestDb;
let svc: any;
let outletId = "";
let eventId = "";
let lineId = "";
let bankPaymentId = "";
const OWNER = "user-itest-evfin-owner";

function session(role: Role, extra: Record<string, unknown> = {}): GarageSession {
  return {
    user: { id: OWNER, name: `${role} Evfin` },
    profile: { id: `ef-${OWNER}`, role, shiftLabel: "Pagi", deviceLabel: "EVFIN", passwordResetRequired: false, outlet: { id: outletId, code: "TST", name: "Outlet Test", timezone: "Asia/Jakarta" }, ...extra },
  } as unknown as GarageSession;
}
const owner = () => session("Owner" as Role);

beforeAll(async () => {
  t = await setupGarageTestDb();
  outletId = (await seedGarageBasics(t, { userId: OWNER })).outletId;
  const [row] = await t
    .getDb()
    .insert(t.schema.events)
    .values({
      slug: "gigs-uang",
      title: "GIGS UANG",
      outletId,
      startsAt: new Date("2026-11-10T12:00:00Z"),
      endsAt: new Date("2026-11-10T17:00:00Z"),
      venueName: "Garage Coffee",
      address: "Jl. Contoh No. 1, Tebing Tinggi",
      mapsUrl: "https://maps.app.goo.gl/contoh",
      contactWhatsapp: "6281200000000",
      status: "published",
    } as any)
    .returning();
  eventId = row.id;
  svc = await import("@/lib/event-finance-service");
}, 60_000);

afterAll(async () => {
  await teardownGarageTestDb(t);
});

describe("Keuangan event", () => {
  it("Manajer dan API key agent ditolak", async () => {
    await expect(svc.getEventFinance(session("Manajer" as Role), eventId)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(svc.createBudgetLine({ eventId, category: "sound", title: "Sound", plannedAmount: 1 }, session("Owner" as Role, { agentKey: { id: "k" } }))).rejects.toMatchObject({ code: "HUMAN_SESSION_REQUIRED" });
  });

  it("pos anggaran + honor penampil event yang sama saja", async () => {
    const lineup = await import("@/lib/event-lineup-service");
    const surai = await lineup.createPerformer({ eventId, name: "Surai", kind: "band", status: "konfirmasi" }, owner());
    const line = await svc.createBudgetLine({ eventId, category: "honor", title: "Honor Surai", plannedAmount: 1_000_000, performerId: surai.id }, owner());
    lineId = line.id;
    await svc.createBudgetLine({ eventId, category: "sound", title: "Sound system", plannedAmount: 2_000_000 }, owner());
    const other = await lineup.createPerformer({ eventName: "Event Lain Tanpa Master", name: "Band Lain", kind: "band" }, owner());
    await expect(svc.createBudgetLine({ eventId, category: "honor", title: "Honor salah", plannedAmount: 1, performerId: other.id }, owner())).rejects.toMatchObject({ code: "PERFORMER_OTHER_EVENT" });
  });

  it("bayar dari rekening = 1 baris buku kas; idempoten; uang pribadi Owner tanpa baris kas", async () => {
    const pay = { budgetLineId: lineId, amount: 600_000, paidAt: "2026-11-10", source: "bank_jago", payee: "Surai", reference: "TRX-1", idempotencyKey: "evfin-pay-0001" };
    const first = await svc.recordExpensePayment(pay, owner());
    bankPaymentId = first.payment.id;
    const again = await svc.recordExpensePayment(pay, owner());
    expect(again.replay).toBe(true);
    await expect(svc.recordExpensePayment({ ...pay, amount: 1 }, owner())).rejects.toMatchObject({ code: "IDEMPOTENCY_MISMATCH" });
    await svc.recordExpensePayment({ budgetLineId: lineId, amount: 400_000, paidAt: "2026-11-10", source: "external", payee: "Surai", idempotencyKey: "evfin-pay-0002" }, owner());
    await expect(svc.recordExpensePayment({ ...pay, paidAt: "2099-01-01", idempotencyKey: "evfin-pay-future" }, owner())).rejects.toMatchObject({ code: "FUTURE_DATE" });

    const ledger = (await t.getDb().select().from(t.schema.cashLedgerEntries)).filter((r: any) => r.sourceType === "event_expense");
    expect(ledger).toHaveLength(1);
    expect(ledger[0]).toMatchObject({ fromAccount: "bank_jago", toAccount: "external", amount: 600_000, sourceId: bankPaymentId });
  });

  it("laba rugi: Biaya Event non-operasional mengurangi net profit, bukan omzet", async () => {
    const fin = await import("@/lib/finance-control");
    const core = await import("@/lib/finance-control-core");
    const config = await fin.loadFinanceConfig();
    const raw = (await fin.loadDayRaws("2026-11-10", "2026-11-10")).get("2026-11-10")!;
    expect(raw.expenses[fin.EVENT_COST_CATEGORY]).toBe(1_000_000);
    const figure = core.computeDayFigure(raw, config);
    const without = core.computeDayFigure({ ...raw, expenses: { ...raw.expenses, [fin.EVENT_COST_CATEGORY]: 0 } }, config);
    expect(figure.nonOperatingExpense - without.nonOperatingExpense).toBe(1_000_000);
    expect(without.netProfit - figure.netProfit).toBe(1_000_000);
    expect(figure.netSales).toBe(without.netSales);
  });

  it("batal: baris pembalik buku kas, laba rugi berkurang di tanggal batal, riwayat tetap", async () => {
    await expect(svc.voidExpensePayment(bankPaymentId, "", owner())).rejects.toMatchObject({ code: "REASON_REQUIRED" });
    await svc.voidExpensePayment(bankPaymentId, "Salah nominal", owner());
    await expect(svc.voidExpensePayment(bankPaymentId, "Salah nominal", owner())).rejects.toMatchObject({ code: "ALREADY_VOID" });
    const rows = (await t.getDb().select().from(t.schema.cashLedgerEntries)).filter((r: any) => r.sourceId === bankPaymentId);
    expect(rows.map((r: any) => r.sourceType).sort()).toEqual(["event_expense", "event_expense_void"]);
    const reversal = rows.find((r: any) => r.sourceType === "event_expense_void");
    expect(reversal).toMatchObject({ fromAccount: "external", toAccount: "bank_jago", amount: 600_000 });
    const fin = await import("@/lib/finance-control");
    expect((await fin.loadDayRaws("2026-11-10", "2026-11-10")).get("2026-11-10")!.expenses[fin.EVENT_COST_CATEGORY]).toBe(1_000_000);
    const voidDay = new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10);
    expect((await fin.loadDayRaws(voidDay, voidDay)).get(voidDay)!.expenses[fin.EVENT_COST_CATEGORY]).toBe(-600_000);
  });

  it("ringkasan event: anggaran vs realisasi, sponsor, untung/rugi", async () => {
    const sp = await import("@/lib/event-sponsor-service");
    const sponsor = await sp.createSponsor({ eventId, eventName: "x", name: "Kopi Sponsor", agreedAmount: 3_000_000 } as any, owner());
    await sp.recordSponsorPayment(sponsor.id, { amount: 2_000_000, receivedAt: "2026-11-10", reference: "JAGO-EVFIN-1", idempotencyKey: "evfin-sponsor-1" }, owner());
    const view = await svc.getEventFinance(owner(), eventId);
    expect(view.event.title).toBe("GIGS UANG");
    expect(view.budget.totals).toMatchObject({ planned: 3_000_000, paid: 400_000, remaining: 2_600_000 });
    expect(view.budget.rows.find((r: any) => r.id === lineId)).toMatchObject({ performerName: "Surai", paid: 400_000 });
    expect(view.sponsor).toMatchObject({ count: 1, agreed: 3_000_000, paid: 2_000_000, remaining: 1_000_000 });
    expect(view.menu).toMatchObject({ available: true, netSales: 0 });
    expect(view.profit).toMatchObject({ current: 1_600_000, projected: 0, status: "untung" });
    expect(view.payments.find((p: any) => p.id === bankPaymentId)).toMatchObject({ status: "void", voidReason: "Salah nominal" });
  });

  it("biaya bertanggal mundur (> 7 hari) menghapus snapshot otomatis hari itu → laba rugi ikut berubah", async () => {
    const fin = await import("@/lib/finance-control");
    const config = await fin.loadFinanceConfig();
    const today = new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10);
    const day = new Date(Date.parse(`${today}T00:00:00Z`) - 20 * 86_400_000).toISOString().slice(0, 10);
    const before = await fin.getDayFigures(day, day, config, today);
    const snapshots = (await t.getDb().select().from(t.schema.financialSnapshots)).filter((r: any) => String(r.date) === day);
    expect(snapshots).toHaveLength(1); // snapshot otomatis tersimpan
    const line = await svc.createBudgetLine({ eventId, category: "promosi", title: "Iklan mundur", plannedAmount: 300_000 }, owner());
    await svc.recordExpensePayment({ budgetLineId: line.id, amount: 300_000, paidAt: day, source: "external", payee: "Meta", idempotencyKey: "evfin-backdated-1" }, owner());
    const after = await fin.getDayFigures(day, day, config, today);
    const nonOp = (rows: any) => (Array.isArray(rows) ? rows[0] : rows.get?.(day) ?? rows[day])?.nonOperatingExpense ?? 0;
    expect(nonOp(after) - nonOp(before)).toBe(300_000);
  });

  it("pos diarsipkan tidak bisa dibayar lagi", async () => {
    await svc.updateBudgetLine(lineId, { status: "arsip" }, owner());
    await expect(
      svc.recordExpensePayment({ budgetLineId: lineId, amount: 1_000, paidAt: "2026-11-10", source: "external", payee: "X", idempotencyKey: "evfin-pay-arsip" }, owner()),
    ).rejects.toMatchObject({ code: "LINE_ARCHIVED" });
  });

  it("impor RAB platform GIGS: pos baru (rencana saja), cadangan dilewati, impor ulang tidak menimpa", async () => {
    // RAB asli GIGS AKHIR TAHUN 2026 (konfigurasi publik platform, 17 Nov 2026), dipetakan ke judul event uji.
    const config = {
      finance: {
        target: 21300000,
        budgetLines: [
          { code: "01", name: "Band", budget: 3200000, purpose: "Honor band lokal yang tampil (kontrak & bukti bayar).", pic: "Ace" },
          { code: "02", name: "Sound (LIGHTING + DRUM + STAGE)", budget: 10000000, purpose: "Sewa sound system dari vendor.", pic: "Rafly" },
          { code: "03", name: "Komsumsi", budget: 1000000, purpose: "Untuk para panitia dan talent", pic: "Rafly" },
          { code: "04", name: "Stand-up Comedy", budget: 1200000, purpose: "Honor komika lokal Tebing Tinggi.", pic: "Ace" },
          { code: "05", name: "Sewa Tempat", budget: 1200000, purpose: "Tempat stage dan sound", pic: "" },
          { code: "06", name: "Kembang Api", budget: 1000000, purpose: "Hanya dipakai setelah keputusan keselamatan & izin.", pic: "" },
          { code: "07", name: "Dokumentasi", budget: 1000000, purpose: "Foto & video acara.", pic: "Aress" },
          { code: "08", name: "Save Money", budget: 1500000, purpose: "Simpanan cadangan, bukan biaya. Dipakai hanya setelah disetujui.", pic: "" },
          { code: "09", name: "MC (2 orang)", budget: 1200000, purpose: "Honor total 2 MC (kontrak & cue sheet).", pic: "" },
          { code: "10", name: "", budget: 5000 },
          { code: "11", name: "Minus", budget: -1 },
        ],
      },
    };
    const calls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        calls.push(String(url));
        if (String(url).endsWith("/api/events")) return new Response(JSON.stringify({ events: [{ slug: "gigs-uang", name: "gigs uang" }] }), { status: 200 });
        return new Response(JSON.stringify(config), { status: 200 });
      }),
    );
    try {
      const before = (await svc.getEventFinance(owner(), eventId)).budget.rows.length;
      const ledgerBefore = await t.getDb().select().from(t.schema.cashLedgerEntries);
      const res = await svc.importPlatformBudget({ eventId }, owner());
      expect(calls.at(-1)).toMatch(/\/event\/gigs-uang\/api\/public\/config$/);
      expect(res.created.map((r: any) => r.title)).toEqual([
        "Band",
        "Sound (LIGHTING + DRUM + STAGE)",
        "Komsumsi",
        "Stand-up Comedy",
        "Sewa Tempat",
        "Kembang Api",
        "Dokumentasi",
        "MC (2 orang)",
      ]);
      expect(res.createdTotal).toBe(19_800_000);
      expect(res.reserve).toEqual([{ title: "Save Money", amount: 1_500_000 }]);
      const view = await svc.getEventFinance(owner(), eventId);
      expect(view.budget.rows.length).toBe(before + 8);
      const sound = view.budget.rows.find((r: any) => r.title === "Sound (LIGHTING + DRUM + STAGE)");
      expect(sound).toMatchObject({ category: "sound", plannedAmount: 10_000_000 });
      expect(view.budget.rows.find((r: any) => r.title === "MC (2 orang)")).toMatchObject({ category: "honor" });
      // Rencana saja: tidak ada baris buku kas baru.
      expect((await t.getDb().select().from(t.schema.cashLedgerEntries)).length).toBe(ledgerBefore.length);
      // Impor ulang: tidak dobel, tidak menimpa perubahan Owner.
      await svc.updateBudgetLine(sound.id, { plannedAmount: 9_000_000 }, owner());
      const again = await svc.importPlatformBudget({ eventId }, owner());
      expect(again.created).toEqual([]);
      expect(again.skipped).toHaveLength(8);
      expect((await svc.getEventFinance(owner(), eventId)).budget.rows.find((r: any) => r.id === sound.id).plannedAmount).toBe(9_000_000);
      await expect(svc.importPlatformBudget({ eventId }, session("Manajer" as Role))).rejects.toMatchObject({ code: "FORBIDDEN" });
    } finally {
      vi.unstubAllGlobals();
    }
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("fetch failed"); }));
    try {
      await expect(svc.importPlatformBudget({ eventId }, owner())).rejects.toMatchObject({ code: "PLATFORM_UNREACHABLE" });
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
