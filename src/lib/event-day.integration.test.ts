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
  it("Owner & Manajer boleh; Kasir & API key agent ditolak; agenda hanya Owner", async () => {
    await expect(day.getEventDay(manajer(), eventId)).resolves.toMatchObject({ event: { id: eventId } });
    await expect(day.getEventDay(session("Kasir" as Role), eventId)).rejects.toMatchObject({ code: "FORBIDDEN" });
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
});
