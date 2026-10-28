import { eq, like } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import type { Role } from "@/lib/garage-data";
import type { GarageSession } from "@/lib/server-auth";
import { seedGarageBasics, setupGarageTestDb, teardownGarageTestDb, type GarageTestDb } from "@/lib/test-helpers/garage-test-db";

// Tulis universal MCP ChatGPT: ubah_data_garage hanya jalan lewat preview →
// konfirmasi Owner; route dipanggil dengan API key sementara (scope owner) yang
// langsung dicabut; path kritis/terlarang ditolak; garage_api membaca lewat key
// baca-saja. Fetch internal di-stub: yang diuji adalah key & permintaan yang dikirim.

/* eslint-disable @typescript-eslint/no-explicit-any */
let t: GarageTestDb;
let outletId = "";
const OWNER = "user-ubah-owner";
const MANAJER = "user-ubah-manajer";
const ctx = { authorization: "", internalOrigin: "http://127.0.0.1:1", confirmFlow: true };

type Seen = { method: string; path: string; body: unknown; scope: string | null; role: string | null };
let seen: Seen[] = [];

function as(userId: string, role: Role): GarageSession {
  return {
    user: { id: userId, name: `Nama ${userId}`, email: `${userId}@garage.id` },
    profile: {
      id: `sp-${userId}`,
      role,
      shiftLabel: "Pagi",
      deviceLabel: "ChatGPT",
      passwordResetRequired: false,
      outlet: { id: outletId, code: "TST", name: "Outlet Test", timezone: "Asia/Jakarta" },
      agentKey: null,
    },
  } as unknown as GarageSession;
}
const owner = () => as(OWNER, "Owner");

async function call(session: GarageSession, name: string, args: Record<string, unknown>, context: any = ctx) {
  const { runToolWithConfirmation } = await import("@/lib/mcp-confirmation");
  return (await runToolWithConfirmation({ session, name, rawArgs: args, ctx: context, oauthClientId: null })) as any;
}

function stubInternalApi(reply: (input: Seen) => Response = () => Response.json({ data: { ok: true } })) {
  vi.stubGlobal("fetch", async (input: string | URL, init: RequestInit = {}) => {
    const url = new URL(String(input));
    const method = (init.method ?? "GET").toUpperCase();
    const bearer = /^Bearer\s+(\S+)$/.exec(new Headers(init.headers).get("authorization") ?? "")?.[1] ?? "";
    // Key harus benar-benar bisa dipakai requireGarageSession saat request berlangsung.
    const { resolveAgentSession } = await import("@/lib/agent-api-key");
    const headers = new Headers({ "x-garage-agent-method": method, "x-garage-agent-path": url.pathname });
    const resolved = await resolveAgentSession(bearer, headers);
    const entry: Seen = {
      method,
      path: url.pathname,
      body: init.body ? JSON.parse(String(init.body)) : undefined,
      scope: resolved.data?.profile.agentKey?.scope ?? null,
      role: resolved.data?.profile.role ?? (resolved.response ? `DITOLAK ${resolved.response.status}` : null),
    };
    seen.push(entry);
    return reply(entry);
  });
}

async function delegatedKeys() {
  return t.getDb().select().from(t.schema.agentApiKeys).where(like(t.schema.agentApiKeys.label, "ChatGPT·op %"));
}

beforeAll(async () => {
  t = await setupGarageTestDb();
  ({ outletId } = await seedGarageBasics(t, { userId: OWNER }));
  const d = t.getDb();
  await d.insert(t.schema.user).values({ id: MANAJER, name: "Manajer", email: `${MANAJER}@garage.id` }).onConflictDoNothing();
  await d
    .insert(t.schema.staffProfiles)
    .values([
      { userId: OWNER, outletId, role: "Owner", status: "active" },
      { userId: MANAJER, outletId, role: "Manajer", status: "active" },
    ])
    .onConflictDoNothing();
  await d.update(t.schema.staffProfiles).set({ role: "Owner" }).where(eq(t.schema.staffProfiles.userId, OWNER));
}, 90_000);

afterEach(() => {
  vi.unstubAllGlobals();
  seen = [];
});

afterAll(async () => {
  if (t) await teardownGarageTestDb(t);
});

describe("ubah_data_garage (tulis universal, Owner via ChatGPT)", () => {
  it("preview tidak memanggil route; konfirmasi menjalankan dengan key owner sementara yang lalu dicabut", async () => {
    stubInternalApi();
    const args = { method: "PATCH", path: "/api/menu/itm-1", body: { name: "Latte Baru" }, alasan: "Ganti nama menu" };
    const preview = await call(owner(), "ubah_data_garage", args);
    expect(preview.status).toBe("PERLU_KONFIRMASI");
    expect(preview.ringkasan.aksi).toBe("PATCH /api/menu/itm-1");
    // Preview hanya boleh membaca (GET dengan key baca-saja), tidak pernah PATCH.
    expect(seen.every((entry) => entry.method === "GET" && entry.scope === "readonly")).toBe(true);
    seen = [];

    const done = await call(owner(), "ubah_data_garage", { ...args, konfirmasi: preview.konfirmasi });
    expect(done.status).toBe("BERHASIL");
    expect(seen).toEqual([{ method: "PATCH", path: "/api/menu/itm-1", body: { name: "Latte Baru" }, scope: "owner", role: "Owner" }]);
    const keys = await delegatedKeys();
    expect(keys.length).toBeGreaterThan(0);
    expect(keys.every((key: any) => key.revokedAt)).toBe(true);

    // Token sekali pakai.
    await expect(call(owner(), "ubah_data_garage", { ...args, konfirmasi: preview.konfirmasi })).rejects.toMatchObject({ code: "CONFIRMATION_USED" });
  });

  it("error route dikembalikan apa adanya dan operasi tercatat gagal", async () => {
    stubInternalApi(() => Response.json({ error: { code: "VALIDATION_ERROR", message: "Harga wajib angka." } }, { status: 400 }));
    const args = { method: "POST", path: "/api/menu", body: { price: "x" }, alasan: "Tambah menu" };
    const preview = await call(owner(), "ubah_data_garage", args);
    await expect(call(owner(), "ubah_data_garage", { ...args, konfirmasi: preview.konfirmasi })).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
      message: "Harga wajib angka.",
    });
    const op = await t.getDb().select().from(t.schema.mcpOperations).where(eq(t.schema.mcpOperations.id, preview.operasiId));
    expect(op[0].status).toBe("failed");
  });

  it("path kritis/terlarang ditolak saat eksekusi walau sudah dikonfirmasi", async () => {
    stubInternalApi();
    for (const path of ["/api/agent-keys", "/api/finance/closing/daily", "/api/admin/users/u1/pin", "/api/products/bulk", "/api/account/password"]) {
      const args = { method: "POST", path, body: {}, alasan: "coba" };
      const preview = await call(owner(), "ubah_data_garage", args);
      expect(preview.ringkasan.DITOLAK).toBeTruthy();
      await expect(call(owner(), "ubah_data_garage", { ...args, konfirmasi: preview.konfirmasi })).rejects.toMatchObject({ code: "UBAH_DATA_DITOLAK" });
    }
    expect(seen.filter((entry) => entry.method !== "GET")).toEqual([]);
  });

  it("endpoint/method tak dikenal ditolak; Manajer & pintu tanpa konfirmasi tidak bisa", async () => {
    stubInternalApi();
    const unknown = { method: "POST", path: "/api/tidak-ada", body: {}, alasan: "coba" };
    const preview = await call(owner(), "ubah_data_garage", unknown);
    await expect(call(owner(), "ubah_data_garage", { ...unknown, konfirmasi: preview.konfirmasi })).rejects.toMatchObject({ code: "ENDPOINT_TIDAK_DIKENAL" });

    await expect(call(as(MANAJER, "Manajer"), "ubah_data_garage", { method: "PATCH", path: "/api/menu/x", alasan: "coba" })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });

    // REST agent / MCP API key (tanpa alur konfirmasi): tool tidak ada.
    const { listAgentTools, runAgentTool } = await import("@/lib/agent-tools");
    expect(listAgentTools(owner()).map((tool) => tool.name)).not.toContain("ubah_data_garage");
    expect(listAgentTools(owner(), { includeConfirmOnly: true }).map((tool) => tool.name)).toContain("ubah_data_garage");
    await expect(
      runAgentTool(owner(), "ubah_data_garage", { method: "PATCH", path: "/api/menu/x", alasan: "coba" }, { authorization: "", internalOrigin: ctx.internalOrigin }),
    ).rejects.toMatchObject({ code: "UNKNOWN_TOOL" });
    // Bahkan di pintu konfirmasi, menjalankan langsung tanpa token ditolak.
    await expect(runAgentTool(owner(), "ubah_data_garage", { method: "PATCH", path: "/api/menu/x", alasan: "coba" }, ctx)).rejects.toMatchObject({
      code: "CONFIRMATION_REQUIRED",
    });
    expect(seen.filter((entry) => entry.method !== "GET")).toEqual([]);
  });

  it("garage_api di MCP ChatGPT membaca lewat key baca-saja; key sementara tidak tampil di daftar key", async () => {
    stubInternalApi(() => Response.json({ data: [{ id: 1 }] }));
    const result = await call(owner(), "garage_api", { path: "/api/orders" });
    expect(result).toMatchObject({ status: 200, json: { data: [{ id: 1 }] } });
    expect(seen).toEqual([{ method: "GET", path: "/api/orders", body: undefined, scope: "readonly", role: "Owner" }]);
    const { listAgentKeys } = await import("@/lib/agent-api-key");
    expect((await listAgentKeys()).some((key) => key.label.startsWith("ChatGPT·op"))).toBe(false);
  });

  it("katalog_endpoint menandai endpoint yang diblokir", async () => {
    const result = await call(owner(), "katalog_endpoint", { cari: "agent-keys" });
    expect(result.endpoint.length).toBeGreaterThan(0);
    expect(result.endpoint.every((row: any) => row.diblokir)).toBe(true);
    const menu = await call(owner(), "katalog_endpoint", { cari: "/api/menu" });
    expect(menu.endpoint.some((row: any) => !row.diblokir && row.methods.includes("POST"))).toBe(true);
  });
});
