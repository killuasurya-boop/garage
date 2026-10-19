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
  it("migrasi membuat event dengan fakta PRD; 0138 menerbitkannya; 0139 mengisi FAQ; draft tidak tampil di publik", async () => {
    const svc = await import("@/lib/event-service");
    const [event] = await svc.listEventsForAdmin();
    expect(event).toMatchObject({
      slug: "grand-opening",
      title: "Grand Opening Garage Coffee",
      status: "published",
      featuredOnHome: true,
      startsAt: "2026-10-24T08:00:00.000Z",
      endsAt: "2026-10-24T16:00:00.000Z",
      mapsUrl: "https://maps.app.goo.gl/vRtbhd7KdMhqm9Kw9?g_st=ac",
      contactWhatsapp: "6285121552341",
      highlights: ["Live Music", "Diskoyoks"],
      defaultMaxPax: 2,
      agenda: [
        { start: "15:00", end: "18:00", title: "Live Music" },
        { start: "20:00", end: "23:00", title: "Diskoyoks" },
      ],
      promoText: "Diskon 20% Menu Bundling",
      sponsorName: "BLACK",
      ageGate: true,
    });
    expect(event.address).toContain("Jl. Mayjen Sutoyo");
    // 0139: FAQ info penting (umum 21+, smart casual).
    expect(event.faq.map((item) => item.q)).toContain("Dress code?");
    expect(event.faq.find((item) => item.q === "Dress code?")?.a).toBe("Smart casual.");
    expect(await svc.getPublishedEvent("grand-opening")).not.toBeNull();
    await svc.setEventStatus(event.id, "draft", userId);
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
    // Field konten poster tidak dikirim → nilai lama tetap.
    expect(changed.event.agenda).toHaveLength(2);
    expect(changed.event.ageGate).toBe(true);

    const poster = await svc.updateEvent(
      event.id,
      svc.eventUpdateSchema.parse({
        ...base,
        endsAt: "2026-10-24T16:30:00.000Z",
        agenda: [
          { start: "20:00", end: "23:00", title: "Diskoyoks" },
          { start: "15:00", end: "18:00", title: "Live Music" },
        ],
        promoText: "",
        sponsorName: null,
        ageGate: false,
      }),
      userId,
    );
    expect(poster.event.agenda.map((item) => item.title)).toEqual(["Live Music", "Diskoyoks"]);
    expect(poster.event).toMatchObject({ promoText: null, sponsorName: null, ageGate: false });
    expect(poster.changedFacts).toEqual([]);
    expect(
      svc.eventUpdateSchema.safeParse({ ...base, agenda: [{ start: "3 sore", end: "18:00", title: "Live Music" }] }).success,
    ).toBe(false);
    // Jam selesai sebelum mulai & nama sesi dobel ditolak.
    expect(svc.eventUpdateSchema.safeParse({ ...base, agenda: [{ start: "18:00", end: "15:00", title: "Live Music" }] }).success).toBe(false);
    expect(
      svc.eventUpdateSchema.safeParse({
        ...base,
        agenda: [
          { start: "15:00", end: "16:00", title: "Live Music" },
          { start: "16:00", end: "17:00", title: "live music" },
        ],
      }).success,
    ).toBe(false);
    // Sesi di luar jam acara (15.00–23.30 WIB) ditolak saat simpan.
    await expect(
      svc.updateEvent(
        event.id,
        svc.eventUpdateSchema.parse({ ...base, endsAt: "2026-10-24T16:30:00.000Z", agenda: [{ start: "13:00", end: "14:00", title: "Soundcheck" }] }),
        userId,
      ),
    ).rejects.toMatchObject({ code: "AGENDA_OUTSIDE_EVENT" });

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
