import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import type { GarageSession } from "@/lib/server-auth";
import { seedGarageBasics, setupGarageTestDb, teardownGarageTestDb, type GarageTestDb } from "@/lib/test-helpers/garage-test-db";

// /api/mcp (API key OpenClaw/Hermes): setiap tools/call diaudit per tool SEBELUM
// dijalankan (dulu hanya satu baris per request HTTP). Audit gagal = tool batal.

/* eslint-disable @typescript-eslint/no-explicit-any */
const mocks = vi.hoisted(() => ({ session: vi.fn(), failAudit: { on: false } }));
vi.mock("@/lib/server-auth", async (importOriginal) => ({ ...(await importOriginal<object>()), requireGarageSession: mocks.session }));
vi.mock("@/lib/agent-http", () => ({ agentToolContext: async () => ({ authorization: "", internalOrigin: "http://127.0.0.1:1" }) }));
vi.mock("@/lib/mcp-tool-audit", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/mcp-tool-audit")>();
  return {
    ...real,
    auditMcpToolCall: async (input: Parameters<typeof real.auditMcpToolCall>[0]) => {
      if (mocks.failAudit.on) throw new Error("DB audit down");
      return real.auditMcpToolCall(input);
    },
  };
});

let t: GarageTestDb;
let outletId = "";
const OWNER = "user-legacy-mcp";

function agentSession(): GarageSession {
  return {
    user: { id: OWNER, name: "Owner · Agent Hermes", email: `${OWNER}@garage.id` },
    profile: {
      id: `sp-${OWNER}`,
      role: "Owner",
      shiftLabel: "Agent",
      deviceLabel: "agent:Hermes",
      passwordResetRequired: false,
      outlet: { id: outletId, code: "TST", name: "Outlet Test", timezone: "Asia/Jakarta" },
      agentKey: { id: "key-hermes", label: "Hermes", scope: "owner" },
    },
  } as unknown as GarageSession;
}

async function post(body: unknown) {
  const { POST } = await import("@/app/api/mcp/route");
  const res = await POST(new Request("http://localhost/api/mcp", { method: "POST", body: JSON.stringify(body) }));
  return res.json() as Promise<any>;
}

async function toolAudits() {
  const { like } = await import("drizzle-orm");
  return t.getDb().select().from(t.schema.auditLogs).where(like(t.schema.auditLogs.action, "Agent MCP tool %"));
}

beforeAll(async () => {
  t = await setupGarageTestDb();
  ({ outletId } = await seedGarageBasics(t, { userId: OWNER }));
  mocks.session.mockImplementation(async () => ({ data: agentSession(), response: null }));
}, 60_000);

afterAll(async () => {
  await teardownGarageTestDb(t);
});

describe("/api/mcp — audit per tool", () => {
  it("tools/call tercatat per tool (nama, risiko, key, argumen ringkas); tools/list tidak", async () => {
    await post({ jsonrpc: "2.0", id: 1, method: "tools/list" });
    expect(await toolAudits()).toHaveLength(0);

    const res = await post([
      { jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "kemampuan_sistem", arguments: {} } },
      { jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "daftar_order", arguments: { status: "all", limit: 5 } } },
    ]);
    expect(res.map((r: any) => r.result?.isError)).toEqual([false, false]);
    const rows = await toolAudits();
    expect(rows.map((row: any) => row.object).sort()).toEqual(["daftar_order", "kemampuan_sistem"]);
    const order = rows.find((row: any) => row.object === "daftar_order")!;
    expect(order).toMatchObject({ actor: "Owner · Agent Hermes", device: "agent:Hermes" });
    expect(order.metadata).toMatchObject({ source: "agent-key", agentKeyId: "key-hermes", risk: "R0", args: '{"status":"all","limit":5}' });
  });

  it("audit gagal → tool tidak dijalankan (pengeluaran tidak tercatat)", async () => {
    mocks.failAudit.on = true;
    try {
      const res = await post({
        jsonrpc: "2.0",
        id: 4,
        method: "tools/call",
        params: { name: "catat_pengeluaran", arguments: { kategori: "Operasional", deskripsi: "Gas elpiji", nominal: 25_000 } },
      });
      expect(res.result.isError).toBe(true);
      // Detail error internal tidak diteruskan ke klien MCP (owner-ai Phase 4) — hanya kode + ref.
      expect(res.result.content[0].text).toMatch(/^EXECUTION_FAILED: .*ref req_/);
      expect(res.result.content[0].text).not.toContain("DB audit down");
      expect(res.result.structuredContent.error).toMatchObject({ code: "EXECUTION_FAILED", retryable: false });
    } finally {
      mocks.failAudit.on = false;
    }
    const { eq } = await import("drizzle-orm");
    expect(await t.getDb().select().from(t.schema.expenses).where(eq(t.schema.expenses.description, "Gas elpiji"))).toHaveLength(0);
  });
});
