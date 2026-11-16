import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { Role } from "@/lib/garage-data";
import type { GarageSession } from "@/lib/server-auth";
import { seedGarageBasics, setupGarageTestDb, teardownGarageTestDb, type GarageTestDb } from "@/lib/test-helpers/garage-test-db";

// =============================================================================
// TEST INTEGRASI Sponsor Event (owner 16 Nov 2026): Owner saja, uang selalu ke
// Rekening Jago lewat buku kas, batal = baris pembalik, laba rugi "Pendapatan lain".
// =============================================================================

/* eslint-disable @typescript-eslint/no-explicit-any */
let t: GarageTestDb;
let sp: any;
let fin: any;
let core: any;
let outletId = "";
const OWNER = "user-itest-sponsor-owner";

function session(role: Role, extra: Record<string, unknown> = {}): GarageSession {
  return {
    user: { id: OWNER, name: `${role} Sponsor` },
    profile: {
      id: `sp-${OWNER}`,
      role,
      shiftLabel: "Pagi",
      deviceLabel: "SPONSOR",
      passwordResetRequired: false,
      outlet: { id: outletId, code: "TST", name: "Outlet Test", timezone: "Asia/Jakarta" },
      ...extra,
    },
  } as unknown as GarageSession;
}
const owner = () => session("Owner" as Role);

async function ledger(sourceTypes: string[]) {
  const { inArray } = await import("drizzle-orm");
  return t.getDb().select().from(t.schema.cashLedgerEntries).where(inArray(t.schema.cashLedgerEntries.sourceType, sourceTypes));
}

beforeAll(async () => {
  t = await setupGarageTestDb();
  outletId = (await seedGarageBasics(t, { userId: OWNER })).outletId;
  await t.getDb().insert(t.schema.staffProfiles).values({ userId: OWNER, role: "Owner", outletId, shiftLabel: "Pagi", deviceLabel: "Laptop Owner" } as any);
  sp = await import("@/lib/event-sponsor-service");
  fin = await import("@/lib/finance-control");
  core = await import("@/lib/finance-control-core");
}, 60_000);

afterAll(async () => {
  await teardownGarageTestDb(t);
});

const base = { eventName: "GIGS AKHIR TAHUN 2026", name: "Kopi Nusantara", packageName: "Gold", agreedAmount: 5_000_000, contactPhone: "+62 812 3456 7890" };

describe("Sponsor Event — akses", () => {
  it("hanya Owner yang login langsung (Manajer dan API key agent ditolak)", async () => {
    await expect(sp.listSponsors(session("Manajer" as Role))).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(sp.createSponsor(base, session("Owner" as Role, { agentKey: { id: "k", label: "AI", scope: "owner" } }))).rejects.toMatchObject({ code: "HUMAN_SESSION_REQUIRED" });
  });
});

describe("Sponsor Event — uang masuk Rekening Jago", () => {
  let sponsorId = "";

  it("membuat sponsor bernomor, kontak dinormalkan", async () => {
    const view = await sp.createSponsor(base, owner());
    sponsorId = view.id;
    expect(view.sponsorNo).toMatch(/^SPN-\d{4}-001$/);
    expect(view.contactPhone).toBe("081234567890");
    expect(view.money).toMatchObject({ agreed: 5_000_000, paid: 0, remaining: 5_000_000 });
  });

  it("jadwal cicilan tidak boleh melebihi nilai kesepakatan", async () => {
    await expect(
      sp.setInstallments(sponsorId, { installments: [{ label: "DP", amount: 6_000_000, dueDate: "2026-11-10" }] }, owner()),
    ).rejects.toMatchObject({ code: "INVALID_SCHEDULE" });
    const view = await sp.setInstallments(
      sponsorId,
      { installments: [{ label: "DP", amount: 2_000_000, dueDate: "2026-11-10" }, { label: "Pelunasan", amount: 3_000_000, dueDate: "2026-12-01" }] },
      owner(),
    );
    expect(view.installments.map((i: any) => i.label)).toEqual(["DP", "Pelunasan"]);
  });

  it("pembayaran = satu baris buku kas external → bank_jago; idempoten; referensi tidak boleh dobel", async () => {
    const input = { amount: 2_000_000, receivedAt: "2026-11-09", reference: "JAGO-TRX-001", idempotencyKey: "sponsor-pay-0001" };
    const first = await sp.recordSponsorPayment(sponsorId, input, owner());
    expect(first.replay).toBe(false);
    expect(first.sponsor.money).toMatchObject({ paid: 2_000_000, remaining: 3_000_000 });
    expect(first.sponsor.installments[0]).toMatchObject({ label: "DP", state: "lunas" });

    const again = await sp.recordSponsorPayment(sponsorId, input, owner());
    expect(again.replay).toBe(true);
    await expect(sp.recordSponsorPayment(sponsorId, { ...input, idempotencyKey: "sponsor-pay-0002" }, owner())).rejects.toMatchObject({ code: "DUPLICATE_REFERENCE" });

    const rows = await ledger(["sponsor_income"]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ fromAccount: "external", toAccount: "bank_jago", amount: 2_000_000, businessDate: "2026-11-09" });
    expect(rows[0].sourceRef).toContain("Ref JAGO-TRX-001");
  });

  it("tanggal masa depan ditolak", async () => {
    await expect(
      sp.recordSponsorPayment(sponsorId, { amount: 1_000, receivedAt: "2099-01-01", reference: "JAGO-FUTURE", idempotencyKey: "sponsor-pay-future" }, owner()),
    ).rejects.toMatchObject({ code: "FUTURE_DATE" });
  });

  it("laba rugi: pendapatan lain menambah net profit, bukan omzet; batal = pembalik di tanggal batal", async () => {
    const config = await fin.loadFinanceConfig();
    const raws = await fin.loadDayRaws("2026-11-09", "2026-11-09");
    const raw = raws.get("2026-11-09") ?? { ...fin.emptyRaw("2026-11-09") };
    expect(raw.otherIncome).toBe(2_000_000);
    const figure = core.computeDayFigure(raw, config);
    const withoutSponsor = core.computeDayFigure({ ...raw, otherIncome: 0 }, config);
    expect(figure.otherIncome).toBe(2_000_000);
    expect(figure.netProfit - withoutSponsor.netProfit).toBe(2_000_000);
    expect(figure.netSales).toBe(withoutSponsor.netSales);
    expect(figure.channels.Sponsor).toBe(2_000_000);

    const view = await sp.getSponsor(sponsorId, owner());
    const paymentId = view.payments[0].id;
    await expect(sp.voidSponsorPayment(paymentId, "", owner())).rejects.toMatchObject({ code: "REASON_REQUIRED" });
    const after = await sp.voidSponsorPayment(paymentId, "Salah sponsor, transfer milik event lain", owner());
    expect(after.money).toMatchObject({ paid: 0, remaining: 5_000_000 });
    expect(after.payments[0]).toMatchObject({ status: "void" });
    await expect(sp.voidSponsorPayment(paymentId, "lagi dong", owner())).rejects.toMatchObject({ code: "ALREADY_VOID" });

    const posted = await ledger(["sponsor_income"]);
    const reversal = await ledger(["sponsor_income_void"]);
    expect(reversal).toHaveLength(1);
    expect(reversal[0]).toMatchObject({ fromAccount: "bank_jago", toAccount: "external", amount: 2_000_000, reversesId: posted[0].id });
    // Hari asal tidak berubah (riwayat tetap); pembatalan mengurangi pada hari pembatalan.
    const original = await fin.loadDayRaws("2026-11-09", "2026-11-09");
    expect(original.get("2026-11-09")?.otherIncome).toBe(2_000_000);
    const voidDay = reversal[0].businessDate;
    const onVoid = await fin.loadDayRaws(voidDay, voidDay);
    expect(onVoid.get(voidDay)?.otherIncome).toBe(-2_000_000);

    // Referensi yang sudah dibatalkan boleh dicatat ulang (mis. dipindah ke sponsor yang benar).
    const redo = await sp.recordSponsorPayment(sponsorId, { amount: 2_000_000, receivedAt: "2026-11-09", reference: "JAGO-TRX-001", idempotencyKey: "sponsor-pay-0003" }, owner());
    expect(redo.sponsor.money.paid).toBe(2_000_000);
  });

  it("nilai kesepakatan tidak bisa diturunkan di bawah jadwal cicilan", async () => {
    await expect(sp.updateSponsor(sponsorId, { agreedAmount: 4_000_000 }, owner())).rejects.toMatchObject({ code: "SCHEDULE_EXCEEDS" });
    const view = await sp.updateSponsor(sponsorId, { agreedAmount: 6_000_000, packageName: "Platinum" }, owner());
    expect(view).toMatchObject({ packageName: "Platinum", unscheduled: 1_000_000 });
  });

  it("kewajiban + sponsor barang (barang tidak masuk buku kas)", async () => {
    let view = await sp.addObligation(sponsorId, { title: "Logo di poster utama", dueDate: "2026-11-20" }, owner());
    const obligationId = view.obligations[0].id;
    view = await sp.updateObligation(obligationId, { done: true, doneNote: "Poster cetak 12 Nov" }, owner());
    expect(view.obligations[0]).toMatchObject({ state: "selesai", doneNote: "Poster cetak 12 Nov" });
    await expect(sp.updateObligation(obligationId, { archive: true }, owner())).rejects.toMatchObject({ code: "DONE_KEPT" });

    const before = (await ledger(["sponsor_income", "sponsor_income_void"])).length;
    view = await sp.addInkind(sponsorId, { item: "Kopi bubuk 1 kg", qty: 10, unit: "pak", estimatedValue: 1_500_000 }, owner());
    expect(view.health).toMatchObject({ inkindValue: 1_500_000, totalSupport: 7_500_000 });
    expect((await ledger(["sponsor_income", "sponsor_income_void"])).length).toBe(before);
    view = await sp.archiveInkind(view.inkind[0].id, "salah input", owner());
    expect(view.inkind).toHaveLength(0);
  });

  it("batal wajib alasan; uang yang sudah masuk tetap terhitung di total", async () => {
    await expect(sp.setSponsorStatus(sponsorId, "batal", null, owner())).rejects.toMatchObject({ code: "REASON_REQUIRED" });
    const view = await sp.setSponsorStatus(sponsorId, "batal", "Sponsor mundur, DP tidak dikembalikan", owner());
    expect(view).toMatchObject({ status: "batal", cancelReason: "Sponsor mundur, DP tidak dikembalikan" });
    const list = await sp.listSponsors(owner());
    expect(list.totals).toMatchObject({ sponsors: 0, paid: 2_000_000, remaining: 0 });
    await expect(sp.recordSponsorPayment(sponsorId, { amount: 1_000, receivedAt: "2026-11-09", reference: "JAGO-AFTER", idempotencyKey: "sponsor-pay-after" }, owner())).rejects.toMatchObject({ code: "CANCELLED" });
  });
});

describe("Sponsor Event — tanggal hari ini", () => {
  it("tanggal hari ini sebelum jam 12.00 WIB tidak dianggap masa depan", async () => {
    const view = await sp.createSponsor({ ...base, name: "Pagi Hari", contactPhone: null }, owner());
    const now = new Date("2026-11-16T01:30:00Z"); // 08.30 WIB
    const res = await sp.recordSponsorPayment(view.id, { amount: 100_000, receivedAt: "2026-11-16", reference: "JAGO-PAGI-01", idempotencyKey: "sponsor-pay-pagi" }, owner(), now);
    expect(res.sponsor.money.paid).toBe(100_000);
    const rows = await ledger(["sponsor_income"]);
    expect(rows.find((r: any) => r.sourceRef?.includes("JAGO-PAGI-01"))?.businessDate).toBe("2026-11-16");
  });
});

describe("Sponsor Event — pengingat", () => {
  it("cicilan terlambat → notifikasi ke Owner, sekali per kunci", async () => {
    const view = await sp.createSponsor({ ...base, name: "Bengkel Jaya", contactPhone: null }, owner());
    await sp.setInstallments(view.id, { installments: [{ label: "DP", amount: 1_000_000, dueDate: "2026-11-15" }] }, owner());
    const now = new Date("2026-11-16T05:00:00Z");
    const first = await sp.sweepSponsorReminders(now);
    expect(first.sent).toBeGreaterThanOrEqual(1);
    const again = await sp.sweepSponsorReminders(now);
    expect(again.sent).toBe(0);
    const { eq } = await import("drizzle-orm");
    const rows = await t.getDb().select().from(t.schema.staffNotifications).where(eq(t.schema.staffNotifications.kind, "sponsor_reminder"));
    expect(rows.some((r: any) => /Bengkel Jaya/.test(r.body ?? "") && r.userId === OWNER && r.url === "/control/sponsors")).toBe(true);
  });
});
