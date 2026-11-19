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
    // GIGS EO #9: Manajer boleh melihat papan, tetapi tidak menambah/mengubah data selain status tugas.
    await expect(svc.getLineupBoard(session("Manajer" as Role), EVENT)).resolves.toBeTruthy();
    await expect(svc.createPerformer({ eventName: EVENT, name: "X Band", kind: "band" }, session("Manajer" as Role))).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(svc.getLineupBoard(session("Kasir" as Role), EVENT)).rejects.toMatchObject({ code: "FORBIDDEN" });
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
      { name: "Standup Indo Tebing Tinggi", kind: "standup", time: "19.30–20.00", live: false, logo: null, tagline: null, instagram: null },
      { name: "Surai", kind: "band", time: "20.00–20.30", live: false, logo: null, tagline: null, instagram: "surai.band" },
    ]);
    // Data publik tanpa kontak/catatan.
    expect(Object.keys(items[0]).sort()).toEqual(["instagram", "kind", "live", "logo", "name", "tagline", "time"]);
    // Kustom kartu website: tagline + logo unggahan (hapus logo = null lagi).
    await svc.updatePerformer(surai, { tagline: "Underground Stage Unit", instagram: "https://instagram.com/surai.band" }, owner());
    await svc.setPerformerLogo(surai, "/garage-uploads/event-lineup/surai.webp", owner());
    expect((await svc.publicLineupFor(EVENT)).find((i: any) => i.name === "Surai")).toMatchObject({ tagline: "Underground Stage Unit", instagram: "surai.band", logo: "/garage-uploads/event-lineup/surai.webp" });
    await svc.setPerformerLogo(surai, null, owner());
    expect((await svc.publicLineupFor(EVENT)).find((i: any) => i.name === "Surai")?.logo).toBeNull();
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

  it("impor lineup platform GIGS: penampil baru dibuat, yang sudah ada tidak ditimpa (hanya logo kosong diisi)", async () => {
    const platformEvents = {
      events: [
        { slug: "lain", name: "Event Lain", promo: { lineup: [{ name: "Jangan Masuk", type: "band" }] } },
        {
          slug: "gigs-akhir-tahun-2026",
          name: "Gigs Akhir Tahun 2026",
          promo: {
            lineup: [
              { name: "SURAI", logo: "/event/uploads/surai.png", type: "band" },
              { name: "Lost Side", logo: "/event/uploads/lost-side.png", type: "band" },
              { name: "Komika Baru", type: "komika" },
              { name: "Logo Jahat", logo: "https://evil.test/x.png", type: "band" },
            ],
          },
        },
      ],
    };
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(platformEvents), { status: 200 })));
    try {
      const res = await svc.importPlatformLineup({ eventName: EVENT }, owner());
      expect(res.created).toEqual(["Lost Side", "Komika Baru", "Logo Jahat"]);
      expect(res.logoFilled).toEqual(["Surai"]);
      const board = await svc.getLineupBoard(owner(), EVENT);
      const lost = board.performers.find((p: any) => p.name === "Lost Side");
      expect(lost).toMatchObject({ status: "konfirmasi", kind: "band", logoUrl: "/event/uploads/lost-side.png", showOnWebsite: true });
      expect(board.performers.find((p: any) => p.name === "Komika Baru")).toMatchObject({ kind: "standup", logoUrl: null });
      // Logo dari luar /event/ tidak pernah dipakai.
      expect(board.performers.find((p: any) => p.name === "Logo Jahat").logoUrl).toBeNull();
      // Bebas diubah setelah impor (termasuk ganti nama, mis. SURAU → SURAI); impor ulang tidak menimpa dan tidak dobel.
      await svc.updatePerformer(lost.id, { name: "LOST SIDE OFFICIAL", tagline: "Heavy / Metallic Roster" }, owner());
      const again = await svc.importPlatformLineup({ eventName: EVENT }, owner());
      expect(again.created).toEqual([]);
      expect(again.skipped).toContain("LOST SIDE OFFICIAL");
      expect((await svc.getLineupBoard(owner(), EVENT)).performers.filter((p: any) => /lost side/i.test(p.name))).toHaveLength(1);
      const after = (await svc.getLineupBoard(owner(), EVENT)).performers.find((p: any) => p.id === lost.id);
      expect(after).toMatchObject({ name: "LOST SIDE OFFICIAL", tagline: "Heavy / Metallic Roster", platformName: "Lost Side" });
      await expect(svc.importPlatformLineup({ eventName: "Event Tidak Ada" }, owner())).rejects.toMatchObject({ code: "PLATFORM_EVENT_NOT_FOUND" });
    } finally {
      vi.unstubAllGlobals();
    }
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("fetch failed"); }));
    try {
      await expect(svc.importPlatformLineup({ eventName: EVENT }, owner())).rejects.toMatchObject({ code: "PLATFORM_UNREACHABLE" });
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("tempel daftar: satu baris salah = tidak ada yang disimpan; nama yang ada dilewati; panitia ikut", async () => {
    const before = (await svc.getLineupBoard(owner(), EVENT)).performers.length;
    await expect(
      svc.bulkPaste(
        { kind: "performer", eventName: EVENT, status: "konfirmasi", rows: [{ line: 2, name: "Band Baru A", kind: "band" }, { line: 3, name: "Band Baru B", kind: "band", contactPhone: "12" }] },
        owner(),
      ),
    ).rejects.toMatchObject({ code: "ROWS_INVALID" });
    expect((await svc.getLineupBoard(owner(), EVENT)).performers.length).toBe(before);

    const res = await svc.bulkPaste(
      {
        kind: "performer",
        eventName: EVENT,
        status: "konfirmasi",
        rows: [
          { line: 2, name: "Band Baru A", kind: "band", tagline: "Pop Punk", instagram: "@bandbarua", setStart: "22:00", setMinutes: 30 },
          { line: 3, name: "surai", kind: "band" },
        ],
      },
      owner(),
    );
    expect(res).toEqual({ created: ["Band Baru A"], skipped: ["surai"] });
    const a = (await svc.getLineupBoard(owner(), EVENT)).performers.find((p: any) => p.name === "Band Baru A");
    expect(a).toMatchObject({ status: "konfirmasi", tagline: "Pop Punk", instagram: "bandbarua", setStart: "22:00", setMinutes: 30, showOnWebsite: true });

    const crew = await svc.bulkPaste({ kind: "crew", eventName: EVENT, rows: [{ name: "Aress", role: "dokumentasi", phone: "081255556666" }, { name: "Raka", role: "ketua" }] }, owner());
    expect(crew.created).toEqual(["Aress"]);
    expect(crew.skipped).toEqual(["Raka"]);
    await expect(svc.bulkPaste({ kind: "crew", eventName: EVENT, rows: [{ name: "Siapa", role: "lainnya" }] }, session("Manajer" as Role))).rejects.toMatchObject({ code: "FORBIDDEN" });
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

describe("nama resmi talent (Owner 18 Nov 2026: platform menulis SURAU, resmi SURAI)", () => {
  it("impor dari platform yang masih 'SURAU' membuat/mengenali SURAI (nama asli platform disimpan) dan tidak dobel", async () => {
    const OTHER = "GIGS NAMA RESMI";
    const platform = { events: [{ slug: "gigs-nama-resmi", name: OTHER, promo: { lineup: [{ name: "SURAU", logo: "/event/uploads/surau.png", type: "band" }] } }] };
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(platform), { status: 200 })));
    try {
      const first = await svc.importPlatformLineup({ eventName: OTHER }, owner());
      expect(first.created).toEqual(["SURAI"]);
      const again = await svc.importPlatformLineup({ eventName: OTHER }, owner());
      expect(again.created).toEqual([]);
      const rows = (await t.getDb().select().from(t.schema.eventPerformers)).filter((r: any) => r.eventName === OTHER) as any[];
      expect(rows.map((r) => [r.name, r.platformName])).toEqual([["SURAI", "SURAU"]]);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("baris lama bernama 'SURAU' (dibuat sebelum koreksi) diganti SURAI saat impor ulang; nama lain tidak disentuh", async () => {
    const OTHER = "GIGS NAMA LAMA";
    await svc.createPerformer({ eventName: OTHER, name: "SURAU", kind: "band", status: "konfirmasi" } as any, owner());
    await svc.createPerformer({ eventName: OTHER, name: "Lost Side Band", kind: "band", status: "konfirmasi" } as any, owner());
    const platform = {
      events: [{ slug: "gigs-nama-lama", name: OTHER, promo: { lineup: [{ name: "SURAU", type: "band" }, { name: "LOST SIDE", type: "band" }] } }],
    };
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(platform), { status: 200 })));
    try {
      const res = await svc.importPlatformLineup({ eventName: OTHER }, owner());
      expect(res.renamed).toEqual(["SURAU → SURAI"]);
      const rows = (await t.getDb().select().from(t.schema.eventPerformers)).filter((r: any) => r.eventName === OTHER) as any[];
      const names = rows.map((r) => r.name).sort();
      expect(names).toEqual(["LOST SIDE", "Lost Side Band", "SURAI"].sort());
      expect(rows.find((r) => r.name === "SURAI")?.platformName).toBe("SURAU");
      const again = await svc.importPlatformLineup({ eventName: OTHER }, owner());
      expect(again.renamed).toEqual([]);
      expect(again.created).toEqual([]);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
