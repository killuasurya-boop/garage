import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { GarageSession } from "@/lib/server-auth";
import {
  seedGarageBasics,
  setupGarageTestDb,
  teardownGarageTestDb,
  type GarageTestDb,
} from "@/lib/test-helpers/garage-test-db";

// =============================================================================
// API key agent AI: buat/simpan hash, sesi sintetis per scope, cabut/kedaluwarsa,
// path terlarang, baca-saja, tool & MCP, jejak Audit atas nama agent.
// =============================================================================

/* eslint-disable @typescript-eslint/no-explicit-any */
let t: GarageTestDb;
let keys: typeof import("@/lib/agent-api-key");
let tools: typeof import("@/lib/agent-tools");
let mcp: typeof import("@/lib/agent-mcp");
let outletId = "";
const OWNER = "user-agent-owner";
const ctx = { authorization: "", internalOrigin: "http://127.0.0.1:1" };

function ownerSession(): GarageSession {
  return {
    session: {} as GarageSession["session"],
    user: { id: OWNER, name: "Owner Garage" } as GarageSession["user"],
    profile: {
      id: "sp-owner",
      role: "Owner",
      shiftLabel: "Pagi",
      deviceLabel: "Laptop Owner",
      passwordResetRequired: false,
      outlet: { id: outletId, code: "TST", name: "Outlet Test", timezone: "Asia/Jakarta" },
    },
  } as GarageSession;
}

function req(key: string, method = "GET", path = "/api/agent/v1/me") {
  return new Headers({ authorization: `Bearer ${key}`, "x-garage-agent-method": method, "x-garage-agent-path": path });
}

beforeAll(async () => {
  t = await setupGarageTestDb();
  ({ outletId } = await seedGarageBasics(t, { userId: OWNER }));
  await t.getDb().insert(t.schema.staffProfiles).values({ userId: OWNER, role: "Owner", outletId, shiftLabel: "Pagi", deviceLabel: "Laptop Owner" } as any).onConflictDoNothing();
  keys = await import("@/lib/agent-api-key");
  tools = await import("@/lib/agent-tools");
  mcp = await import("@/lib/agent-mcp");
}, 60_000);

afterAll(async () => {
  await teardownGarageTestDb(t);
});

describe("API key agent", () => {
  it("dibuat oleh Owner; DB hanya menyimpan hash; sesi sintetis atas nama agent", async () => {
    const created = await keys.createAgentKey({ label: "OpenClaw WA", scope: "owner", expiresInDays: 90 }, ownerSession());
    expect(created.key).toMatch(/^gk_agent_[0-9A-Za-z]{40}$/);
    const [row] = await t.getDb().select().from(t.schema.agentApiKeys);
    expect(row.keyHash).toBe(keys.hashAgentKey(created.key));
    expect(JSON.stringify(row)).not.toContain(created.key);

    const resolved = await keys.resolveAgentSession(created.key, req(created.key));
    expect(resolved.response).toBeNull();
    expect(resolved.data?.profile).toMatchObject({ role: "Owner", deviceLabel: "agent:OpenClaw WA", agentKey: { scope: "owner", label: "OpenClaw WA" } });
    expect(resolved.data?.user.name).toBe("Staff Test · Agent OpenClaw WA");
    expect(resolved.data?.profile.outlet.id).toBe(outletId);

    // Nama sama yang masih aktif ditolak; agent tidak boleh membuat key.
    await expect(keys.createAgentKey({ label: "OpenClaw WA", scope: "owner", expiresInDays: 30 }, ownerSession())).rejects.toThrow(/sudah ada/);
    await expect(keys.createAgentKey({ label: "Lain", scope: "owner", expiresInDays: 30 }, resolved.data!)).rejects.toThrow(/Owner/);
  });

  it("key salah / path non-API / path terlarang / Bearer biasa ditolak", async () => {
    const { key } = await keys.createAgentKey({ label: "Hermes TG", scope: "manajer", expiresInDays: null }, ownerSession());
    expect((await keys.resolveAgentSession("gk_agent_salah", req("gk_agent_salah"))).response?.status).toBe(401);
    const noApi = new Headers({ authorization: `Bearer ${key}` });
    expect((await keys.resolveAgentSession(key, noApi)).response?.status).toBe(401);
    expect((await keys.resolveAgentSession(key, req(key, "POST", "/api/agent-keys"))).response?.status).toBe(403);
    expect((await keys.resolveAgentSession(key, req(key, "GET", "/api/auth/get-session"))).response?.status).toBe(403);
    expect(keys.extractAgentKey(new Headers({ authorization: "Bearer token-lain" }))).toBeNull();
    expect(keys.extractAgentKey(new Headers({ "x-garage-agent-key": key }))).toBe(key);
    // Scope manajer = role Manajer; rute khusus Owner ditolak.
    const manajer = await keys.resolveAgentSession(key, req(key, "POST", "/api/orders"));
    expect(manajer.data?.profile.role).toBe("Manajer");
    expect((await keys.resolveAgentSession(key, req(key), ["Owner"])).response?.status).toBe(403);
  });

  it("baca-saja: hanya GET + izin :read; tool tulis ditolak", async () => {
    const { key } = await keys.createAgentKey({ label: "Laporan saja", scope: "readonly", expiresInDays: 30 }, ownerSession());
    expect((await keys.resolveAgentSession(key, req(key, "POST", "/api/expenses"))).response?.status).toBe(403);
    expect((await keys.resolveAgentSession(key, req(key, "POST", "/api/mcp"))).response?.status).toBe(403);
    const session = (await keys.resolveAgentSession(key, req(key, "GET", "/api/agent/v1/tools/laporan_penjualan"))).data!;
    const { canUseApiAs } = await import("@/lib/role-access");
    expect(canUseApiAs(session.profile, "finance:read")).toBe(true);
    expect(canUseApiAs(session.profile, "finance:write")).toBe(false);
    const names = tools.listAgentTools(session).map((tool) => tool.name);
    expect(names).toContain("laporan_penjualan");
    expect(names).not.toContain("catat_pengeluaran");
    await expect(tools.runAgentTool(session, "catat_pengeluaran", { kategori: "Operasional", deskripsi: "x", nominal: 1000 }, ctx)).rejects.toMatchObject({ code: "AGENT_READONLY" });
    await expect(tools.runAgentTool(session, "garage_api", { method: "POST", path: "/api/expenses" }, ctx)).rejects.toMatchObject({ code: "VALIDATION_ERROR" }); // D-10: GET saja
    const report = (await tools.runAgentTool(session, "laporan_penjualan", {}, ctx)) as any;
    expect(report.summary).toBeTruthy();
  });

  it("dicabut / kedaluwarsa / Owner nonaktif → 401", async () => {
    const owner = ownerSession();
    const a = await keys.createAgentKey({ label: "Cabut saya", scope: "owner", expiresInDays: 30 }, owner);
    await keys.revokeAgentKey(a.id, owner);
    expect((await keys.resolveAgentSession(a.key, req(a.key))).response?.status).toBe(401);
    await expect(keys.revokeAgentKey(a.id, owner)).rejects.toThrow(/sudah dicabut/);

    const b = await keys.createAgentKey({ label: "Kedaluwarsa", scope: "owner", expiresInDays: 30 }, owner);
    const { eq } = await import("drizzle-orm");
    await t.getDb().update(t.schema.agentApiKeys).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(t.schema.agentApiKeys.id, b.id));
    const expired = await keys.resolveAgentSession(b.key, req(b.key));
    expect(expired.response?.status).toBe(401);
    expect(await expired.response!.json()).toMatchObject({ error: { code: "AGENT_KEY_EXPIRED" } });

    const list = await keys.listAgentKeys();
    expect(list.find((k) => k.id === a.id)?.status).toBe("dicabut");
    expect(list.find((k) => k.id === b.id)?.status).toBe("kedaluwarsa");
  });

  it("tool tulis tercatat atas nama agent; buat_laporan menghasilkan file; MCP JSON-RPC", async () => {
    const { key } = await keys.createAgentKey({ label: "Agent Kas", scope: "owner", expiresInDays: 30 }, ownerSession());
    const session = (await keys.resolveAgentSession(key, req(key, "POST", "/api/mcp"))).data!;
    const expense = (await tools.runAgentTool(session, "catat_pengeluaran", { kategori: "Operasional", deskripsi: "Gas LPG", nominal: 25_000, metodeBayar: "Cash" }, ctx)) as any;
    expect(expense.amount).toBe(25_000);
    const { like } = await import("drizzle-orm");
    await new Promise((r) => setTimeout(r, 50));
    const logs = await t.getDb().select().from(t.schema.auditLogs).where(like(t.schema.auditLogs.actor, "%Agent Agent Kas%"));
    expect(logs.length).toBeGreaterThanOrEqual(1);

    const file = (await tools.runAgentTool(session, "buat_laporan", { modul: "penjualan", format: "pdf" }, ctx)) as any;
    expect(file.filename).toMatch(/^GARAGE_LAPORAN_PENJUALAN_\d{4}-\d{2}-\d{2}\.pdf$/);
    expect(Buffer.from(file.base64, "base64").subarray(0, 5).toString()).toBe("%PDF-");
    await expect(tools.runAgentTool(session, "buat_laporan", { modul: "stok", tipe: "ngawur" }, ctx)).rejects.toMatchObject({ code: "UNKNOWN_REPORT" });
    await expect(tools.runAgentTool(session, "garage_api", { method: "GET", path: "/api/agent-keys" }, ctx)).rejects.toMatchObject({ code: "AGENT_FORBIDDEN_PATH" });
    await expect(tools.runAgentTool(session, "catat_pengeluaran", { nominal: -5 }, ctx)).rejects.toMatchObject({ code: "VALIDATION_ERROR" });

    const init = (await mcp.handleMcpMessage({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-03-26" } }, session, ctx)) as any;
    expect(init.result.protocolVersion).toBe("2025-03-26");
    expect(init.result.capabilities.tools).toBeTruthy();
    const list = (await mcp.handleMcpMessage({ jsonrpc: "2.0", id: 2, method: "tools/list" }, session, ctx)) as any;
    const ringkasan = list.result.tools.find((tool: any) => tool.name === "ringkasan_hari_ini");
    expect(ringkasan.inputSchema.type).toBe("object");
    expect(list.result.tools.map((tool: any) => tool.name)).toContain("garage_api");
    const call = (await mcp.handleMcpMessage({ jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "laporan_penjualan", arguments: {} } }, session, ctx)) as any;
    expect(call.result.isError).toBe(false);
    expect(JSON.parse(call.result.content[0].text).summary).toBeTruthy();
    const bad = (await mcp.handleMcpMessage({ jsonrpc: "2.0", id: 4, method: "tools/call", params: { name: "catat_pengeluaran", arguments: {} } }, session, ctx)) as any;
    expect(bad.result.isError).toBe(true);
    const unknown = (await mcp.handleMcpMessage({ jsonrpc: "2.0", id: 5, method: "tools/call", params: { name: "tidak_ada" } }, session, ctx)) as any;
    expect(unknown.error.code).toBe(-32602);
    const method = (await mcp.handleMcpMessage({ jsonrpc: "2.0", id: 6, method: "resources/list" }, session, ctx)) as any;
    expect(method.error.code).toBe(-32601);
  });
});

describe("S1 — pengerasan API key agent", () => {
  async function auditCount(path: string) {
    const { like } = await import("drizzle-orm");
    const rows = await t.getDb().select().from(t.schema.auditLogs).where(like(t.schema.auditLogs.action, `%${path}`));
    return rows.length;
  }

  it("identitas & akses (user, role, force-logout) tertutup untuk key statis, scope apa pun", async () => {
    const { key } = await keys.createAgentKey({ label: "Owner Bot", scope: "owner", expiresInDays: 30 }, ownerSession());
    for (const [method, path] of [
      ["POST", "/api/admin/users"],
      ["PATCH", "/api/admin/users/abc"],
      ["POST", "/api/admin/users/abc/reset-password"],
      ["POST", "/api/admin/security/force-logout-all"],
      ["GET", "/api/admin/security/overview"],
    ]) {
      const res = await keys.resolveAgentSession(key, req(key, method, path));
      expect(res.response?.status, `${method} ${path}`).toBe(403);
      expect(await res.response!.json()).toMatchObject({ error: { code: "AGENT_FORBIDDEN_PATH" } });
    }
    // garage_api memakai daftar yang sama. GET, karena sejak D-10 (#113) garage_api
    // menolak method selain GET lebih dulu — path terlarang harus tetap ditolak.
    const session = (await keys.resolveAgentSession(key, req(key, "POST", "/api/mcp"))).data!;
    await expect(tools.runAgentTool(session, "garage_api", { method: "GET", path: "/api/admin/security/overview" }, ctx)).rejects.toMatchObject({
      code: "AGENT_FORBIDDEN_PATH",
    });
  });

  it("audit sinkron: tulis & baca data keuangan tercatat sebelum diproses; GET biasa tidak", async () => {
    const { key } = await keys.createAgentKey({ label: "Audit Bot", scope: "owner", expiresInDays: 30 }, ownerSession());
    const before = await auditCount("/api/finance/overview");
    expect((await keys.resolveAgentSession(key, req(key, "GET", "/api/finance/overview"))).response).toBeNull();
    expect(await auditCount("/api/finance/overview")).toBe(before + 1);

    const ordersBefore = await auditCount("GET /api/orders");
    await keys.resolveAgentSession(key, req(key, "GET", "/api/orders"));
    expect(await auditCount("GET /api/orders")).toBe(ordersBefore);

    // Tanpa menunggu: baris audit sudah ada begitu sesi terbentuk (tidak fire-and-forget).
    expect((await keys.resolveAgentSession(key, req(key, "POST", "/api/expenses"))).response).toBeNull();
    expect(await auditCount("POST /api/expenses")).toBeGreaterThanOrEqual(1);

    expect(keys.agentRequestNeedsAudit("GET", "/api/finance")).toBe(true);
    expect(keys.agentRequestNeedsAudit("GET", "/api/financex")).toBe(false);
    expect(keys.agentRequestNeedsAudit("DELETE", "/api/menu/1")).toBe(true);
  });

  it("audit gagal dicatat → permintaan agent ditolak 503", async () => {
    const { key } = await keys.createAgentKey({ label: "Audit Gagal", scope: "owner", expiresInDays: 30 }, ownerSession());
    const { sql } = await import("drizzle-orm");
    await t.getDb().execute(sql.raw(`ALTER TABLE "audit_logs" RENAME TO "audit_logs_off"`));
    try {
      const res = await keys.resolveAgentSession(key, req(key, "POST", "/api/expenses"));
      expect(res.response?.status).toBe(503);
      expect(await res.response!.json()).toMatchObject({ error: { code: "AGENT_AUDIT_FAILED" } });
    } finally {
      await t.getDb().execute(sql.raw(`ALTER TABLE "audit_logs_off" RENAME TO "audit_logs"`));
    }
  });

  it("pengaturan keamanan & kill switch tidak bisa diubah lewat key; pengaturan lain & Owner langsung tetap bisa", async () => {
    const { key } = await keys.createAgentKey({ label: "Setting Bot", scope: "owner", expiresInDays: 30 }, ownerSession());
    const agent = (await keys.resolveAgentSession(key, req(key, "POST", "/api/admin/settings"))).data!;
    const svc = await import("@/lib/garage-service");
    const { AgentProtectedSettingError } = await import("@/lib/agent-protected-settings");
    await expect(svc.updateAppSettings(null, { securityRequire2faForOwner: false } as any, agent)).rejects.toBeInstanceOf(AgentProtectedSettingError);
    await expect(svc.updateAppSettings(null, { mcpChatgptPaused: false } as any, agent)).rejects.toBeInstanceOf(AgentProtectedSettingError);

    const settings = await import("@/lib/garage-settings-service");
    await expect(settings.saveSettings({ securityLockoutDurationMinutes: 99 }, agent, null)).rejects.toBeInstanceOf(AgentProtectedSettingError);

    // Pengaturan non-keamanan tetap boleh lewat agent; Owner login langsung boleh semuanya.
    await expect(svc.updateAppSettings(null, { autoSoldOutFromStock: true } as any, agent)).resolves.toBeTruthy();
    await expect(svc.updateAppSettings(null, { securityRequire2faForOwner: true } as any, ownerSession())).resolves.toMatchObject({
      securityRequire2faForOwner: true,
    });
  });
});
