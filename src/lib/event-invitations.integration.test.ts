import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { setupGarageTestDb, teardownGarageTestDb, type GarageTestDb } from "@/lib/test-helpers/garage-test-db";

// =============================================================================
// Undangan digital Grand Opening (tahap 2): tamu, impor dry-run, token, bagikan
// manual, cabut/buat ulang, RSVP + batas waktu, rekap, ekspor aman.
// =============================================================================

/* eslint-disable @typescript-eslint/no-explicit-any */
let t: GarageTestDb;
let eventId = "";
const actor = { userId: "u-inv", name: "Manajer Uji / Manajer" };
const BEFORE = new Date("2026-10-20T03:00:00Z");
const AFTER_DEADLINE = new Date("2026-10-24T08:00:01Z");

beforeAll(async () => {
  process.env.BETTER_AUTH_SECRET = "test-secret-0123456789abcdef";
  process.env.GARAGE_PUBLIC_BASE_URL = "https://garagecoffee.id";
  t = await setupGarageTestDb();
  await t.getDb().insert(t.schema.user).values({ id: actor.userId, name: "Manajer Uji", email: "inv@garage.id" } as any);
  const svc = await import("@/lib/event-service");
  const [event] = await svc.listEventsForAdmin();
  eventId = event.id;
}, 60_000);

afterAll(async () => {
  await teardownGarageTestDb(t);
});

function tokenFromUrl(url: string) {
  return url.split("/undangan/")[1];
}

describe("tamu & impor", () => {
  it("tambah manual; nomor ganda ditolak", async () => {
    const inv = await import("@/lib/event-invitations");
    await inv.createGuest(eventId, { fullName: "Budi Santoso", phone: "0812 3456 7890" }, actor);
    await expect(inv.createGuest(eventId, { fullName: "Budi Lain", phone: "+6281234567890" }, actor)).rejects.toMatchObject({
      code: "GUEST_DUPLICATE",
    });
    expect(inv.guestInputSchema.safeParse({ fullName: "X Y", phone: "12345" }).success).toBe(false);
  });

  it("impor: pratinjau tidak menyimpan; commit hanya baris valid", async () => {
    const inv = await import("@/lib/event-invitations");
    const csv = [
      "Nama,WhatsApp,Jumlah orang,Catatan",
      "Sari Dewi,0813 1111 2222,1,",
      "Budi Duplikat,081234567890,2,sudah ada",
      "Rina,0813-1111-2222,2,ganda di file",
      ",0814,1,tanpa nama",
      "Andi,08xx,1,nomor salah",
      "Tono,,3,tanpa WA",
      "Joko,0815 5555 6666,99,pax salah",
    ].join("\n");
    const buffer = Buffer.from(csv);
    const preview = await inv.importGuests(eventId, buffer, { filename: "tamu.csv", dryRun: true }, actor);
    expect(preview.summary).toEqual({ total: 7, valid: 2, duplicate: 2, invalid: 3 });
    expect((await inv.listGuests(eventId)).length).toBe(1);

    const done = await inv.importGuests(eventId, buffer, { filename: "tamu.csv", dryRun: false }, actor);
    expect(done.committed).toBe(2);
    const names = (await inv.listGuests(eventId)).map((g) => g.fullName);
    expect(names).toEqual(["Budi Santoso", "Sari Dewi", "Tono"]);
    expect((await inv.listGuests(eventId)).find((g) => g.fullName === "Tono")?.maxPax).toBe(3);

    await expect(inv.importGuests(eventId, Buffer.from("WhatsApp\n0812"), { filename: "x.csv", dryRun: true }, actor)).rejects.toMatchObject({
      code: "IMPORT_MISSING_COLUMN",
    });
  });
});

describe("undangan, RSVP, rekap", () => {
  it("token unik; undangan bisa dibuka saat event draft maupun terbit; arsip → tidak valid", async () => {
    const inv = await import("@/lib/event-invitations");
    const created = await inv.createInvitations(eventId, null, actor);
    expect(created.created).toBe(3);
    expect((await inv.createInvitations(eventId, null, actor)).created).toBe(0);

    const budi = (await inv.listGuests(eventId)).find((g) => g.fullName === "Budi Santoso")!;
    const share = await inv.getInvitationShareInfo(eventId, budi.invitation!.id);
    expect(share.url).toMatch(/^https:\/\/garagecoffee\.id\/undangan\/[A-Za-z0-9]{32}$/);
    const token = tokenFromUrl(share.url);

    // Event masih draft → undangan pribadi tetap bisa dibuka (link sering dikirim sebelum landing terbit).
    expect(await inv.getPublicInvitation(token, BEFORE)).toMatchObject({ guestName: "Budi Santoso" });
    const svc = await import("@/lib/event-service");
    await svc.setEventStatus(eventId, "archived", actor.userId);
    expect(await inv.getPublicInvitation(token, BEFORE)).toBeNull();
    await svc.setEventStatus(eventId, "published", actor.userId);

    const page = await inv.getPublicInvitation(token, BEFORE);
    expect(page).toMatchObject({ guestName: "Budi Santoso", maxPax: 2, rsvp: null, canChange: true });
    expect(page!.event.title).toBe("Grand Opening Garage Coffee");
    expect(await inv.getPublicInvitation("x".repeat(32), BEFORE)).toBeNull();
    expect(await inv.getPublicInvitation("../../etc", BEFORE)).toBeNull();
  });

  it("bagikan manual mencatat aktor & waktu; RSVP simpan, ubah, batas waktu, maks orang", async () => {
    const inv = await import("@/lib/event-invitations");
    const budi = (await inv.listGuests(eventId)).find((g) => g.fullName === "Budi Santoso")!;
    const shared = await inv.markInvitationShared(eventId, budi.invitation!.id, actor);
    expect(shared.sharedAt).toBeTruthy();
    const [row] = await t.getDb().select().from(t.schema.eventInvitations).where((await import("drizzle-orm")).eq(t.schema.eventInvitations.id, budi.invitation!.id));
    expect(row.status).toBe("shared");
    expect(row.sharedBy).toBe(actor.userId);

    const token = tokenFromUrl((await inv.getInvitationShareInfo(eventId, budi.invitation!.id)).url);
    await expect(inv.submitRsvp(token, { response: "attending", pax: 3 }, BEFORE)).rejects.toMatchObject({ code: "PAX_TOO_MANY" });
    const first = await inv.submitRsvp(token, { response: "attending", pax: 2, note: "bawa istri" }, BEFORE);
    expect(first).toMatchObject({ response: "attending", pax: 2 });
    const second = await inv.submitRsvp(token, { response: "declined", pax: 5 }, BEFORE);
    expect(second).toMatchObject({ response: "declined", pax: 0 });
    await expect(inv.submitRsvp(token, { response: "attending", pax: 1 }, AFTER_DEADLINE)).rejects.toMatchObject({ code: "RSVP_CLOSED" });
    expect((await inv.getPublicInvitation(token, AFTER_DEADLINE))?.canChange).toBe(false);

    const [rsvp] = await t.getDb().select().from(t.schema.eventRsvps);
    expect(rsvp.changeCount).toBe(1);
    expect(inv.rsvpInputSchema.safeParse({ response: "attending", pax: 0 }).success).toBe(false);
  });

  it("buat ulang: token lama mati, RSVP tetap; cabut: link tidak valid", async () => {
    const inv = await import("@/lib/event-invitations");
    const budi = (await inv.listGuests(eventId)).find((g) => g.fullName === "Budi Santoso")!;
    const oldToken = tokenFromUrl((await inv.getInvitationShareInfo(eventId, budi.invitation!.id)).url);
    const { invitationId } = await inv.reissueInvitation(eventId, budi.invitation!.id, actor);
    expect(await inv.getPublicInvitation(oldToken, BEFORE)).toBeNull();
    await expect(inv.submitRsvp(oldToken, { response: "attending", pax: 1 }, BEFORE)).rejects.toMatchObject({ code: "INVITATION_INVALID" });
    const newToken = tokenFromUrl((await inv.getInvitationShareInfo(eventId, invitationId)).url);
    expect((await inv.getPublicInvitation(newToken, BEFORE))?.rsvp?.response).toBe("declined");

    const sari = (await inv.listGuests(eventId)).find((g) => g.fullName === "Sari Dewi")!;
    const sariToken = tokenFromUrl((await inv.getInvitationShareInfo(eventId, sari.invitation!.id)).url);
    await inv.submitRsvp(sariToken, { response: "attending", pax: 1 }, BEFORE);
    await inv.revokeInvitation(eventId, sari.invitation!.id, actor);
    expect(await inv.getPublicInvitation(sariToken, BEFORE)).toBeNull();
    // Tamu yang dicabut tidak lagi dihitung; buat undangan baru untuknya.
    expect((await inv.createInvitations(eventId, [sari.id], actor)).created).toBe(1);
  });

  it("rekap = jumlah record; arsip tamu mencabut undangan", async () => {
    const inv = await import("@/lib/event-invitations");
    const tono = (await inv.listGuests(eventId)).find((g) => g.fullName === "Tono")!;
    const tonoToken = tokenFromUrl((await inv.getInvitationShareInfo(eventId, tono.invitation!.id)).url);
    await inv.submitRsvp(tonoToken, { response: "attending", pax: 3 }, BEFORE);

    expect(await inv.getEventSummary(eventId)).toEqual({
      guests: 3,
      invitations: 3,
      shared: 0,
      notShared: 3,
      attending: 1,
      attendingPax: 3,
      declined: 1,
      pending: 1,
    });

    await inv.updateGuest(eventId, tono.id, { status: "archived" }, actor);
    expect(await inv.getPublicInvitation(tonoToken, BEFORE)).toBeNull();
    const summary = await inv.getEventSummary(eventId);
    expect(summary).toMatchObject({ guests: 2, invitations: 2, attending: 0, attendingPax: 0 });
  });

  it("ekspor CSV aman dari formula injection; log tidak menyimpan token", async () => {
    const inv = await import("@/lib/event-invitations");
    await inv.createGuest(eventId, { fullName: "=HYPERLINK(\"http://x\")", phone: null }, actor);
    const exported = await inv.exportGuestsCsv(eventId);
    expect(exported.csv).toContain(`"'=HYPERLINK(""http://x"")"`);
    expect(exported.csv.split("\r\n")[0]).toContain("Nama,WhatsApp");
    expect(inv.csvCell("+62812")).toBe("'+62812");
    expect(inv.csvCell("-1")).toBe("'-1");
    expect(inv.csvCell("@SUM")).toBe("'@SUM");

    const logs = await t.getDb().select().from(t.schema.eventActivityLogs);
    const tokens = (await t.getDb().select().from(t.schema.eventInvitations)).map((row: any) => row.tokenEnc);
    const serialized = JSON.stringify(logs);
    expect(logs.length).toBeGreaterThan(5);
    for (const enc of tokens) expect(serialized).not.toContain(enc);
    expect(serialized).not.toMatch(/\/undangan\//);
  });
});
