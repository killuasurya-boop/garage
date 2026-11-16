import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { Role } from "@/lib/garage-data";
import type { GarageSession } from "@/lib/server-auth";
import { setupGarageTestDb, teardownGarageTestDb, type GarageTestDb } from "@/lib/test-helpers/garage-test-db";

// =============================================================================
// Check-in tamu di pintu (owner 16 Nov 2026): QR undangan → masuk sekali, scan ganda
// ditolak, cari nama, walk-in idempoten, batal hanya Owner/Manajer, halaman undangan
// menampilkan "sudah masuk".
// =============================================================================

/* eslint-disable @typescript-eslint/no-explicit-any */
let t: GarageTestDb;
let eventId = "";
let ck: any;
let inv: any;
const STAFF = "u-door";
const actor = { userId: STAFF, name: "Petugas Pintu" };
const tokens: Record<string, string> = {};
const ids: Record<string, string> = {};

function session(role: Role, extra: Record<string, unknown> = {}): GarageSession {
  return {
    user: { id: STAFF, name: `${role} Pintu` },
    profile: { id: `sp-${STAFF}`, role, shiftLabel: "Malam", deviceLabel: "HP-PINTU", passwordResetRequired: false, outlet: { id: "00000000-0000-4000-8000-000000000001", code: "TST", name: "Outlet", timezone: "Asia/Jakarta" }, ...extra },
  } as unknown as GarageSession;
}

beforeAll(async () => {
  process.env.BETTER_AUTH_SECRET = "test-secret-0123456789abcdef";
  process.env.GARAGE_PUBLIC_BASE_URL = "https://garagecoffee.id";
  t = await setupGarageTestDb();
  await t.getDb().insert(t.schema.user).values({ id: STAFF, name: "Petugas Pintu", email: "door@garage.id" } as any);
  const svc = await import("@/lib/event-service");
  const [event] = await svc.listEventsForAdmin();
  eventId = event.id;
  await svc.setEventStatus(eventId, "published", STAFF);
  inv = await import("@/lib/event-invitations");
  ck = await import("@/lib/event-checkin-service");
  for (const [name, phone, maxPax] of [
    ["Budi Santoso", "081234567890", 3],
    ["Sari Dewi", "081311112222", 2],
    ["Rina Lestari", null, 1],
  ] as const) {
    await inv.createGuest(eventId, { fullName: name, phone, maxPax }, actor);
  }
  await inv.createInvitations(eventId, null, actor);
  for (const g of await inv.listGuests(eventId)) {
    ids[g.fullName] = g.invitation.id;
    const share = await inv.getInvitationShareInfo(eventId, g.invitation.id);
    tokens[g.fullName] = share.url.split("/undangan/")[1];
  }
  await inv.submitRsvp(tokens["Budi Santoso"], { response: "attending", pax: 2 }, new Date("2026-01-01T00:00:00Z"));
  await inv.submitRsvp(tokens["Sari Dewi"], { response: "declined", pax: 0 }, new Date("2026-01-01T00:00:00Z"));
}, 60_000);

afterAll(async () => {
  await teardownGarageTestDb(t);
});

describe("check-in tamu", () => {
  it("scan QR (URL penuh) → pratinjau tanpa mencatat; jumlah bawaan = RSVP", async () => {
    const p = await ck.previewCheckin(eventId, { code: `https://garagecoffee.id/undangan/${tokens["Budi Santoso"]}?utm=wa` }, session("Waiter" as Role));
    expect(p).toMatchObject({ found: true, guest: { guestName: "Budi Santoso", maxPax: 3, defaultPax: 2, allowed: true, activeCheckin: null } });
    const board = await ck.getCheckinBoard(eventId, session("Waiter" as Role));
    expect(board.summary.totalPax).toBe(0);
  });

  it("masuk sekali; scan kedua ditolak dengan jam & petugas; batas orang dijaga", async () => {
    await expect(ck.checkInGuest(eventId, { code: tokens["Budi Santoso"], pax: 4, method: "scan" }, session("Waiter" as Role))).rejects.toMatchObject({ code: "PAX_TOO_MANY" });
    const ok = await ck.checkInGuest(eventId, { code: tokens["Budi Santoso"], pax: 3, method: "scan" }, session("Waiter" as Role));
    expect(ok).toMatchObject({ guestName: "Budi Santoso", pax: 3 });
    expect(ok.warnings.join(" ")).toMatch(/lebih banyak dari RSVP/);
    await expect(ck.checkInGuest(eventId, { code: tokens["Budi Santoso"], pax: 1, method: "scan" }, session("Kasir" as Role))).rejects.toMatchObject({
      code: "ALREADY_CHECKED_IN",
      detail: expect.objectContaining({ pax: 3, byName: "Waiter Pintu" }),
    });
    const p = await ck.previewCheckin(eventId, { code: tokens["Budi Santoso"] }, session("Waiter" as Role));
    expect(p.guest).toMatchObject({ allowed: false, block: "ALREADY_CHECKED_IN" });
    // Halaman undangan tamu menampilkan "sudah masuk".
    expect((await inv.getPublicInvitation(tokens["Budi Santoso"])).checkedInAt).toBeTruthy();
  });

  it("dua petugas bersamaan memindai QR yang sama → hanya satu yang tercatat", async () => {
    const results = await Promise.allSettled([
      ck.checkInGuest(eventId, { code: tokens["Rina Lestari"], pax: 1, method: "scan" }, session("Waiter" as Role)),
      ck.checkInGuest(eventId, { code: tokens["Rina Lestari"], pax: 1, method: "scan" }, session("Kasir" as Role)),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect((results.find((r) => r.status === "rejected") as PromiseRejectedResult).reason).toMatchObject({ code: "ALREADY_CHECKED_IN" });
  });

  it("cari nama / nomor HP (nomor tidak dikirim balik); RSVP tidak hadir = peringatan, tetap boleh", async () => {
    const byName = await ck.searchCheckinGuests(eventId, "sari", session("Waiter" as Role));
    expect(byName.map((g: any) => g.guestName)).toEqual(["Sari Dewi"]);
    expect(JSON.stringify(byName)).not.toContain("0813");
    const byPhone = await ck.searchCheckinGuests(eventId, "1111 2222", session("Waiter" as Role));
    expect(byPhone.map((g: any) => g.guestName)).toEqual(["Sari Dewi"]);
    const p = await ck.previewCheckin(eventId, { invitationId: ids["Sari Dewi"] }, session("Waiter" as Role));
    expect(p.guest).toMatchObject({ allowed: true, defaultPax: 1 });
    expect(p.guest.warnings.join(" ")).toMatch(/tidak hadir/);
    await ck.checkInGuest(eventId, { invitationId: ids["Sari Dewi"], pax: 1, method: "manual" }, session("Waiter" as Role));
  });

  it("QR bukan undangan / undangan dicabut → ditolak tanpa membuka data", async () => {
    expect(await ck.previewCheckin(eventId, { code: "https://contoh.com/apa" }, session("Waiter" as Role))).toMatchObject({ found: false });
    await expect(ck.checkInGuest(eventId, { code: "x".repeat(32), pax: 1, method: "scan" }, session("Waiter" as Role))).rejects.toMatchObject({ code: "INVALID" });
  });

  it("walk-in idempoten; rekap = undangan + walk-in", async () => {
    const key = "walkin-key-0001";
    const first = await ck.recordWalkin(eventId, { pax: 4, name: "Rombongan komunitas", idempotencyKey: key }, session("Kasir" as Role));
    const again = await ck.recordWalkin(eventId, { pax: 4, name: "Rombongan komunitas", idempotencyKey: key }, session("Kasir" as Role));
    expect(again).toMatchObject({ checkinId: first.checkinId, replay: true });
    const board = await ck.getCheckinBoard(eventId, session("Waiter" as Role));
    expect(board.summary).toMatchObject({ arrivedInvitations: 3, arrivedInvitedPax: 5, walkinPax: 4, totalPax: 9, invitedGuests: 3, rsvpAttendingPax: 2 });
  });

  it("batal check-in: Owner/Manajer + alasan; undangan bisa dipakai lagi; riwayat tetap", async () => {
    const board = await ck.getCheckinBoard(eventId, session("Manajer" as Role));
    const budi = board.recent.find((r: any) => r.guestName === "Budi Santoso");
    await expect(ck.undoCheckin(budi.id, "salah scan", session("Waiter" as Role))).rejects.toMatchObject({ code: "FORBIDDEN" });
    await ck.undoCheckin(budi.id, "salah jumlah orang", session("Manajer" as Role));
    await expect(ck.undoCheckin(budi.id, "lagi", session("Owner" as Role))).rejects.toMatchObject({ code: "ALREADY_UNDONE" });
    const redo = await ck.checkInGuest(eventId, { code: tokens["Budi Santoso"], pax: 2, method: "scan" }, session("Waiter" as Role));
    expect(redo.pax).toBe(2);
    const after = await ck.getCheckinBoard(eventId, session("Manajer" as Role));
    expect(after.recent.filter((r: any) => r.guestName === "Budi Santoso").map((r: any) => r.undone).sort()).toEqual([false, true]);
    expect(after.summary.totalPax).toBe(8);
  });

  it("API key agent ditolak", async () => {
    await expect(ck.getCheckinBoard(eventId, session("Owner" as Role, { agentKey: { id: "k", label: "AI", scope: "owner" } }))).rejects.toMatchObject({ code: "HUMAN_SESSION_REQUIRED" });
  });
});
