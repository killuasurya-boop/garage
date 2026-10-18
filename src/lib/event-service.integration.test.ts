import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { setupGarageTestDb, teardownGarageTestDb, type GarageTestDb } from "@/lib/test-helpers/garage-test-db";

// =============================================================================
// Event Grand Opening: satu sumber data (migrasi 0136), status publikasi,
// validasi konten, dan klasifikasi reset grand opening.
// =============================================================================

let t: GarageTestDb;
let userId = "";

beforeAll(async () => {
  t = await setupGarageTestDb();
  userId = "u-event";
  await t.getDb().insert(t.schema.user).values({ id: userId, name: "Owner Event", email: "owner-event@garage.id" } as never);
}, 60_000);

afterAll(async () => {
  await teardownGarageTestDb(t);
});

describe("event Grand Opening", () => {
  it("migrasi membuat event draft dengan fakta PRD; draft tidak tampil di publik", async () => {
    const svc = await import("@/lib/event-service");
    const [event] = await svc.listEventsForAdmin();
    expect(event).toMatchObject({
      slug: "grand-opening",
      title: "Grand Opening Garage Coffee",
      status: "draft",
      startsAt: "2026-10-24T08:00:00.000Z",
      endsAt: "2026-10-24T16:00:00.000Z",
      mapsUrl: "https://maps.app.goo.gl/vRtbhd7KdMhqm9Kw9?g_st=ac",
      contactWhatsapp: "6285121552341",
      highlights: ["Live Music", "Diskoyoks"],
      defaultMaxPax: 2,
    });
    expect(event.address).toContain("Jl. Mayjen Sutoyo");
    expect(await svc.getPublishedEvent("grand-opening")).toBeNull();
    expect(await svc.getHomeFeaturedEvent(new Date("2026-10-20T00:00:00Z"))).toBeNull();
  });

  it("terbit → homepage & landing membaca data yang sama; selesai acara banner hilang", async () => {
    const svc = await import("@/lib/event-service");
    const [event] = await svc.listEventsForAdmin();
    await svc.setEventStatus(event.id, "published", userId);
    const published = await svc.getPublishedEvent("grand-opening");
    const home = await svc.getHomeFeaturedEvent(new Date("2026-10-20T00:00:00Z"));
    expect(home).toEqual(published);
    expect(await svc.getHomeFeaturedEvent(new Date("2026-10-24T16:00:01Z"))).toBeNull();
  });

  it("ubah fakta acara menaikkan versi konten; validasi menolak data salah", async () => {
    const svc = await import("@/lib/event-service");
    const [event] = await svc.listEventsForAdmin();
    const base = {
      title: event.title,
      tagline: null,
      startsAt: event.startsAt,
      endsAt: event.endsAt,
      venueName: event.venueName,
      address: event.address,
      mapsUrl: event.mapsUrl,
      contactWhatsapp: "085121552341",
      highlights: event.highlights,
      about: null,
      faq: [],
      gallery: [],
      featuredOnHome: true,
      rsvpDeadline: event.rsvpDeadline,
      defaultMaxPax: 2,
    };
    const same = await svc.updateEvent(event.id, svc.eventUpdateSchema.parse(base), userId);
    expect(same.changedFacts).toEqual([]);
    expect(same.event.contentVersion).toBe(event.contentVersion);

    const changed = await svc.updateEvent(
      event.id,
      svc.eventUpdateSchema.parse({ ...base, endsAt: "2026-10-24T16:30:00.000Z" }),
      userId,
    );
    expect(changed.changedFacts).toEqual(["endsAt"]);
    expect(changed.event.contentVersion).toBe(event.contentVersion + 1);

    expect(svc.eventUpdateSchema.safeParse({ ...base, endsAt: base.startsAt }).success).toBe(false);
    expect(svc.eventUpdateSchema.safeParse({ ...base, mapsUrl: "javascript:alert(1)" }).success).toBe(false);
    expect(svc.eventUpdateSchema.safeParse({ ...base, contactWhatsapp: "12345" }).success).toBe(false);
    expect(
      svc.eventUpdateSchema.safeParse({ ...base, gallery: [{ src: "//evil.example/x.png", alt: "x foto" }] }).success,
    ).toBe(false);
  });

  it("izin: hanya Owner/Manajer kelola event; ekspor Owner saja", async () => {
    const { canUseApiAs, rolePermissions } = await import("@/lib/role-access");
    expect(rolePermissions.Owner).toEqual(expect.arrayContaining(["events:manage", "events:export"]));
    expect(rolePermissions.Manajer).toContain("events:manage");
    expect(rolePermissions.Manajer).not.toContain("events:export");
    for (const role of ["Kasir", "Waiter"] as const) {
      expect(canUseApiAs({ role } as never, "events:manage")).toBe(false);
    }
  });
});
