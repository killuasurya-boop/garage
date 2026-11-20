import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { Role } from "@/lib/garage-data";
import type { GarageSession } from "@/lib/server-auth";
import { seedGarageBasics, setupGarageTestDb, teardownGarageTestDb, type GarageTestDb } from "@/lib/test-helpers/garage-test-db";

// GIGS EO Fase 3 (Owner 17 Nov 2026): check-in pintu, mode stage manager, salin rundown, akses panitia.

/* eslint-disable @typescript-eslint/no-explicit-any */
let t: GarageTestDb;
let day: any;
let outletId = "";
let eventId = "";
let otherEventId = "";
let token = "";
let surai = "";
let standup = "";
const OWNER = "user-itest-eday-owner";

function session(role: Role, extra: Record<string, unknown> = {}): GarageSession {
  return {
    user: { id: OWNER, name: `${role} Eday` },
    profile: { id: `ed-${OWNER}`, role, shiftLabel: "Pagi", deviceLabel: "EDAY", passwordResetRequired: false, outlet: { id: outletId, code: "TST", name: "Outlet Test", timezone: "Asia/Jakarta" }, ...extra },
  } as unknown as GarageSession;
}
const owner = () => session("Owner" as Role);
const manajer = () => session("Manajer" as Role);

async function insertEvent(slug: string, title: string, capacity: number | null) {
  const [row] = await t
    .getDb()
    .insert(t.schema.events)
    .values({
      slug,
      title,
      outletId,
      startsAt: new Date("2026-12-20T12:00:00Z"),
      endsAt: new Date("2026-12-20T18:00:00Z"),
      venueName: "Garage Coffee",
      address: "Jl. Contoh No. 1, Tebing Tinggi",
      mapsUrl: "https://maps.app.goo.gl/contoh",
      contactWhatsapp: "6281200000000",
      status: "published",
      capacity,
    } as any)
    .returning();
  return row.id as string;
}

beforeAll(async () => {
  process.env.BETTER_AUTH_SECRET ??= "test-secret-0123456789abcdef";
  t = await setupGarageTestDb();
  outletId = (await seedGarageBasics(t, { userId: OWNER })).outletId;
  eventId = await insertEvent("gigs-hari-h", "GIGS HARI H", 5);
  otherEventId = await insertEvent("event-lain-h", "EVENT LAIN H", null);
  day = await import("@/lib/event-day-service");
  const inv = await import("@/lib/event-invitations");
  const actor = { userId: OWNER, name: "Owner Eday" };
  await inv.createGuest(eventId, { fullName: "Budi Santoso", phone: "081234567890", maxPax: 2 } as any, actor);
  await inv.createInvitations(eventId, null, actor);
  const [guest] = await inv.listGuests(eventId);
  const share = await inv.getInvitationShareInfo(eventId, guest.invitation!.id);
  token = share.url.split("/undangan/")[1];
  const lineup = await import("@/lib/event-lineup-service");
  standup = (await lineup.createPerformer({ eventId, name: "Standup Indo", kind: "standup", status: "konfirmasi", setStart: "19:00", setMinutes: 30, showOnWebsite: true }, owner())).id;
  surai = (await lineup.createPerformer({ eventId, name: "Surai", kind: "band", status: "konfirmasi", setStart: "19:30", setMinutes: 30, showOnWebsite: true }, owner())).id;
  await lineup.reorderPerformers({ eventName: "GIGS HARI H", ids: [standup, surai] }, owner());
}, 60_000);

afterAll(async () => {
  await teardownGarageTestDb(t);
});

describe("Hari-H: akses", () => {
  it("Owner & Manajer boleh; Kasir/Waiter = meja pintu (tanpa panggung); Panitia & API key agent ditolak; agenda hanya Owner", async () => {
    await expect(day.getEventDay(manajer(), eventId)).resolves.toMatchObject({ event: { id: eventId } });
    const desk = await day.getEventDay(session("Kasir" as Role), eventId);
    expect(desk).toMatchObject({ event: { id: eventId }, role: "Kasir", stage: null });
    await expect(day.setSlotState(standup, "start", session("Waiter" as Role))).rejects.toMatchObject({ code: "FORBIDDEN" });
    // Panitia yang bukan panitia event ini → tidak terlihat.
    await expect(day.getEventDay(session("Panitia" as Role), eventId)).rejects.toMatchObject({ code: "EVENT_NOT_FOUND" });
    await expect(day.getEventDay(session("Owner" as Role, { agentKey: { id: "k" } }), eventId)).rejects.toMatchObject({ code: "HUMAN_SESSION_REQUIRED" });
    await expect(day.syncAgendaFromRundown(eventId, manajer())).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("Hari-H: check-in", () => {
  it("scan QR undangan: batas pax undangan, dobel ditolak, event lain ditolak", async () => {
    const url = `https://garagecoffee.id/undangan/${token}`;
    await expect(day.checkIn({ eventId, code: url, pax: 1 }, manajer())).resolves.toMatchObject({ guestName: "Budi Santoso", pax: 1, kind: "undangan" });
    await expect(day.checkIn({ eventId, code: token, pax: 2 }, manajer())).rejects.toMatchObject({ code: "PAX_EXCEEDS_INVITATION" });
    await day.checkIn({ eventId, code: token, pax: 1 }, manajer());
    await expect(day.checkIn({ eventId, code: token, pax: 1 }, manajer())).rejects.toMatchObject({ code: "ALREADY_CHECKED_IN" });
    await expect(day.checkIn({ eventId: otherEventId, code: token, pax: 1 }, owner())).rejects.toMatchObject({ code: "INVITATION_OTHER_EVENT" });
    await expect(day.checkIn({ eventId, code: "https://x.id/order?table=1", pax: 1 }, owner())).rejects.toMatchObject({ code: "NOT_INVITATION" });
  });

  it("walk-in & kapasitas (5); batal mengembalikan kuota; baris tidak dihapus", async () => {
    const w = await day.checkIn({ eventId, walkInName: "Tamu Walk In", pax: 3 }, owner());
    await expect(day.checkIn({ eventId, walkInName: "Tamu Lagi", pax: 1 }, owner())).rejects.toMatchObject({ code: "CAPACITY_FULL" });
    await expect(day.voidCheckin(w.id, "", owner())).rejects.toMatchObject({ code: "REASON_REQUIRED" });
    await day.voidCheckin(w.id, "Salah hitung", owner());
    await expect(day.checkIn({ eventId, walkInName: "Tamu Lagi", pax: 1 }, owner())).resolves.toMatchObject({ kind: "walkin" });
    const view = await day.getEventDay(owner(), eventId);
    expect(view.checkin).toMatchObject({ totalActive: 3, capacity: 5, byKind: { undangan: 2, walkin: 1 } });
    expect(view.checkin.recent.some((r: any) => r.status === "batal" && r.voidReason === "Salah hitung")).toBe(true);
  });

  it("meja pintu (Kasir): cari nama/HP tanpa membocorkan HP, check-in dari hasil cari, batal tetap Owner/Manajer; undangan menampilkan 'sudah masuk'", async () => {
    const inv = await import("@/lib/event-invitations");
    const actor = { userId: OWNER, name: "Owner Eday" };
    await inv.createGuest(eventId, { fullName: "Sari Dewi", phone: "081299998888", maxPax: 2 } as any, actor);
    await inv.createInvitations(eventId, null, actor);
    const kasir = session("Kasir" as Role);
    const byName = await day.searchCheckinGuests(eventId, "sari", kasir);
    expect(byName).toEqual([{ invitationId: expect.any(String), name: "Sari Dewi", maxPax: 2, checkedInPax: 0, checkedInAt: null }]);
    expect(JSON.stringify(byName)).not.toContain("99998888");
    const byPhone = await day.searchCheckinGuests(eventId, "0812-9999-8888", kasir);
    expect(byPhone.map((h: any) => h.name)).toEqual(["Sari Dewi"]);
    expect(await day.searchCheckinGuests(eventId, "x", kasir)).toEqual([]);

    const done = await day.checkIn({ eventId, invitationId: byName[0].invitationId, pax: 1 }, kasir);
    expect(done).toMatchObject({ guestName: "Sari Dewi", kind: "undangan", pax: 1 });
    expect((await day.searchCheckinGuests(eventId, "sari dewi", kasir))[0]).toMatchObject({ checkedInPax: 1, checkedInAt: expect.any(String) });
    await expect(day.checkIn({ eventId: otherEventId, invitationId: byName[0].invitationId, pax: 1 }, owner())).rejects.toMatchObject({ code: "INVITATION_INVALID" });
    await expect(day.voidCheckin(done.id, "salah orang", kasir)).rejects.toMatchObject({ code: "FORBIDDEN" });

    const [guest] = (await inv.listGuests(eventId)).filter((g: any) => g.fullName === "Sari Dewi");
    const share = await inv.getInvitationShareInfo(eventId, guest.invitation!.id);
    const page = await inv.getPublicInvitation(share.url.split("/undangan/")[1]);
    expect(page?.checkedIn).toMatchObject({ pax: 1, at: expect.any(String) });
    expect((await inv.getPublicInvitation(token))?.checkedIn).toMatchObject({ pax: 2 });
  });
});

describe("Hari-H: panggung", () => {
  it("mulai berikutnya otomatis menyelesaikan yang tampil; telat dihitung; beranda 'sedang tampil'", async () => {
    await expect(day.setSlotState(surai, "end", manajer())).rejects.toMatchObject({ code: "NOT_STARTED" });
    await day.setSlotState(standup, "start", manajer(), new Date("2026-12-20T19:10:00+07:00"));
    await day.setSlotState(surai, "start", manajer(), new Date("2026-12-20T19:45:00+07:00"));
    const view = await day.getEventDay(owner(), eventId);
    const slots = view.stage.slots;
    expect(slots.find((s: any) => s.id === standup)).toMatchObject({ live: false });
    expect(slots.find((s: any) => s.id === standup).actualEnd).toBeTruthy();
    expect(slots.find((s: any) => s.id === surai)).toMatchObject({ live: true, plannedStart: "19.30" });
    expect(view.stage.delayMinutes).toBe(15);
    const lineup = await import("@/lib/event-lineup-service");
    const items = await lineup.publicLineupFor({ slug: "", name: "GIGS HARI H" });
    expect(items.find((i: any) => i.name === "Surai")).toMatchObject({ live: true });
    expect(items.find((i: any) => i.name === "Standup Indo")).toMatchObject({ live: false });
    await day.setSlotState(surai, "undo", manajer());
    expect((await lineup.publicLineupFor({ slug: "", name: "GIGS HARI H" })).every((i: any) => !i.live)).toBe(true);
  });

  it("salin rundown ke agenda undangan (Owner)", async () => {
    const res = await day.syncAgendaFromRundown(eventId, owner());
    expect(res.agenda).toEqual([
      { start: "19:00", end: "19:30", title: "Standup Indo" },
      { start: "19:30", end: "20:00", title: "Surai" },
    ]);
  });

  it("Manajer: status tugas boleh, ubah judul tidak", async () => {
    const lineup = await import("@/lib/event-lineup-service");
    const task = await lineup.createTask({ eventId, title: "Cek genset" }, owner());
    await expect(lineup.updateTask(task.id, { status: "selesai" }, manajer())).resolves.toMatchObject({ status: "selesai" });
    await expect(lineup.updateTask(task.id, { title: "Ganti" }, manajer())).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("dua HP menekan Mulai bersamaan → tetap satu penampil live", async () => {
    const at = new Date("2026-12-20T19:50:00+07:00");
    await Promise.all([day.setSlotState(standup, "start", manajer(), at), day.setSlotState(surai, "start", owner(), at)]);
    const view = await day.getEventDay(owner(), eventId);
    expect(view.stage.slots.filter((s: any) => s.live)).toHaveLength(1);
    const live = (await t.getDb().select().from(t.schema.eventPerformers)).filter((p: any) => p.eventId === eventId && p.actualStart && !p.actualEnd);
    expect(live).toHaveLength(1);
    await day.setSlotState(standup, "undo", owner());
    await day.setSlotState(surai, "undo", owner());
  });

  it("Manajer: default & daftar event hanya outletnya (event outlet lain yang lebih baru tidak dipilih)", async () => {
    const [other] = await t.getDb().insert(t.schema.outlets).values({ code: "LAIN", name: "Outlet Lain" } as any).returning();
    await t
      .getDb()
      .insert(t.schema.events)
      .values({ slug: "outlet-lain-baru", title: "Event Outlet Lain", outletId: other.id, startsAt: new Date("2027-06-01T12:00:00Z"), endsAt: new Date("2027-06-01T17:00:00Z"), venueName: "Garage Coffee", address: "Jl. Contoh No. 1, Tebing Tinggi", mapsUrl: "https://maps.app.goo.gl/contoh", contactWhatsapp: "6281200000000", status: "published" } as any);
    const asOwner = await day.getEventDay(owner(), null);
    expect(asOwner.event.title).toBe("Event Outlet Lain");
    const asManajer = await day.getEventDay(manajer(), null);
    expect(asManajer.masterEvents.map((e: any) => e.title)).not.toContain("Event Outlet Lain");
    expect(asManajer.event).toBeTruthy();
    expect(asManajer.event.title).not.toBe("Event Outlet Lain");
  });
});

describe("Banner 'Sedang tampil' halaman event platform (satu pintu, Owner 18 Nov 2026)", () => {
  it("mengikuti tombol Mulai/Selesai di Garage; event platform dicocokkan nama/slug master", async () => {
    await day.setSlotState(standup, "undo", owner()).catch(() => undefined);
    await day.setSlotState(surai, "undo", owner()).catch(() => undefined);
    const before = await day.publicStageForPlatform({ slug: "slug-platform-tidak-ada", name: "gigs hari h" });
    expect(before).toEqual({ current: null, since: null, next: { name: "Standup Indo", category: "standup", startTime: "19.00", performer: "" } });

    await day.setSlotState(standup, "start", manajer(), new Date("2026-12-20T12:05:00Z"));
    const live = await day.publicStageForPlatform({ slug: "", name: "GIGS HARI H" });
    expect(live).toMatchObject({ current: { name: "Standup Indo" }, since: "19.05", next: { name: "Surai", performer: "" } });

    await day.setSlotState(standup, "undo", owner());
    expect(await day.publicStageForPlatform({ slug: "", name: "EVENT TANPA MASTER" })).toBeNull();
  });
});

describe("Akun Panitia di Hari-H (Owner 18 Nov 2026)", () => {
  it("panitia aktif event: check-in + Mulai/Selesai; event lain tidak; batal check-in tetap Owner/Manajer", async () => {
    const panitia = () => session("Panitia" as Role);
    await t.getDb().insert(t.schema.eventCrew).values({ eventId, eventName: "GIGS HARI H", name: "Ketua Panitia", role: "ketua", userId: OWNER, status: "aktif" } as any);
    const view = await day.getEventDay(panitia(), null);
    expect(view.event.id).toBe(eventId);
    expect(view.masterEvents.map((e: { id: string }) => e.id)).toEqual([eventId]);
    expect(view.stage).not.toBeNull();
    await expect(day.getEventDay(panitia(), otherEventId)).rejects.toMatchObject({ code: "EVENT_NOT_FOUND" });

    const walkin = await day.checkIn({ eventId, walkInName: "Tamu Panitia", pax: 1 }, panitia());
    expect(walkin).toBeTruthy();
    await day.setSlotState(standup, "start", panitia(), new Date("2026-12-20T12:01:00Z"));
    expect((await day.publicStageForPlatform({ slug: "", name: "GIGS HARI H" })).current).toMatchObject({ name: "Standup Indo" });
    await day.setSlotState(standup, "undo", panitia());

    const recent = (await day.getEventDay(owner(), eventId)).checkin.recent.find((r: { guestName: string }) => r.guestName === "Tamu Panitia");
    await expect(day.voidCheckin(recent.id, "salah input", panitia())).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(day.setSlotState(standup, "start", session("Panitia" as Role, { agentKey: { id: "k" } }))).rejects.toMatchObject({ code: "HUMAN_SESSION_REQUIRED" });
  });
});

describe("Log kejadian Hari-H (Owner 20 Nov 2026)", () => {
  it("Panitia event & Owner mencatat; TINGGI → notifikasi Owner; selesai sekali dengan keterangan; laporan akhir menghitungnya", async () => {
    const panitia = () => session("Panitia" as Role);
    // Kasir (meja pintu) & panitia event lain tidak boleh.
    await expect(day.reportIncident({ eventId, type: "teknis", severity: "sedang", note: "Mic mati" }, session("Kasir" as Role))).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(day.listIncidents(otherEventId, panitia())).rejects.toMatchObject({ code: "EVENT_NOT_FOUND" });
    await expect(day.reportIncident({ eventId, type: "teknis", severity: "sedang", note: "x" }, session("Panitia" as Role, { agentKey: { id: "k" } }))).rejects.toMatchObject({ code: "HUMAN_SESSION_REQUIRED" });

    await t.getDb().insert(t.schema.staffProfiles).values({ userId: OWNER, role: "Owner", outletId, shiftLabel: "Pagi", deviceLabel: "HP Owner", status: "active" } as any).onConflictDoNothing();
    const low = await day.reportIncident({ eventId, type: "teknis", severity: "rendah", note: "Kabel gitar longgar" }, panitia());
    const high = await day.reportIncident({ eventId, type: "kesehatan", severity: "tinggi", note: "Penonton pingsan dekat panggung" }, owner());
    const notes = (await t.getDb().select().from(t.schema.staffNotifications)).filter((n: any) => n.kind === "event_incident");
    expect(notes.length).toBeGreaterThanOrEqual(1);
    expect(notes[0]).toMatchObject({ title: expect.stringContaining("Kejadian TINGGI"), url: `/event-day?event=${eventId}&tab=kejadian` });
    expect(notes.every((n: any) => !String(n.body).includes("Kabel gitar"))).toBe(true);

    await day.resolveIncident(high.id, { resolution: "Dibawa ke pos P3K, sadar kembali" }, panitia());
    await expect(day.resolveIncident(high.id, { resolution: "lagi" }, owner())).rejects.toMatchObject({ code: "ALREADY_RESOLVED" });
    const list = await day.listIncidents(eventId, panitia());
    expect(list).toMatchObject({ total: 2, open: 1 });
    expect(list.items.find((i: any) => i.id === low.id)).toMatchObject({ resolved: false, reportedByName: "Panitia Eday" });
    expect(await day.incidentCounts(eventId)).toEqual({ total: 2, resolved: 1 });
    expect(await day.incidentCounts(otherEventId)).toBeNull();
    // Yang belum selesai tetap tampil walau sudah ada >300 kejadian selesai; hitungan dari seluruh log.
    await t.getDb().insert(t.schema.eventIncidents).values(
      Array.from({ length: 305 }, (_, i) => ({ eventId, type: "lainnya", severity: "rendah", note: `Selesai ${i}`, resolvedAt: new Date(), resolution: "ok", createdAt: new Date(Date.now() + 60_000 + i) })) as any,
    );
    const big = await day.listIncidents(eventId, owner());
    expect(big).toMatchObject({ total: 307, open: 1 });
    expect(big.items.some((i: any) => i.id === low.id && !i.resolved)).toBe(true);
  });
});
