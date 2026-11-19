import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import type { Role } from "@/lib/garage-data";
import type { GarageSession } from "@/lib/server-auth";
import { seedGarageBasics, setupGarageTestDb, teardownGarageTestDb, type GarageTestDb } from "@/lib/test-helpers/garage-test-db";

// GIGS satu pintu (Owner 18 Nov 2026): pendaftaran form halaman event → Garage OS → Owner menyetujui.

/* eslint-disable @typescript-eslint/no-explicit-any */
let t: GarageTestDb;
let svc: any;
let outletId = "";
let event = { id: "", title: "GIGS DAFTAR" };
const OWNER = "user-itest-reg-owner";

function session(role: Role, extra: Record<string, unknown> = {}): GarageSession {
  return {
    user: { id: OWNER, name: `${role} Reg` },
    profile: { id: `rg-${OWNER}`, role, shiftLabel: "Pagi", deviceLabel: "REG", passwordResetRequired: false, outlet: { id: outletId, code: "TST", name: "Outlet Test", timezone: "Asia/Jakarta" }, ...extra },
  } as unknown as GarageSession;
}
const owner = () => session("Owner" as Role);

const creator = { type: "creator", name: "Band Daftar", pic: "Rudi", whatsapp: "0812 3456 7890", instagram: "@banddaftar", description: "Pop punk lokal", consent: true, category: "band", members: 4, portfolio: "https://instagram.com/banddaftar", tech: "2 mic", diet: "" };

beforeAll(async () => {
  process.env.BETTER_AUTH_SECRET ??= "test-secret-0123456789abcdef";
  t = await setupGarageTestDb();
  outletId = (await seedGarageBasics(t, { userId: OWNER })).outletId;
  const [row] = await t
    .getDb()
    .insert(t.schema.events)
    .values({ slug: "gigs-daftar", title: event.title, outletId, startsAt: new Date("2026-12-31T12:00:00Z"), endsAt: new Date("2026-12-31T18:00:00Z"), venueName: "Garage Coffee", address: "Jl. Contoh No. 1", mapsUrl: "https://maps.app.goo.gl/x", contactWhatsapp: "6281200000000", status: "published" } as any)
    .returning();
  event = { id: row.id, title: row.title };
  svc = await import("@/lib/event-registration-service");
}, 60_000);

afterAll(async () => {
  await teardownGarageTestDb(t);
});

describe("Pendaftaran publik (form halaman event)", () => {
  it("daftar → kode edit; cek dengan kode; kode salah ditolak; ubah → kembali diajukan; setlist", async () => {
    const created = await svc.registerPublic(event, creator);
    expect(created.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(created.code).toMatch(/^[0-9A-F]{12}$/);
    expect(created.entry).toMatchObject({ type: "creator", status: "diajukan", published: false, whatsapp: "6281234567890", instagram: "banddaftar", slot: null });
    const rows = await t.getDb().select().from(t.schema.eventRegistrations);
    expect(rows[0].codeHash).not.toContain(created.code);

    expect(await svc.lookupRegistration(event, created.id, created.code.toLowerCase())).toMatchObject({ name: "Band Daftar" });
    await expect(svc.lookupRegistration(event, created.id, "000000000000")).rejects.toMatchObject({ code: "WRONG_CODE" });
    // ID tidak dikenal Garage → null (route meneruskan ke platform)
    expect(await svc.lookupRegistration(event, "11111111-1111-4111-8111-111111111111", created.code)).toBeNull();

    const updated = await svc.updateRegistration(event, created.id, created.code, { ...creator, name: "Band Daftar Baru" });
    expect(updated).toMatchObject({ name: "Band Daftar Baru", status: "diajukan" });
    await expect(svc.updateRegistration(event, created.id, created.code, { ...creator, type: "crew", role: "Keamanan", attendance: "persiapan" })).rejects.toMatchObject({ code: "TYPE_LOCKED" });
    expect(await svc.saveRegistrationSetlist(event, created.id, created.code, [{ title: "Lagu Satu", writer: "Rudi", kind: "original" }])).toEqual({ setlist: [{ title: "Lagu Satu", writer: "Rudi", kind: "original" }] });
  });

  it("isian salah ditolak dengan pesan form (persetujuan, WA, logo rusak)", async () => {
    await expect(svc.registerPublic(event, { ...creator, consent: false })).rejects.toMatchObject({ code: "INVALID" });
    await expect(svc.registerPublic(event, { ...creator, whatsapp: "12345" })).rejects.toMatchObject({ code: "INVALID", message: expect.stringContaining("WhatsApp") });
    await expect(svc.registerPublic(event, { ...creator, logo: Buffer.from("bukan gambar").toString("base64") })).rejects.toMatchObject({ code: "LOGO_INVALID" });
  });
});

describe("Owner meninjau", () => {
  it("setujui kreator → penampil konfirmasi & tampil website (tertaut, tidak dobel); revisi/tolak wajib catatan", async () => {
    const [reg] = (await svc.listRegistrations(event.id, owner())).filter((r: any) => r.type === "creator");
    await expect(svc.decideRegistration(reg.id, { decision: "reject" }, owner())).rejects.toMatchObject({ code: "NOTE_REQUIRED" });
    await expect(svc.decideRegistration(reg.id, { decision: "approve" }, session("Manajer" as Role))).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(await svc.decideRegistration(reg.id, { decision: "approve" }, owner())).toMatchObject({ status: "disetujui" });
    const performers = (await t.getDb().select().from(t.schema.eventPerformers)).filter((p: any) => p.eventId === event.id);
    expect(performers).toHaveLength(1);
    expect(performers[0]).toMatchObject({ name: "Band Daftar Baru", kind: "band", status: "konfirmasi", showOnWebsite: true, instagram: "banddaftar" });
    // Setujui lagi → tidak membuat penampil kedua
    await svc.decideRegistration(reg.id, { decision: "approve" }, owner());
    expect((await t.getDb().select().from(t.schema.eventPerformers)).filter((p: any) => p.eventId === event.id)).toHaveLength(1);
  });

  it("sponsor → sponsor tampil website dengan nilai kesepakatan; kru → panitia peran dari bidang", async () => {
    const sponsor = await svc.registerPublic(event, { type: "sponsor", name: "Kopi Sponsor", pic: "Sari", whatsapp: "081200001111", instagram: "", description: "", consent: true, category: "kuliner", address: "Jl. Sudirman", amount: 500000 });
    await svc.decideRegistration(sponsor.id, { decision: "approve" }, owner());
    const sponsors = (await t.getDb().select().from(t.schema.eventSponsors)).filter((s: any) => s.eventId === event.id);
    expect(sponsors).toEqual([expect.objectContaining({ name: "Kopi Sponsor", agreedAmount: 500000, showOnWebsite: true })]);
    expect(await svc.lookupRegistration(event, sponsor.id, sponsor.code)).toMatchObject({ status: "disetujui", published: true });

    const crew = await svc.registerPublic(event, { type: "crew", name: "Andi Kru", pic: "Andi", whatsapp: "081200002222", instagram: "", description: "", consent: true, role: "Keamanan pintu", attendance: "hari-h-penuh", diet: "" });
    await svc.decideRegistration(crew.id, { decision: "revise", note: "Lengkapi nomor darurat" }, owner());
    expect(await svc.lookupRegistration(event, crew.id, crew.code)).toMatchObject({ status: "revisi", reviewNote: "Lengkapi nomor darurat" });
    await svc.decideRegistration(crew.id, { decision: "approve" }, owner());
    const crewRows = (await t.getDb().select().from(t.schema.eventCrew)).filter((c: any) => c.eventId === event.id);
    expect(crewRows).toEqual([expect.objectContaining({ name: "Andi Kru", role: "keamanan" })]);
  });

  it("panitia: hanya ketua/sekretaris event ini, tanpa kontak & nominal", async () => {
    await expect(svc.panitiaRegistrations(event.id, session("Panitia" as Role))).rejects.toMatchObject({ code: "FORBIDDEN" });
    await t.getDb().insert(t.schema.eventCrew).values({ eventId: event.id, eventName: event.title, name: "Ketua", role: "ketua", userId: OWNER, status: "aktif" } as any);
    const list = await svc.panitiaRegistrations(event.id, session("Panitia" as Role));
    expect(list.length).toBe(3);
    expect(Object.keys(list[0])).not.toEqual(expect.arrayContaining(["whatsapp", "amount", "address", "pic"]));
  });
});

describe("Transparansi dana publik (Owner 18 Nov 2026)", () => {
  it("Owner menyimpan bebas; halaman event memakai angka Garage hanya bila diaktifkan; Manajer ditolak", async () => {
    const pf = await import("@/lib/event-public-finance");
    const platform = { events: [{ slug: "gigs-daftar-platform", name: event.title, promo: { lineup: [] } }] };
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(platform), { status: 200 })));
    try {
      const data = {
        target: 5_000_000,
        notes: [],
        budgetLines: [{ code: "01", name: "Sound", budget: 3_000_000 }],
        incomes: [{ date: "2026-11-18", from: "Kopi Sponsor", amount: 750_000 }],
        expenses: [],
        committedCount: 1,
        committedAmount: 500_000,
      };
      await expect(pf.savePublicFinance(event.id, { enabled: true, data }, session("Manajer" as Role))).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(pf.savePublicFinance(event.id, { enabled: true, data: { ...data, target: -1 } }, owner())).rejects.toMatchObject({ code: "INVALID" });

      const off = await pf.savePublicFinance(event.id, { enabled: false, data }, owner());
      expect(off).toMatchObject({ enabled: false, saved: true, data: { target: 5_000_000 } });
      expect(await pf.publicFinanceForSlug("gigs-daftar-platform")).toBeNull();

      await pf.savePublicFinance(event.id, { enabled: true, data }, owner());
      const live = await pf.publicFinanceForSlug("gigs-daftar-platform");
      expect(live).toMatchObject({ target: 5_000_000, incomes: [{ amount: 750_000 }] });
      // Tidak ada baris buku kas yang dibuat.
      expect(await t.getDb().select().from(t.schema.cashLedgerEntries)).toHaveLength(0);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe("Halaman event dari Garage: peserta, kesiapan, laporan akhir (Owner 19 Nov 2026)", () => {
  it("peserta = sponsor tampil website + kreator disetujui; kesiapan dari data nyata; laporan hanya setelah terbit", async () => {
    const extras = await import("@/lib/event-public-extras");
    const [eventRow] = (await t.getDb().select().from(t.schema.events)).filter((e: any) => e.id === event.id);
    const p = await extras.garageParticipants(event.id);
    expect(p.creators.map((c: any) => c.name)).toEqual(["Band Daftar Baru"]);
    expect(p.creators[0]).toMatchObject({ category: "band", instagram: "banddaftar", portfolio: "https://www.instagram.com/banddaftar/" });
    expect(p.sponsors).toEqual([expect.objectContaining({ name: "Kopi Sponsor", category: "kuliner", support: "kas" })]);
    expect(JSON.stringify(p)).not.toContain("081200001111");

    const r = await extras.garageReadiness(eventRow);
    expect(r.components.find((c: any) => c.key === "dana")).toMatchObject({ available: true, percent: 15 });
    expect(r.gates[0].total).toBeGreaterThan(0);

    expect(await extras.garageCloseout(eventRow)).toBeNull();
    const pf = await import("@/lib/event-public-finance");
    const view = await pf.getPublicFinance(event.id, owner());
    if (!view.data) throw new Error("data transparansi harus ada untuk event ini");
    await pf.savePublicFinance(event.id, { enabled: true, data: { ...view.data, closeout: { ...view.data.closeout, published: true, evaluation: "Lancar", incidentsTotal: 1, incidentsResolved: 1 } } }, owner());
    const closeout = await extras.garageCloseout(eventRow);
    expect(closeout).toMatchObject({ event: { name: event.title }, finance: { income: 750_000, target: 5_000_000 }, evaluation: "Lancar", incidents: { total: 1, resolved: 1 } });
    expect(closeout!.publishedAt).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
  });
});

describe("Temuan review #250: revisi setelah disetujui, calon yang sudah ada, persetujuan bersamaan", () => {
  let ev = { id: "", title: "GIGS REVISI" };
  beforeAll(async () => {
    const [row] = await t
      .getDb()
      .insert(t.schema.events)
      .values({ slug: "gigs-revisi", title: ev.title, outletId, startsAt: new Date("2026-12-30T12:00:00Z"), endsAt: new Date("2026-12-30T18:00:00Z"), venueName: "Garage Coffee", address: "Jl. Contoh No. 1", mapsUrl: "https://maps.app.goo.gl/x", contactWhatsapp: "6281200000000", status: "published" } as any)
      .returning();
    ev = { id: row.id, title: row.title };
  });
  const performersOf = async () => (await t.getDb().select().from(t.schema.eventPerformers)).filter((p: any) => p.eventId === ev.id);

  it("revisi kreator/sponsor/kru yang disetujui lagi → data tertaut ikut diperbarui, field operasional tetap", async () => {
    const reg = await svc.registerPublic(ev, { ...creator, name: "Band Revisi" });
    await svc.decideRegistration(reg.id, { decision: "approve" }, owner());
    const [p0] = await performersOf();
    await t.getDb().update(t.schema.eventPerformers).set({ setStart: "21:00", notes: "Catatan Owner" } as any);
    await svc.updateRegistration(ev, reg.id, reg.code, { ...creator, name: "Band Revisi", whatsapp: "081299998888", instagram: "@bandrevisibaru", members: 5 });
    await svc.decideRegistration(reg.id, { decision: "approve" }, owner());
    const performers = await performersOf();
    expect(performers).toHaveLength(1);
    expect(performers[0]).toMatchObject({ id: p0.id, contactPhone: "081299998888", instagram: "bandrevisibaru", memberCount: 5, setStart: "21:00", notes: "Catatan Owner", status: "konfirmasi" });

    const sp = await svc.registerPublic(ev, { type: "sponsor", name: "Sponsor Revisi", pic: "Sari", whatsapp: "081200001111", instagram: "", description: "", consent: true, category: "kuliner", address: "Jl. A", amount: 300000 });
    await svc.decideRegistration(sp.id, { decision: "approve" }, owner());
    await svc.updateRegistration(ev, sp.id, sp.code, { type: "sponsor", name: "Sponsor Revisi", pic: "Sari", whatsapp: "081200001111", instagram: "", description: "", consent: true, category: "kuliner", address: "Jl. A", amount: 750000 });
    await svc.decideRegistration(sp.id, { decision: "approve" }, owner());
    const sponsors = (await t.getDb().select().from(t.schema.eventSponsors)).filter((s: any) => s.eventId === ev.id);
    expect(sponsors).toEqual([expect.objectContaining({ name: "Sponsor Revisi", agreedAmount: 750000 })]);

    const kru = { type: "crew", name: "Budi Kru", pic: "Budi", whatsapp: "081200003333", instagram: "", description: "", consent: true, role: "Keamanan", attendance: "hari-h-penuh", diet: "" };
    const cr = await svc.registerPublic(ev, kru);
    await svc.decideRegistration(cr.id, { decision: "approve" }, owner());
    await svc.updateRegistration(ev, cr.id, cr.code, { ...kru, whatsapp: "081200004444" });
    await svc.decideRegistration(cr.id, { decision: "approve" }, owner());
    const crew = (await t.getDb().select().from(t.schema.eventCrew)).filter((c: any) => c.eventId === ev.id);
    expect(crew).toEqual([expect.objectContaining({ name: "Budi Kru", phone: "081200004444", role: "keamanan" })]);
  });

  it("nama cocok dengan penampil calon yang belum tampil → disetujui = konfirmasi & tampil website", async () => {
    await t.getDb().insert(t.schema.eventPerformers).values({ eventId: ev.id, eventName: ev.title, name: "Calon Manual", kind: "band", status: "calon", showOnWebsite: false } as any);
    const reg = await svc.registerPublic(ev, { ...creator, name: "calon manual" });
    await svc.decideRegistration(reg.id, { decision: "approve" }, owner());
    const matched = (await performersOf()).filter((p: any) => p.name === "Calon Manual");
    expect(matched).toEqual([expect.objectContaining({ status: "konfirmasi", showOnWebsite: true })]);
    expect(await svc.lookupRegistration(ev, reg.id, reg.code)).toMatchObject({ status: "disetujui", published: true });
  });

  it("dua persetujuan bersamaan → satu sponsor saja, yang lain diminta muat ulang", async () => {
    const sp = await svc.registerPublic(ev, { type: "sponsor", name: "Sponsor Kembar", pic: "Tia", whatsapp: "081200005555", instagram: "", description: "", consent: true, category: "kuliner", address: "Jl. B", amount: 100000 });
    const results = await Promise.allSettled([svc.decideRegistration(sp.id, { decision: "approve" }, owner()), svc.decideRegistration(sp.id, { decision: "approve" }, owner())]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(results.find((r) => r.status === "rejected")).toMatchObject({ reason: expect.objectContaining({ code: "CONFLICT" }) });
    expect((await t.getDb().select().from(t.schema.eventSponsors)).filter((s: any) => s.name === "Sponsor Kembar")).toHaveLength(1);
  });
});
