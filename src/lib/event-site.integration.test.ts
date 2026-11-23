import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import type { Role } from "@/lib/garage-data";
import type { GarageSession } from "@/lib/server-auth";
import { seedGarageBasics, setupGarageTestDb, teardownGarageTestDb, type GarageTestDb } from "@/lib/test-helpers/garage-test-db";

// Satu pintu halaman event (Owner 19 Nov 2026): halaman publik GIGS disajikan Garage OS, sisanya diteruskan ke platform;
// keputusan GO/NO GO & riwayat perubahan RAB dari Transparansi Garage OS.

/* eslint-disable @typescript-eslint/no-explicit-any */
let t: GarageTestDb;
let outletId = "";
let eventId = "";
const SLUG = "gigs-akhir-tahun-2026";
const OWNER = "user-itest-site-owner";
const owner = () =>
  ({
    user: { id: OWNER, name: "Owner Site" },
    profile: { id: "p-site", role: "Owner" as Role, shiftLabel: "Pagi", deviceLabel: "SITE", passwordResetRequired: false, outlet: { id: outletId, code: "TST", name: "Outlet", timezone: "Asia/Jakarta" } },
  }) as unknown as GarageSession;
const ctx = (path?: string[]) => ({ params: Promise.resolve({ path }) });
const slugCtx = { params: Promise.resolve({ slug: SLUG }) };
const req = (url: string, init?: RequestInit) => new Request(url, { headers: { "x-forwarded-for": `10.5.${Math.floor(Math.random() * 200)}.1` }, ...init });

beforeAll(async () => {
  process.env.BETTER_AUTH_SECRET ??= "test-secret-0123456789abcdef";
  t = await setupGarageTestDb();
  outletId = (await seedGarageBasics(t, { userId: OWNER })).outletId;
  const [row] = await t
    .getDb()
    .insert(t.schema.events)
    .values({ slug: "gigs-site", platformSlug: SLUG, title: "GIGS AKHIR TAHUN 2026", outletId, startsAt: new Date("2026-12-31T12:00:00Z"), endsAt: new Date("2026-12-31T18:00:00Z"), venueName: "Garage Coffee", address: "Jl. Contoh", mapsUrl: "https://maps.app.goo.gl/x", contactWhatsapp: "6281200000000", status: "published" } as any)
    .returning();
  eventId = row.id;
}, 60_000);

afterEach(() => vi.unstubAllGlobals());
afterAll(async () => {
  await teardownGarageTestDb(t);
});

describe("Halaman publik event dari Garage OS", () => {
  it("beranda, /daftar, /transparansi = salinan Garage OS (HTML), tanpa memanggil platform", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const { GET } = await import("@/app/event/[[...path]]/route");
    for (const path of [[SLUG], [SLUG, "daftar"], [SLUG, "transparansi"]]) {
      const res = await GET(req(`http://x/event/${path.join("/")}`), ctx(path));
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toContain("text/html");
      expect(await res.text()).toContain(`/event/${SLUG}`);
    }
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("selain halaman publik (Dashboard Penyelenggara, POST, event lain) → diteruskan ke platform apa adanya", async () => {
    const fetchSpy = vi.fn(async (url: string, init: RequestInit) => {
      const headers = new Headers({ "content-type": "application/json" });
      headers.append("set-cookie", "sid=abc; Path=/event; HttpOnly");
      return new Response(JSON.stringify({ url, method: init.method }), { status: 201, headers });
    });
    vi.stubGlobal("fetch", fetchSpy);
    const { GET, POST } = await import("@/app/event/[[...path]]/route");
    // Dashboard lama hanya lewat ?lama=1 (login untuk impor data lama).
    const dash = await GET(req(`http://x/event/${SLUG}/penyelenggara?lama=1`), ctx([SLUG, "penyelenggara"]));
    expect(dash.status).toBe(201);
    expect((await dash.json()).url).toBe(`http://garage-event-platform:4400/event/${SLUG}/penyelenggara?lama=1`);
    expect(dash.headers.get("set-cookie")).toContain("sid=abc");

    const login = await POST(req(`http://x/event/${SLUG}/api/admin/login`, { method: "POST", body: JSON.stringify({ pin: "1" }) }), ctx([SLUG, "api", "admin", "login"]));
    expect(await login.json()).toMatchObject({ method: "POST" });
    const other = await GET(req("http://x/event/event-lain"), ctx(["event-lain"]));
    expect((await other.json()).url).toBe("http://garage-event-platform:4400/event/event-lain");
  });

  it("Dashboard Penyelenggara → Ruang Panitia (302), tanpa memanggil platform; API penyelenggara tetap diteruskan", async () => {
    const fetchSpy = vi.fn(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchSpy);
    const { GET } = await import("@/app/event/[[...path]]/route");
    for (const url of [`http://x/event/${SLUG}/penyelenggara`, `http://x/event/event-lain/penyelenggara?tab=dana`]) {
      const res = await GET(req(url), ctx([new URL(url).pathname.split("/")[2], "penyelenggara"]));
      expect(res.status).toBe(302);
      expect(res.headers.get("location")).toBe("/panitia");
    }
    expect(fetchSpy).not.toHaveBeenCalled();
    await GET(req(`http://x/event/${SLUG}/api/organizer/ledger`), ctx([SLUG, "api", "organizer", "ledger"]));
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("platform mati → 502 dengan pesan, bukan error mentah", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("ECONNREFUSED 10.0.0.1"); }));
    const { GET } = await import("@/app/event/[[...path]]/route");
    const res = await GET(req(`http://x/event/${SLUG}/penyelenggara?lama=1`), ctx([SLUG, "penyelenggara"]));
    expect(res.status).toBe(502);
    expect(await res.text()).not.toContain("ECONNREFUSED");
  });

  it("app.js dari salinan Garage OS + koreksi (SURAU → SURAI), tanpa platform", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const { GET } = await import("@/app/api/public/gigs/[slug]/app-js/route");
    const res = await GET(req(`http://x/api/public/gigs/${SLUG}/app-js`), slugCtx);
    expect(res.status).toBe(200);
    const code = await res.text();
    expect(code.length).toBeGreaterThan(100_000);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe("Keputusan GO/NO GO & riwayat perubahan dari Transparansi Garage OS", () => {
  it("keputusan tampil di Kesiapan (tanpa catatan internal); waktu tetap selama keputusan sama", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("platform mati"); }));
    const pf = await import("@/lib/event-public-finance");
    const view = await pf.getPublicFinance(eventId, owner());
    const base = { ...view.data!, target: 10_000_000, budgetLines: [{ code: "01", name: "Band", budget: 3_000_000, purpose: "", pic: "", needsVendor: true, contracted: 0, stage: "belum-dipesan" as const }] };
    await pf.savePublicFinance(eventId, { enabled: true, data: { ...base, decision: { value: "go", note: "rahasia internal", decidedAt: null } } }, owner());
    const first = (await pf.getPublicFinance(eventId, owner())).data!.decision;
    expect(first.value).toBe("go");
    expect(first.decidedAt).toBeTruthy();

    const { GET } = await import("@/app/api/public/gigs/[slug]/readiness/route");
    const body = await (await GET(req(`http://x/api/public/gigs/${SLUG}/readiness`), slugCtx)).json();
    expect(body.decision).toMatchObject({ decision: "go" });
    expect(JSON.stringify(body)).not.toContain("rahasia internal");

    await pf.savePublicFinance(eventId, { enabled: true, data: { ...base, decision: { value: "go", note: "x", decidedAt: "2020-01-01T00:00:00.000Z" } } }, owner());
    expect((await pf.getPublicFinance(eventId, owner())).data!.decision.decidedAt).toBe(first.decidedAt);
  });

  it("ubah target & pos RAB → satu baris riwayat (dengan alasan); simpan tanpa perubahan RAB → tidak menambah; isian palsu diabaikan", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("platform mati"); }));
    const pf = await import("@/lib/event-public-finance");
    const data = (await pf.getPublicFinance(eventId, owner())).data!;
    const fake = [{ id: 99, area: "finance", summary: "palsu", reason: "", at: "2020-01-01 00:00:00" }];
    await pf.savePublicFinance(
      eventId,
      { enabled: true, changeReason: "Harga band naik", data: { ...data, changes: fake, target: 12_000_000, budgetLines: [{ ...data.budgetLines[0], name: "Band Lokal", budget: 3_500_000 }] } },
      owner(),
    );
    let saved = (await pf.getPublicFinance(eventId, owner())).data!;
    expect(saved.changes).toHaveLength(1);
    expect(saved.changes[0]).toMatchObject({ id: 1, area: "finance", reason: "Harga band naik" });
    expect(saved.changes[0].summary).toContain("Target 10.000.000 → 12.000.000");
    expect(saved.changes[0].summary).toContain('Pos 01 berganti nama "Band" → "Band Lokal"');

    await pf.savePublicFinance(eventId, { enabled: true, data: { ...saved, notes: ["catatan baru"] } }, owner());
    saved = (await pf.getPublicFinance(eventId, owner())).data!;
    expect(saved.changes).toHaveLength(1);

    const { GET } = await import("@/app/api/public/gigs/[slug]/changes/route");
    const body = await (await GET(req(`http://x/api/public/gigs/${SLUG}/changes`), slugCtx)).json();
    // Platform mati → riwayat platform lama dari salinan publik (id 6), riwayat Garage OS menyambung nomornya.
    expect(body.changes).toEqual([expect.objectContaining({ id: 6, at: "2026-11-17 15:34:53" }), expect.objectContaining({ id: 7, reason: "Harga band naik" })]);
  });
});

describe("Platform GIGS dimatikan (Owner 23 Nov 2026): salinan publik menjaga halaman event tetap jalan", () => {
  it("config, daftar event (beranda), peserta, kesiapan tetap terisi saat platform tidak terjangkau", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("getaddrinfo ENOTFOUND garage-event-platform"); }));
    const config = await (await import("@/app/api/public/gigs/[slug]/config/route")).GET(req(`http://x/api/public/gigs/${SLUG}/config`), slugCtx);
    expect(config.status).toBe(200);
    const body = await config.json();
    expect(body).toHaveProperty("event");
    expect(body).toHaveProperty("open");
    const { getGigsPromo } = await import("@/lib/gigs-promo");
    const promo = await getGigsPromo(Date.parse("2026-12-01T00:00:00Z"));
    expect(promo?.slug).toBe(SLUG);
    const parts = await (await import("@/app/api/public/gigs/[slug]/participants/route")).GET(req(`http://x/api/public/gigs/${SLUG}/participants`), slugCtx);
    expect(parts.status).toBe(200);
    const ready = await (await import("@/app/api/public/gigs/[slug]/readiness/route")).GET(req(`http://x/api/public/gigs/${SLUG}/readiness`), slugCtx);
    expect(ready.status).toBe(200);
  });

  it("salinan tidak menunjuk API platform (logo/aset sudah disalin ke Garage OS, tetap tampil saat platform mati)", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const raw = fs.readFileSync(path.join(process.cwd(), "src/data/event-platform-snapshot/snapshot.json"), "utf8");
    expect(raw).not.toMatch(/\/api\/public\/logo\//);
    for (const asset of raw.match(/\/event\/[a-z0-9-]+\/(official-assets|snapshot-assets)\/[^"?]+/g) ?? []) {
      expect(fs.existsSync(path.join(process.cwd(), "public", asset)), asset).toBe(true);
    }
  });

  it("lineup halaman event & daftar /event tetap jalan saat platform mati", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("ENOTFOUND"); }));
    const lineup = await (await import("@/app/api/public/gigs/[slug]/lineup/route")).GET(req(`http://x/api/public/gigs/${SLUG}/lineup`), slugCtx);
    expect(lineup.status).toBe(200);
    expect((await lineup.json()).slots.length).toBeGreaterThan(0);
    const { GET } = await import("@/app/event/[[...path]]/route");
    const list = await GET(req("http://x/event"), ctx([]));
    expect(list.status).toBe(302);
    expect(list.headers.get("location")).toBe(`/event/${SLUG}`);
  });

  it("impor RAB / lineup oleh Owner tetap jujur: platform tidak terjangkau → error, bukan salinan diam-diam", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("ENOTFOUND"); }));
    const { fetchPlatformLineup, fetchPlatformBudget } = await import("@/lib/gigs-promo");
    await expect(fetchPlatformLineup({ slug: SLUG, name: "" }, { useSnapshot: false })).rejects.toThrow();
    await expect(fetchPlatformBudget({ slug: SLUG, name: "" })).rejects.toThrow();
  });
});
