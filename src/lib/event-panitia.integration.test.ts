import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { Role } from "@/lib/garage-data";
import type { GarageSession } from "@/lib/server-auth";
import { seedGarageBasics, setupGarageTestDb, teardownGarageTestDb, type GarageTestDb } from "@/lib/test-helpers/garage-test-db";

// Ruang Panitia (Owner 17 Nov 2026): akun staf yang ditautkan sebagai panitia event melihat event itu saja;
// hak per jabatan dicek di server; tidak ada uang/kontak.

let t: GarageTestDb;
let outletId = "";
let eventId = "";
let lineup: any;
let panitia: any;

const OWNER = "user-itest-panitia-owner";
const KETUA = "user-itest-panitia-ketua";
const ANGGOTA = "user-itest-panitia-anggota";
const BENDAHARA = "user-itest-panitia-bendahara";
const ASING = "user-itest-panitia-asing";

function session(userId: string, role: Role, extra: Record<string, unknown> = {}): GarageSession {
  return {
    user: { id: userId, name: userId.replace("user-itest-panitia-", "") },
    profile: { id: `pf-${userId}`, role, shiftLabel: "Pagi", deviceLabel: "HP", passwordResetRequired: false, outlet: { id: outletId, code: "TST", name: "Outlet Test", timezone: "Asia/Jakarta" }, ...extra },
  } as unknown as GarageSession;
}
const owner = () => session(OWNER, "Owner" as Role);

beforeAll(async () => {
  t = await setupGarageTestDb();
  outletId = (await seedGarageBasics(t, { userId: OWNER })).outletId;
  const d = t.getDb();
  for (const [id, role] of [
    [KETUA, "Waiter"],
    [ANGGOTA, "Kasir"],
    [BENDAHARA, "Waiter"],
    [ASING, "Waiter"],
  ] as const) {
    await d.insert(t.schema.user).values({ id, name: id.replace("user-itest-panitia-", ""), email: `${id}@garage.id` });
    await d.insert(t.schema.staffProfiles).values({ userId: id, outletId, role });
  }
  const [ev] = await d
    .insert(t.schema.events)
    .values({
      slug: "gigs-panitia",
      title: "GIGS PANITIA",
      outletId,
      startsAt: new Date("2026-12-31T12:00:00Z"),
      endsAt: new Date("2026-12-31T17:00:00Z"),
      venueName: "Garage Coffee",
      address: "Jl. Contoh No. 1, Tebing Tinggi",
      mapsUrl: "https://maps.app.goo.gl/contoh",
      contactWhatsapp: "6281200000000",
      status: "published",
    } as any)
    .returning();
  eventId = ev.id;
  lineup = await import("@/lib/event-lineup-service");
  panitia = await import("@/lib/event-panitia-service");
}, 120_000);

afterAll(async () => {
  if (t) await teardownGarageTestDb(t);
});

describe("Ruang Panitia", () => {
  let ketuaCrew = "";
  let anggotaCrew = "";
  let taskAnggota = "";
  let taskLain = "";

  it("Owner menautkan akun staf aktif; akun tidak dikenal ditolak; papan memuat daftar akun", async () => {
    ketuaCrew = (await lineup.createCrew({ eventId, name: "Ace", role: "ketua", userId: KETUA }, owner())).id;
    anggotaCrew = (await lineup.createCrew({ eventId, name: "Aress", role: "dokumentasi", userId: ANGGOTA }, owner())).id;
    await lineup.createCrew({ eventId, name: "Bendahara", role: "bendahara", userId: BENDAHARA }, owner());
    await expect(lineup.createCrew({ eventId, name: "Hantu", role: "lainnya", userId: "user-tidak-ada" }, owner())).rejects.toMatchObject({ code: "ACCOUNT_NOT_FOUND" });
    const board = await lineup.getLineupBoard(owner(), { eventId });
    expect(board.accounts.map((a: any) => a.userId)).toEqual(expect.arrayContaining([KETUA, ANGGOTA, BENDAHARA]));
    expect(board.crew.find((c: any) => c.id === ketuaCrew).userId).toBe(KETUA);

    await lineup.createPerformer({ eventId, name: "LOST SIDE", kind: "band", status: "konfirmasi", setStart: "20:00", setMinutes: 40, contactPhone: "081234567890" }, owner());
    await lineup.createPerformer({ eventId, name: "Calon Band", kind: "band", status: "calon" }, owner());
    taskAnggota = (await lineup.createTask({ eventId, title: "Foto panggung", crewId: anggotaCrew, dueDate: "2020-01-01" }, owner())).id;
    taskLain = (await lineup.createTask({ eventId, title: "Cek sound", crewId: ketuaCrew }, owner())).id;
    const finance = await import("@/lib/event-finance-service");
    await finance.createBudgetLine({ eventId, category: "sound", title: "Sound", plannedAmount: 10_000_000 }, owner());
  });

  it("anggota: rundown tanpa kontak & tanpa calon, tugasnya bisa diubah, tugas orang lain tidak, tanpa ringkasan uang", async () => {
    const ws = await panitia.getPanitiaWorkspace(session(ANGGOTA, "Kasir" as Role));
    expect(ws.events).toHaveLength(1);
    const ev = ws.events[0];
    expect(ev).toMatchObject({ title: "GIGS PANITIA", canManageTasks: false, canSeeFinance: false, finance: null });
    expect(ev.roles.map((r: any) => r.label)).toEqual(["Dokumentasi"]);
    expect(ev.rundown).toEqual([{ slot: 1, name: "LOST SIDE", kind: "band", start: "20:00", end: "20:40", overlap: false }]);
    expect(JSON.stringify(ev)).not.toContain("081234567890");
    expect(ev.tasks.find((x: any) => x.id === taskAnggota)).toMatchObject({ mine: true, canUpdate: true, overdue: true });
    expect(ev.tasks.find((x: any) => x.id === taskLain)).toMatchObject({ mine: false, canUpdate: false });

    await panitia.panitiaUpdateTaskStatus(taskAnggota, { status: "selesai" }, session(ANGGOTA, "Kasir" as Role));
    await expect(panitia.panitiaUpdateTaskStatus(taskLain, { status: "selesai" }, session(ANGGOTA, "Kasir" as Role))).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(panitia.panitiaCreateTask({ eventKey: ev.key, title: "Tugas iseng" }, session(ANGGOTA, "Kasir" as Role))).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("ketua: buat tugas untuk panitia event yang sama, ubah semua tugas, lihat ringkasan anggaran", async () => {
    const ws = await panitia.getPanitiaWorkspace(session(KETUA, "Waiter" as Role));
    const ev = ws.events[0];
    expect(ev).toMatchObject({ canManageTasks: true, canSeeFinance: true });
    expect(ev.finance).toMatchObject({ planned: 10_000_000, paid: 0 });
    const created = await panitia.panitiaCreateTask({ eventKey: ev.key, title: "Briefing MC", crewId: anggotaCrew, priority: "tinggi" }, session(KETUA, "Waiter" as Role));
    expect(created).toMatchObject({ eventId, crewId: anggotaCrew, createdBy: KETUA });
    await panitia.panitiaUpdateTaskStatus(taskAnggota, { status: "proses" }, session(KETUA, "Waiter" as Role));
    const other = await lineup.createCrew({ eventName: "Event Lain", name: "Orang Lain", role: "lainnya" }, owner());
    await expect(panitia.panitiaCreateTask({ eventKey: ev.key, title: "Salah event", crewId: other.id }, session(KETUA, "Waiter" as Role))).rejects.toMatchObject({ code: "CREW_OTHER_EVENT" });
  });

  it("bendahara melihat ringkasan; akun tak tertaut kosong; panitia nonaktif kehilangan akses; agent key ditolak", async () => {
    const bend = await panitia.getPanitiaWorkspace(session(BENDAHARA, "Waiter" as Role));
    expect(bend.events[0]).toMatchObject({ canSeeFinance: true, canManageTasks: false });
    expect((await panitia.getPanitiaWorkspace(session(ASING, "Waiter" as Role))).events).toEqual([]);
    expect(await panitia.hasPanitiaAccess(session(ASING, "Waiter" as Role))).toBe(false);

    await lineup.updateCrew(anggotaCrew, { status: "nonaktif" }, owner());
    expect((await panitia.getPanitiaWorkspace(session(ANGGOTA, "Kasir" as Role))).events).toEqual([]);
    await expect(panitia.panitiaUpdateTaskStatus(taskAnggota, { status: "selesai" }, session(ANGGOTA, "Kasir" as Role))).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(panitia.getPanitiaWorkspace(session(KETUA, "Waiter" as Role, { agentKey: { id: "k" } }))).rejects.toMatchObject({ code: "HUMAN_SESSION_REQUIRED" });
  });

  it("perubahan panitia tercatat di audit (via panitia)", async () => {
    const logs = await t.getDb().select().from(t.schema.auditLogs);
    const mine = logs.filter((l: any) => (l.metadata as any)?.via === "panitia");
    expect(mine.map((l: any) => l.action)).toEqual(expect.arrayContaining(["Tugas panitia → selesai", "Tambah tugas panitia", "Tugas panitia → proses"]));
  });
});
