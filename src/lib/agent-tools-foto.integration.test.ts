import { mkdtemp, readdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { eq, like } from "drizzle-orm";
import sharp from "sharp";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import type { Role } from "@/lib/garage-data";
import type { GarageSession } from "@/lib/server-auth";
import { seedGarageBasics, setupGarageTestDb, teardownGarageTestDb, type GarageTestDb } from "@/lib/test-helpers/garage-test-db";

// Unggah foto dari ChatGPT: siapkan_foto mengunduh HANYA dari host ChatGPT, memvalidasi isi
// sebagai gambar, dan menyimpannya sementara milik Owner; pasang_foto hanya jalan lewat
// preview → konfirmasi dan meneruskan multipart ke endpoint unggah dengan key sementara.

/* eslint-disable @typescript-eslint/no-explicit-any */
let t: GarageTestDb;
let outletId = "";
let storageDir = "";
const OWNER = "user-foto-owner";
const OWNER2 = "user-foto-owner2";
const MANAJER = "user-foto-manajer";
const ctx = { authorization: "", internalOrigin: "http://127.0.0.1:1", confirmFlow: true };
const SRC = "https://files.oaiusercontent.com/file-abc?sig=RAHASIA";

type Seen = { url: string; method: string; isForm: boolean; fields: Record<string, string>; imageType: string | null; imageBytes: number; scope: string | null };
let seen: Seen[] = [];
let png: Buffer;

function as(userId: string, role: Role, agentKey: unknown = null): GarageSession {
  return {
    user: { id: userId, name: `Nama ${userId}`, email: `${userId}@garage.id` },
    profile: {
      id: `sp-${userId}`,
      role,
      shiftLabel: "Pagi",
      deviceLabel: "ChatGPT",
      passwordResetRequired: false,
      outlet: { id: outletId, code: "TST", name: "Outlet Test", timezone: "Asia/Jakarta" },
      agentKey,
    },
  } as unknown as GarageSession;
}
const owner = () => as(OWNER, "Owner");

async function call(session: GarageSession, name: string, args: Record<string, unknown>, context: any = ctx) {
  const { runToolWithConfirmation } = await import("@/lib/mcp-confirmation");
  return (await runToolWithConfirmation({ session, name, rawArgs: args, ctx: context, oauthClientId: null })) as any;
}

/** Fetch palsu: host ChatGPT → gambar; origin internal → catat permintaan multipart. */
function stubFetch(options: { source?: (url: URL) => Response; internal?: () => Response } = {}) {
  vi.stubGlobal("fetch", async (input: string | URL, init: RequestInit = {}) => {
    const url = new URL(String(input));
    if (url.hostname !== "127.0.0.1") {
      seen.push({ url: url.toString(), method: "GET", isForm: false, fields: {}, imageType: null, imageBytes: 0, scope: null });
      return options.source ? options.source(url) : new Response(new Uint8Array(png), { headers: { "content-type": "image/png" } });
    }
    const bearer = /^Bearer\s+(\S+)$/.exec(new Headers(init.headers).get("authorization") ?? "")?.[1] ?? "";
    const { resolveAgentSession } = await import("@/lib/agent-api-key");
    const method = (init.method ?? "GET").toUpperCase();
    const resolved = await resolveAgentSession(bearer, new Headers({ "x-garage-agent-method": method, "x-garage-agent-path": url.pathname }));
    const form = init.body instanceof FormData ? init.body : null;
    const image = form?.get("image");
    seen.push({
      url: url.pathname,
      method,
      isForm: Boolean(form),
      fields: form ? Object.fromEntries([...form.entries()].filter(([, v]) => typeof v === "string") as [string, string][]) : {},
      imageType: image instanceof Blob ? image.type : null,
      imageBytes: image instanceof Blob ? image.size : 0,
      scope: resolved.data?.profile.agentKey?.scope ?? (resolved.response ? `DITOLAK ${resolved.response.status}` : null),
    });
    return options.internal ? options.internal() : Response.json({ data: { imageUrl: "/garage-uploads/menu/baru.webp" } }, { status: 201 });
  });
}

const staged = async () => (await readdir(path.join(storageDir, "storage", "garage-mcp-photos")).catch(() => [])).filter((n) => n.endsWith(".webp"));

beforeAll(async () => {
  storageDir = await mkdtemp(path.join(os.tmpdir(), "garage-foto-test-"));
  process.env.GARAGE_STORAGE_BASE_DIR = storageDir;
  png = await sharp({ create: { width: 64, height: 48, channels: 3, background: "#d11a2a" } }).png().toBuffer();
  t = await setupGarageTestDb();
  ({ outletId } = await seedGarageBasics(t, { userId: OWNER }));
  const d = t.getDb();
  await d
    .insert(t.schema.user)
    .values([
      { id: MANAJER, name: "Manajer", email: `${MANAJER}@garage.id` },
      { id: OWNER2, name: "Owner 2", email: `${OWNER2}@garage.id` },
    ])
    .onConflictDoNothing();
  await d
    .insert(t.schema.staffProfiles)
    .values([
      { userId: OWNER, outletId, role: "Owner", status: "active" },
      { userId: OWNER2, outletId, role: "Owner", status: "active" },
      { userId: MANAJER, outletId, role: "Manajer", status: "active" },
    ])
    .onConflictDoNothing();
  await d.update(t.schema.staffProfiles).set({ role: "Owner" }).where(eq(t.schema.staffProfiles.userId, OWNER));
}, 90_000);

afterEach(async () => {
  vi.unstubAllGlobals();
  seen = [];
  await rm(path.join(storageDir, "storage"), { recursive: true, force: true });
});

afterAll(async () => {
  delete process.env.GARAGE_STORAGE_BASE_DIR;
  if (t) await teardownGarageTestDb(t);
  await rm(storageDir, { recursive: true, force: true });
});

describe("siapkan_foto", () => {
  it("mengunduh dari host ChatGPT, encode ulang ke WebP, simpan sementara — tanpa mengubah data", async () => {
    stubFetch();
    const out = await call(owner(), "siapkan_foto", { foto: { download_url: SRC, file_id: "file_1" } });
    expect(out.fotoId).toMatch(/^[a-f0-9]{32}$/);
    expect(out.ukuran).toBe("64×48 px");
    expect(await staged()).toHaveLength(1);
    expect(seen.filter((s) => s.url.startsWith("/api"))).toHaveLength(0);
    expect(JSON.stringify(out)).not.toContain("RAHASIA");
  });

  it("menolak sumber di luar ChatGPT tanpa mengunduh (SSRF)", async () => {
    stubFetch();
    for (const url of ["https://127.0.0.1/x.png", "https://example.com/x.png", "http://files.oaiusercontent.com/x.png"]) {
      await expect(call(owner(), "siapkan_foto", { foto: { download_url: url } })).rejects.toMatchObject({ code: "FOTO_SUMBER_DITOLAK" });
    }
    expect(seen).toHaveLength(0);
  });

  it("redirect ke host lain ditolak", async () => {
    stubFetch({ source: () => new Response(null, { status: 302, headers: { location: "https://169.254.169.254/latest" } }) });
    await expect(call(owner(), "siapkan_foto", { foto: { download_url: SRC } })).rejects.toMatchObject({ code: "FOTO_SUMBER_DITOLAK" });
    expect(seen).toHaveLength(1);
  });

  it("isi bukan gambar ditolak walau content-type image", async () => {
    stubFetch({ source: () => new Response("<script>alert(1)</script>", { headers: { "content-type": "image/png" } }) });
    await expect(call(owner(), "siapkan_foto", { foto: { download_url: SRC } })).rejects.toMatchObject({ code: "FOTO_TIDAK_VALID" });
    expect(await staged()).toHaveLength(0);
  });

  it("SVG ditolak", async () => {
    stubFetch({ source: () => new Response('<svg xmlns="http://www.w3.org/2000/svg" width="4" height="4"/>', { headers: { "content-type": "image/svg+xml" } }) });
    await expect(call(owner(), "siapkan_foto", { foto: { download_url: SRC } })).rejects.toMatchObject({ code: expect.stringMatching(/^FOTO_/) });
  });

  it("lebih dari 8 MB ditolak", async () => {
    stubFetch({ source: () => new Response(new Uint8Array(8 * 1024 * 1024 + 1), { headers: { "content-type": "image/png" } }) });
    await expect(call(owner(), "siapkan_foto", { foto: { download_url: SRC } })).rejects.toMatchObject({ code: "FOTO_TERLALU_BESAR" });
  });

  it("hanya Owner; Manajer & API key agent ditolak; tidak ada di pintu tanpa konfirmasi", async () => {
    stubFetch();
    await expect(call(as(MANAJER, "Manajer"), "siapkan_foto", { foto: { download_url: SRC } })).rejects.toMatchObject({ status: 403 });
    await expect(call(as(OWNER, "Owner", { scope: "owner" }), "siapkan_foto", { foto: { download_url: SRC } })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(call(owner(), "siapkan_foto", { foto: { download_url: SRC } }, { ...ctx, confirmFlow: false })).rejects.toMatchObject({ code: "UNKNOWN_TOOL" });
    expect(seen).toHaveLength(0);
  });
});

describe("pasang_foto", () => {
  async function stage() {
    return (await call(owner(), "siapkan_foto", { foto: { download_url: SRC } })).fotoId as string;
  }

  it("preview dulu, lalu konfirmasi → multipart ke endpoint unggah dengan key sementara yang dicabut", async () => {
    stubFetch();
    const fotoId = await stage();
    const args = { fotoId, tujuan: "produk_menu", id: "itm-1", alasan: "foto baru" };
    const preview = await call(owner(), "pasang_foto", args);
    expect(preview.status).toBe("PERLU_KONFIRMASI");
    expect(seen.filter((s) => s.method === "POST")).toHaveLength(0);

    const done = await call(owner(), "pasang_foto", { ...args, konfirmasi: preview.konfirmasi });
    expect(done.status).toBe("BERHASIL");
    expect(done.hasil.fotoBaru).toBe("/garage-uploads/menu/baru.webp");
    const post = seen.find((s) => s.method === "POST")!;
    expect(post).toMatchObject({ url: "/api/menu/itm-1/image", isForm: true, imageType: "image/webp", scope: "owner" });
    expect(post.imageBytes).toBeGreaterThan(0);
    expect(await staged()).toHaveLength(0);
    const keys = await t.getDb().select().from(t.schema.agentApiKeys).where(like(t.schema.agentApiKeys.label, "ChatGPT·op %"));
    expect(keys.length).toBeGreaterThan(0);
    expect(keys.every((k: any) => k.revokedAt)).toBe(true);
  });

  it("foto suasana membawa slot; argumen berubah setelah preview ditolak", async () => {
    stubFetch({ internal: () => Response.json({ data: { publicUrl: "/garage-uploads/landing/s.webp" } }, { status: 201 }) });
    const fotoId = await stage();
    const args = { fotoId, tujuan: "suasana_website", slot: 2, alasan: "suasana bar" };
    const preview = await call(owner(), "pasang_foto", args);
    await expect(call(owner(), "pasang_foto", { ...args, slot: 3, konfirmasi: preview.konfirmasi })).rejects.toMatchObject({ code: "CONFIRMATION_ARGS_CHANGED" });
    const again = await call(owner(), "pasang_foto", args);
    const done = await call(owner(), "pasang_foto", { ...args, konfirmasi: again.konfirmasi });
    expect(seen.find((s) => s.method === "POST")).toMatchObject({ url: "/api/site/landing-hero", fields: { slot: "suasana_2" } });
    expect(done.hasil.fotoBaru).toBe("/garage-uploads/landing/s.webp");
  });

  it("foto milik Owner lain tidak bisa dipasang", async () => {
    stubFetch();
    const fotoId = await stage();
    const args = { fotoId, tujuan: "hero_website", alasan: "coba" };
    const preview = await call(as(OWNER2, "Owner"), "pasang_foto", args);
    expect(JSON.stringify(preview.ringkasan)).toContain("TIDAK DITEMUKAN");
    await expect(call(as(OWNER2, "Owner"), "pasang_foto", { ...args, konfirmasi: preview.konfirmasi })).rejects.toMatchObject({ code: "FOTO_TIDAK_DITEMUKAN" });
    expect(seen.filter((s) => s.method === "POST")).toHaveLength(0);
    expect(await staged()).toHaveLength(1);
  });

  it("id berisi jalur ditolak sebelum ada permintaan; error route diteruskan & foto tetap tersimpan", async () => {
    stubFetch({ internal: () => Response.json({ error: { code: "MENU_IMAGE_SAVE_FAILED", message: "Produk tidak ditemukan." } }, { status: 400 }) });
    const fotoId = await stage();
    await expect(call(owner(), "pasang_foto", { fotoId, tujuan: "produk_menu", id: "../orders/1/void", alasan: "coba" })).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    const args = { fotoId, tujuan: "produk_menu", id: "tidak-ada", alasan: "coba" };
    const preview = await call(owner(), "pasang_foto", args);
    await expect(call(owner(), "pasang_foto", { ...args, konfirmasi: preview.konfirmasi })).rejects.toMatchObject({ code: "MENU_IMAGE_SAVE_FAILED" });
    expect(await staged()).toHaveLength(1);
  });

  it("Manajer ditolak", async () => {
    stubFetch();
    await expect(call(as(MANAJER, "Manajer"), "pasang_foto", { fotoId: "a".repeat(32), tujuan: "hero_website", alasan: "coba" })).rejects.toMatchObject({ status: 403 });
  });
});
