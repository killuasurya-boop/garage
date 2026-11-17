import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import type { Role } from "@/lib/garage-data";
import type { GarageSession } from "@/lib/server-auth";
import { seedGarageBasics, setupGarageTestDb, teardownGarageTestDb, type GarageTestDb } from "@/lib/test-helpers/garage-test-db";

// TEST INTEGRASI Lineup & Panitia Event (owner 16 Nov 2026): Owner saja, batal wajib alasan, urutan slot,
// tugas panitia, website hanya menerima penampil terkonfirmasi.

/* eslint-disable @typescript-eslint/no-explicit-any */
let t: GarageTestDb;
let svc: any;
let outletId = "";
const OWNER = "user-itest-lineup-owner";
const EVENT = "GIGS AKHIR TAHUN 2026";

function session(role: Role, extra: Record<string, unknown> = {}): GarageSession {
  return {
    user: { id: OWNER, name: `${role} Lineup` },
    profile: { id: `ln-${OWNER}`, role, shiftLabel: "Pagi", deviceLabel: "LINEUP", passwordResetRequired: false, outlet: { id: outletId, code: "TST", name: "Outlet Test", timezone: "Asia/Jakarta" }, ...extra },
  } as unknown as GarageSession;
}
const owner = () => session("Owner" as Role);

beforeAll(async () => {
  t = await setupGarageTestDb();
  outletId = (await seedGarageBasics(t, { userId: OWNER })).outletId;
  svc = await import("@/lib/event-lineup-service");
}, 60_000);

afterAll(async () => {
  await teardownGarageTestDb(t);
});

describe("Lineup & Panitia — akses", () => {
  it("Manajer dan API key agent ditolak", async () => {
    await expect(svc.getLineupBoard(session("Manajer" as Role), EVENT)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(svc.createPerformer({ eventName: EVENT, name: "X Band", kind: "band" }, session("Owner" as Role, { agentKey: { id: "k" } }))).rejects.toMatchObject({ code: "HUMAN_SESSION_REQUIRED" });
  });
});

describe("Lineup & Panitia — alur", () => {
  let surai = "";
  let standup = "";
  let calon = "";
  let ketua = "";

  it("menambah band & stand-up, kontak dinormalkan, nomor salah ditolak", async () => {
    surai = (await svc.createPerformer({ eventName: EVENT, name: "Surai", kind: "band", status: "konfirmasi", contactPhone: "+62 812 1111 2222", instagram: "@surai.band", setStart: "20:00", setMinutes: 30 }, owner())).id;
    const s = await svc.createPerformer({ eventName: EVENT, name: "Standup Indo Tebing Tinggi", kind: "standup", status: "konfirmasi", contactPhone: "081233334444", setStart: "19:30", setMinutes: 30 }, owner());
    standup = s.id;
    calon = (await svc.createPerformer({ eventName: EVENT, name: "Band Calon", kind: "band" }, owner())).id;
    expect(s.contactPhone).toBe("081233334444");
    await expect(svc.createPerformer({ eventName: EVENT, name: "Nomor Salah", kind: "band", contactPhone: "123" }, owner())).rejects.toMatchObject({ code: "INVALID_PHONE" });
    expect(svc.performerInputSchema.safeParse({ eventName: EVENT, name: "Langsung Batal", kind: "band", status: "batal" }).success).toBe(false);
  });

  it("urutan slot disimpan; event lain / id asing ditolak", async () => {
    await svc.reorderPerformers({ eventName: EVENT, ids: [standup, surai, calon] }, owner());
    const board = await svc.getLineupBoard(owner(), EVENT);
    expect(board.rundown.map((r: any) => r.name)).toEqual(["Standup Indo Tebing Tinggi", "Surai", "Band Calon"]);
    expect(board.rundown[1]).toMatchObject({ start: "20:00", end: "20:30", overlap: false });
    await expect(svc.reorderPerformers({ eventName: "Event Lain", ids: [surai] }, owner())).rejects.toMatchObject({ code: "REORDER_MISMATCH" });
  });

  it("batal wajib alasan, tidak dihapus, hilang dari rundown", async () => {
    await expect(svc.updatePerformer(calon, { status: "batal" }, owner())).rejects.toMatchObject({ code: "CANCEL_REASON_REQUIRED" });
    const row = await svc.updatePerformer(calon, { status: "batal", cancelReason: "Bentrok jadwal" }, owner());
    expect(row).toMatchObject({ status: "batal", cancelReason: "Bentrok jadwal" });
    const board = await svc.getLineupBoard(owner(), EVENT);
    expect(board.performers).toHaveLength(3);
    expect(board.rundown.map((r: any) => r.name)).not.toContain("Band Calon");
  });

  it("website hanya menerima penampil terkonfirmasi (nama event tanpa peduli huruf)", async () => {
    await svc.updatePerformer(surai, { showOnWebsite: true }, owner());
    const items = await svc.publicLineupFor("gigs akhir tahun 2026");
    expect(items).toEqual([
      { name: "Standup Indo Tebing Tinggi", kind: "standup", time: "19.30–20.00" },
      { name: "Surai", kind: "band", time: "20.00–20.30" },
    ]);
    // Data publik tanpa kontak/catatan.
    expect(Object.keys(items[0]).sort()).toEqual(["kind", "name", "time"]);
    await svc.updatePerformer(surai, { showOnWebsite: false }, owner());
    expect((await svc.publicLineupFor(EVENT)).map((i: any) => i.name)).toEqual(["Standup Indo Tebing Tinggi"]);
  });

  it("panitia + tugas: penanggung jawab harus panitia event yang sama, tugas terlambat terdeteksi, kesiapan naik", async () => {
    ketua = (await svc.createCrew({ eventName: EVENT, name: "Raka", role: "ketua", phone: "081255556666" }, owner())).id;
    await svc.createCrew({ eventName: EVENT, name: "Dina", role: "stage" }, owner());
    const lain = (await svc.createCrew({ eventName: "Event Lain", name: "Orang Lain", role: "ketua" }, owner())).id;
    await expect(svc.createTask({ eventName: EVENT, title: "Cek sound", crewId: lain }, owner())).rejects.toMatchObject({ code: "CREW_OTHER_EVENT" });
    const task = await svc.createTask({ eventName: EVENT, title: "Konfirmasi tech rider", crewId: ketua, dueDate: "2020-01-01", priority: "tinggi" }, owner());
    let board = await svc.getLineupBoard(owner(), EVENT);
    expect(board.tasks[0]).toMatchObject({ overdue: true, crewName: "Raka" });
    expect(board.crew.find((c: any) => c.id === ketua).openTasks).toBe(1);
    const done = await svc.updateTask(task.id, { status: "selesai" }, owner());
    expect(done.doneAt).toBeTruthy();
    board = await svc.getLineupBoard(owner(), EVENT);
    expect(board.readiness.items.find((i: any) => i.key === "tugas").done).toBe(true);
    expect(board.readiness.items.find((i: any) => i.key === "ketua").done).toBe(true);
    expect(board.events).toEqual(expect.arrayContaining([EVENT, "Event Lain"]));
  });

  it("setiap perubahan tercatat di audit log", async () => {
    const rows = await t.getDb().select().from(t.schema.auditLogs);
    const lineup = rows.filter((r: any) => (r.metadata as any)?.module === "event-lineup");
    expect(lineup.some((r: any) => /Status penampil → batal/.test(r.action) && (r.metadata as any).reason === "Bentrok jadwal")).toBe(true);
    expect(lineup.some((r: any) => r.action === "Atur urutan lineup")).toBe(true);
  });
});

describe("Lineup & Panitia — pengingat tugas panitia", () => {
  it("tenggat besok → 1 pengingat ke Owner aktif, diulang tidak dobel; selesai tidak diingatkan", async () => {
    const now = new Date("2026-11-20T03:00:00Z"); // 10.00 WIB, 20 Nov
    await t.getDb().insert(t.schema.staffProfiles).values({ userId: OWNER, role: "Owner", outletId, shiftLabel: "Pagi", deviceLabel: "Laptop Owner" } as any).onConflictDoNothing();
    const crew = (await svc.createCrew({ eventName: EVENT, name: "Sinta", role: "logistik" }, owner())).id;
    const open = await svc.createTask({ eventName: EVENT, title: "Sewa genset", crewId: crew, dueDate: "2026-11-21" }, owner());
    const finished = await svc.createTask({ eventName: EVENT, title: "Cetak banner", dueDate: "2026-11-21" }, owner());
    await svc.updateTask(finished.id, { status: "selesai" }, owner());
    const first = await svc.sweepLineupTaskReminders(now);
    const again = await svc.sweepLineupTaskReminders(now);
    expect(again.sent).toBe(0);
    const rows = (await t.getDb().select().from(t.schema.staffNotifications)).filter((r: any) => r.kind === "lineup_task_reminder");
    const forOpen = rows.filter((r: any) => r.dedupKey?.includes(open.id));
    expect(forOpen).toHaveLength(1);
    expect(forOpen[0]).toMatchObject({ audience: "user", userId: OWNER, title: "Tugas panitia tenggat besok: Sewa genset" });
    expect(forOpen[0].body).toContain("PIC Sinta");
    expect(forOpen[0].url).toBe(`/control/lineup?event=${encodeURIComponent(EVENT)}&tab=tugas`);
    expect(rows.some((r: any) => r.dedupKey?.includes(finished.id))).toBe(false);
    expect(first.sent).toBeGreaterThanOrEqual(1);
  });
});

describe("Lineup & Panitia — pengingat gagal disimpan", () => {
  it("kegagalan notifikasi dilempar (bukan dianggap dobel) supaya runMonitoredJob mencatatnya", async () => {
    await svc.createTask({ eventName: EVENT, title: "Briefing kru", dueDate: "2026-11-20" }, owner());
    vi.doMock("@/lib/staff-notifications", () => ({
      notifyStaff: async () => {
        throw new Error("db down");
      },
    }));
    try {
      await expect(svc.sweepLineupTaskReminders(new Date("2026-11-20T03:00:00Z"))).rejects.toThrow(/gagal disimpan.*db down/);
    } finally {
      vi.doUnmock("@/lib/staff-notifications");
    }
  });
});
