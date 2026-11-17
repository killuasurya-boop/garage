import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { Role } from "@/lib/garage-data";
import type { GarageSession } from "@/lib/server-auth";
import { seedGarageBasics, setupGarageTestDb, teardownGarageTestDb, type GarageTestDb } from "@/lib/test-helpers/garage-test-db";

// GIGS EO Fase 1 (Owner 17 Nov 2026): satu master event untuk Sponsor, Lineup, Panitia, Tugas, dan beranda GIGS.

/* eslint-disable @typescript-eslint/no-explicit-any */
let t: GarageTestDb;
let outletId = "";
let eventId = "";
const OWNER = "user-itest-master-owner";
const TITLE = "GIGS AKHIR TAHUN 2026";

function owner(): GarageSession {
  return {
    user: { id: OWNER, name: "Owner Master" },
    profile: { id: `pm-${OWNER}`, role: "Owner" as Role, shiftLabel: "Pagi", deviceLabel: "MASTER", passwordResetRequired: false, outlet: { id: outletId, code: "TST", name: "Outlet Test", timezone: "Asia/Jakarta" } },
  } as unknown as GarageSession;
}

beforeAll(async () => {
  t = await setupGarageTestDb();
  outletId = (await seedGarageBasics(t, { userId: OWNER })).outletId;
  const [row] = await t
    .getDb()
    .insert(t.schema.events)
    .values({
      slug: "gigs-akhir-tahun-2026",
      title: TITLE,
      outletId,
      startsAt: new Date("2026-12-20T12:00:00Z"),
      endsAt: new Date("2026-12-20T17:00:00Z"),
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

describe("Master event", () => {
  it("lineup & panitia memakai eventId; nama ikut judul master; nama sama tanpa eventId ikut ditautkan", async () => {
    const lineup = await import("@/lib/event-lineup-service");
    const p = await lineup.createPerformer({ eventId, eventName: "salah ketik", name: "Surai", kind: "band", status: "konfirmasi", setStart: "20:00", setMinutes: 30 }, owner());
    expect(p).toMatchObject({ eventId, eventName: TITLE });
    const crew = await lineup.createCrew({ eventName: "gigs akhir tahun 2026", name: "Raka", role: "ketua" }, owner());
    expect(crew).toMatchObject({ eventId, eventName: TITLE });
    const task = await lineup.createTask({ eventId, title: "Sewa genset", crewId: crew.id }, owner());
    expect(task.eventId).toBe(eventId);
    const legacy = await lineup.createCrew({ eventName: "Acara Lama Tanpa Master", name: "Dina", role: "stage" }, owner());
    expect(legacy).toMatchObject({ eventId: null, eventName: "Acara Lama Tanpa Master" });
    await expect(lineup.createPerformer({ eventId: "00000000-0000-0000-0000-000000000000", name: "X", kind: "band" }, owner())).rejects.toMatchObject({ code: "EVENT_NOT_FOUND" });
    await expect(lineup.createPerformer({ name: "Tanpa Event", kind: "band" }, owner())).rejects.toMatchObject({ code: "EVENT_REQUIRED" });

    const board = await lineup.getLineupBoard(owner(), TITLE);
    expect(board.eventId).toBe(eventId);
    expect(board.masterEvents.map((e: any) => e.title)).toContain(TITLE);
    expect(board.legacyEvents).toContain("Acara Lama Tanpa Master");
    expect(board.legacyEvents).not.toContain(TITLE);
  });

  it("sponsor memilih master event", async () => {
    const sponsor = await import("@/lib/event-sponsor-service");
    const view = await sponsor.createSponsor({ eventId, eventName: "apa saja", name: "Kopi Sponsor", agreedAmount: 1_000_000 } as any, owner());
    expect(view).toMatchObject({ eventId, eventName: TITLE });
    const list = await sponsor.listSponsors(owner());
    expect(list.masterEvents.map((e: any) => e.id)).toContain(eventId);
  });

  it("ubah judul master → sponsor, lineup, panitia, tugas ikut berganti nama", async () => {
    const svc = await import("@/lib/event-service");
    const event = await svc.getEventForAdmin(eventId);
    const NEW = "GIGS AKHIR TAHUN 2026 — VOL. 2";
    await svc.updateEvent(
      eventId,
      svc.eventUpdateSchema.parse({
        title: NEW,
        startsAt: event!.startsAt,
        endsAt: event!.endsAt,
        venueName: event!.venueName,
        address: event!.address,
        mapsUrl: event!.mapsUrl,
        contactWhatsapp: "081200000000",
        highlights: [],
        faq: [],
        gallery: [],
        featuredOnHome: false,
        defaultMaxPax: 2,
        platformSlug: "gigs-akhir-tahun",
      }),
      OWNER,
    );
    const db = t.getDb();
    for (const table of [t.schema.eventSponsors, t.schema.eventPerformers, t.schema.eventCrew, t.schema.eventCrewTasks]) {
      const rows = (await db.select().from(table)).filter((r: any) => r.eventId === eventId);
      expect(rows.length).toBeGreaterThan(0);
      expect(rows.every((r: any) => r.eventName === NEW)).toBe(true);
    }
    // Baris tanpa master tidak tersentuh.
    expect((await db.select().from(t.schema.eventCrew)).some((r: any) => r.eventName === "Acara Lama Tanpa Master")).toBe(true);
    expect((await svc.getEventForAdmin(eventId))!.platformSlug).toBe("gigs-akhir-tahun");
  });

  it("beranda: slug platform menemukan lineup walau nama di platform berbeda", async () => {
    const lineup = await import("@/lib/event-lineup-service");
    const items = await lineup.publicLineupFor({ slug: "gigs-akhir-tahun", name: "GIGS Akhir Tahun (nama platform beda)" });
    expect(items).toEqual([{ name: "Surai", kind: "band", time: "20.00–20.30" }]);
    expect(await lineup.publicLineupFor({ slug: "slug-lain", name: "Tidak Ada" })).toEqual([]);
  });

  it("slug platform tidak boleh dobel", async () => {
    const svc = await import("@/lib/event-service");
    const [other] = await t
      .getDb()
      .insert(t.schema.events)
      .values({
        slug: "event-lain",
        title: "Event Lain",
        outletId,
        startsAt: new Date("2026-12-27T12:00:00Z"),
        endsAt: new Date("2026-12-27T17:00:00Z"),
        venueName: "Garage Coffee",
        address: "Jl. Contoh No. 1, Tebing Tinggi",
        mapsUrl: "https://maps.app.goo.gl/contoh",
        contactWhatsapp: "6281200000000",
      } as any)
      .returning();
    const event = await svc.getEventForAdmin(other.id);
    await expect(
      svc.updateEvent(
        other.id,
        svc.eventUpdateSchema.parse({
          title: event!.title,
          startsAt: event!.startsAt,
          endsAt: event!.endsAt,
          venueName: event!.venueName,
          address: event!.address,
          mapsUrl: event!.mapsUrl,
          contactWhatsapp: "081200000000",
          highlights: [],
          faq: [],
          gallery: [],
          featuredOnHome: false,
          defaultMaxPax: 2,
          platformSlug: "gigs-akhir-tahun",
        }),
        OWNER,
      ),
    ).rejects.toMatchObject({ code: "PLATFORM_SLUG_TAKEN" });
  });

  it("/api/website-events hanya event terbit asli, tanpa data contoh", async () => {
    const route = await import("@/app/api/website-events/route");
    const res = await route.GET();
    const json = await res.json();
    expect(json.source).toBe("db");
    const titles = json.events.map((e: any) => e.title);
    expect(titles).not.toContain("Creative Supper Club");
    expect(titles).not.toContain("Event Lain"); // draft
    for (const e of json.events) expect(Object.keys(e).sort()).toEqual(["endsAt", "slug", "startsAt", "tagline", "title", "venueName"]);
  });
});
