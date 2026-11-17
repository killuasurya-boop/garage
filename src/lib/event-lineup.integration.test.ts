import { afterAll, beforeAll, describe, expect, it } from "vitest";

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
      { name: "Standup Indo Tebing Tinggi", kind: "standup" },
      { name: "Surai", kind: "band" },
    ]);
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
