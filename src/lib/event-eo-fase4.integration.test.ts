import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { Role } from "@/lib/garage-data";
import type { GarageSession } from "@/lib/server-auth";
import { seedGarageBasics, setupGarageTestDb, teardownGarageTestDb, type GarageTestDb } from "@/lib/test-helpers/garage-test-db";

// GIGS EO Fase 4 (Owner 17 Nov 2026): data penampil & honor, checklist operasional, sponsor ↔ slot, pengingat jadwal,
// evaluasi pasca-event.

/* eslint-disable @typescript-eslint/no-explicit-any */
let t: GarageTestDb;
let outletId = "";
let eventId = "";
let surai = "";
let lineup: any;
let fin: any;
const OWNER = "user-itest-eo4-owner";
const TITLE = "GIGS FASE EMPAT";

function session(role: Role): GarageSession {
  return {
    user: { id: OWNER, name: `${role} EO4` },
    profile: { id: `e4-${OWNER}`, role, shiftLabel: "Pagi", deviceLabel: "EO4", passwordResetRequired: false, outlet: { id: outletId, code: "TST", name: "Outlet Test", timezone: "Asia/Jakarta" } },
  } as unknown as GarageSession;
}
const owner = () => session("Owner" as Role);
const manajer = () => session("Manajer" as Role);

beforeAll(async () => {
  t = await setupGarageTestDb();
  outletId = (await seedGarageBasics(t, { userId: OWNER })).outletId;
  await t.getDb().insert(t.schema.staffProfiles).values({ userId: OWNER, role: "Owner", outletId, shiftLabel: "Pagi", deviceLabel: "Laptop" } as any).onConflictDoNothing();
  const [row] = await t
    .getDb()
    .insert(t.schema.events)
    .values({
      slug: "gigs-fase-empat",
      title: TITLE,
      outletId,
      startsAt: new Date("2026-12-20T12:00:00Z"),
      endsAt: new Date("2026-12-20T18:00:00Z"),
      venueName: "Garage Coffee",
      address: "Jl. Contoh No. 1, Tebing Tinggi",
      mapsUrl: "https://maps.app.goo.gl/contoh",
      contactWhatsapp: "6281200000000",
      status: "published",
    } as any)
    .returning();
  eventId = row.id;
}, 60_000);

afterAll(async () => {
  await teardownGarageTestDb(t);
});

describe("Fase 4", () => {
  it("#10 penampil: hospitality, kontrak https, honor lunas di papan (Owner saja)", async () => {
    lineup ??= await import("@/lib/event-lineup-service");
    expect(lineup.performerInputSchema.safeParse({ eventId, name: "X", kind: "band", contractUrl: "http://tidak-aman" }).success).toBe(false);
    const p = await lineup.createPerformer({ eventId, name: "Surai", kind: "band", status: "konfirmasi", contactPhone: "081211112222", hospitality: "6 air mineral", contractUrl: "https://drive.google.com/x" }, owner());
    surai = p.id;
    expect(p).toMatchObject({ hospitality: "6 air mineral", contractUrl: "https://drive.google.com/x" });
    fin ??= await import("@/lib/event-finance-service");
    const line = await fin.createBudgetLine({ eventId, category: "honor", title: "Honor Surai", plannedAmount: 1_000_000, performerId: surai }, owner());
    await fin.recordExpensePayment({ budgetLineId: line.id, amount: 1_000_000, paidAt: "2026-11-10", source: "external", payee: "Surai", idempotencyKey: "eo4-honor-0001" }, owner());
    const board = await lineup.getLineupBoard(owner(), TITLE);
    expect(board.honor[surai]).toEqual({ planned: 1_000_000, paid: 1_000_000 });
    expect((await lineup.getLineupBoard(manajer(), TITLE)).honor).toEqual({});
  });

  it("#14 pengingat jadwal H-1 sampai ditandai terkirim", async () => {
    lineup ??= await import("@/lib/event-lineup-service");
    const h1 = new Date("2026-12-19T03:00:00Z");
    await lineup.sweepLineupTaskReminders(h1);
    const notes = (await t.getDb().select().from(t.schema.staffNotifications)).filter((r: any) => r.dedupKey?.startsWith(`lineup-schedule:${eventId}:h-1`));
    expect(notes).toHaveLength(1);
    expect(notes[0].title).toContain("1 penampil belum dikirimi jadwal");
    await lineup.updatePerformer(surai, { scheduleSent: true }, owner());
    const after = await lineup.getLineupBoard(owner(), TITLE);
    expect(after.performers[0].scheduleSentAt).toBeTruthy();
    await lineup.sweepLineupTaskReminders(new Date("2026-12-20T03:00:00Z"));
    const hariH = (await t.getDb().select().from(t.schema.staffNotifications)).filter((r: any) => r.dedupKey?.startsWith(`lineup-schedule:${eventId}:hari-h`));
    expect(hariH).toHaveLength(0);
  });

  it("#11 kesiapan: checklist keselamatan yang belum pernah dibuka dihitung 0/10, bukan dilewati", async () => {
    lineup ??= await import("@/lib/event-lineup-service");
    const board = await lineup.getLineupBoard(owner(), { eventId });
    expect(board.readiness.items.find((i: any) => i.key === "operasional")).toMatchObject({ done: false, detail: "0/10 selesai" });
  });

  it("#11 checklist operasional: bawaan dibuat sekali, Manajer centang, masuk kesiapan; tambah item hanya Owner", async () => {
    const day = await import("@/lib/event-day-service");
    const first = await day.getOpsChecklist(eventId, manajer());
    expect(first.total).toBe(10);
    expect((await day.getOpsChecklist(eventId, owner())).total).toBe(10);
    await day.updateOpsCheck(first.items[0].id, { done: true, pic: "Raka" }, manajer());
    await expect(day.addOpsCheck({ eventId, label: "Cek APAR tambahan" }, manajer())).rejects.toMatchObject({ code: "FORBIDDEN" });
    await day.addOpsCheck({ eventId, label: "Cek APAR tambahan" }, owner());
    lineup ??= await import("@/lib/event-lineup-service");
    const board = await lineup.getLineupBoard(owner(), TITLE);
    expect(board.readiness.items.find((i: any) => i.key === "operasional")).toMatchObject({ done: false, detail: "1/11 selesai" });
  });

  it("#13 kewajiban sponsor ditempel ke slot penampil event yang sama", async () => {
    const sp = await import("@/lib/event-sponsor-service");
    const sponsor = await sp.createSponsor({ eventId, eventName: TITLE, name: "Kopi Sponsor", agreedAmount: 1_000_000 } as any, owner());
    lineup ??= await import("@/lib/event-lineup-service");
    const other = await lineup.createPerformer({ eventName: "Event Tanpa Master", name: "Band Lain", kind: "band" }, owner());
    await expect(sp.addObligation(sponsor.id, { title: "Disebut MC", slotPerformerId: other.id }, owner())).rejects.toMatchObject({ code: "SLOT_OTHER_EVENT" });
    const view = await sp.addObligation(sponsor.id, { title: "Disebut MC sebelum Surai", slotPerformerId: surai }, owner());
    expect(view.obligations[0].slotPerformerId).toBe(surai);
    const board = await lineup.getLineupBoard(owner(), TITLE);
    expect(board.sponsorNotes[surai]).toEqual([{ sponsor: "Kopi Sponsor", title: "Disebut MC sebelum Surai", done: false }]);
  });

  it("#15 evaluasi pasca-event + banding antar event", async () => {
    fin ??= await import("@/lib/event-finance-service");
    await expect(fin.saveEventReview({ eventId, rating: 9 } as any, owner())).rejects.toBeTruthy();
    expect(fin.eventReviewSchema.safeParse({ eventId, rating: 9 }).success).toBe(false);
    await fin.saveEventReview({ eventId, rating: 4, highlights: "Penonton ramai", issues: "Sound telat 20 menit" }, owner());
    await fin.saveEventReview({ eventId, rating: 5, highlights: "Penonton ramai" }, owner());
    const view = await fin.getEventFinance(owner(), eventId);
    expect(view.review).toMatchObject({ rating: 5, highlights: "Penonton ramai", issues: null });
    const current = view.comparison.find((c: any) => c.current);
    expect(current).toMatchObject({ title: TITLE, costPaid: 1_000_000, rating: 5 });
  });
});
