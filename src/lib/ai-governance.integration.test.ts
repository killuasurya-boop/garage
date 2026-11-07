import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { Role } from "@/lib/garage-data";
import type { GarageSession } from "@/lib/server-auth";
import { seedGarageBasics, setupGarageTestDb, teardownGarageTestDb, type GarageTestDb } from "@/lib/test-helpers/garage-test-db";

// Batch 7 AI Governance: panel Owner-only (bukan agent key), mode dari saklar nyata, operasi &
// kasus milik Owner; saklar MCP & wajib-2FA Owner tidak bisa diubah Manajer. DB uji PGlite.

/* eslint-disable @typescript-eslint/no-explicit-any */
let t: GarageTestDb;
let gov: any;
let svc: any;
let outletId = "";
const OWNER = "user-gov-owner";
const MANAJER = "user-gov-manajer";

function session(id: string, role: string, extra: Record<string, unknown> = {}): GarageSession {
  return {
    user: { id, name: `Uji ${role}`, email: `${id}@garage.id` },
    profile: { id: `sp-${id}`, role: role as Role, shiftLabel: "Pagi", deviceLabel: "TEST", passwordResetRequired: false, workstation: null,
      outlet: { id: outletId, code: "TST", name: "Outlet", timezone: "Asia/Jakarta" }, ...extra },
  } as unknown as GarageSession;
}
const owner = () => session(OWNER, "Owner");

beforeAll(async () => {
  t = await setupGarageTestDb();
  outletId = (await seedGarageBasics(t, { userId: OWNER })).outletId;
  await t.getDb().insert(t.schema.user).values({ id: MANAJER, name: "Manajer Gov", email: `${MANAJER}@garage.id` });
  gov = await import("@/lib/ai-governance-server");
  svc = await import("@/lib/garage-service");
}, 60_000);

afterAll(async () => {
  await teardownGarageTestDb(t);
});

describe("AI Governance", () => {
  it("hanya Owner dari layar (bukan Manajer, bukan agent key)", async () => {
    await expect(gov.getAiGovernance(session(MANAJER, "Manajer"))).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(gov.getAiGovernance(session(OWNER, "Owner", { agentKey: { id: "k", label: "bot", scope: "owner" } }))).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("mode mengikuti saklar nyata; tool & 16 domain dari registry; operasi milik Owner diringkas jujur", async () => {
    await svc.updateAppSettings(null, { mcpChatgptPaused: false, mcpChatgptWriteEnabled: false } as any, owner());
    const now = Date.now();
    await t.getDb().insert(t.schema.mcpOperations).values([
      { userId: OWNER, tool: "ubah_data_garage", risk: "R2", argsDigest: "a", argsPreview: {}, nonceHash: "n1", status: "executed", expiresAt: new Date(now + 60_000) },
      { userId: OWNER, tool: "ubah_data_garage", risk: "R3", argsDigest: "b", argsPreview: {}, nonceHash: "n2", status: "confirmed", expiresAt: new Date(now + 60_000) },
      { userId: OWNER, tool: "ubah_data_garage", risk: "R2", argsDigest: "c", argsPreview: {}, nonceHash: "n3", status: "pending", expiresAt: new Date(now - 60_000) },
      { userId: MANAJER, tool: "ubah_data_garage", risk: "R2", argsDigest: "d", argsPreview: {}, nonceHash: "n4", status: "executed", expiresAt: new Date(now + 60_000) },
    ] as any);
    const data = await gov.getAiGovernance(owner());
    expect(data.mode.value).toBe("read_only");
    expect(data.tools.domains).toHaveLength(16);
    expect(data.tools.total).toBeGreaterThan(10);
    expect(data.operations).toMatchObject({ total: 3, executed: 1, uncertain: 1, expired: 1 });
    expect(data.forbidden.length).toBeGreaterThan(0);
    expect(data.guardrails.length).toBeGreaterThan(0);
  });

  it("Manajer tidak bisa mengubah saklar MCP / wajib-2FA Owner; setelan sesi tetap boleh", async () => {
    await expect(svc.updateAppSettings(null, { mcpChatgptWriteEnabled: true } as any, session(MANAJER, "Manajer"))).rejects.toThrow(/hanya bisa diubah Owner/);
    await expect(svc.updateAppSettings(null, { securityRequire2faForOwner: false } as any, session(MANAJER, "Manajer"))).rejects.toThrow(/hanya bisa diubah Owner/);
    await expect(svc.updateAppSettings(null, { securityLockoutDurationMinutes: 20 } as any, session(MANAJER, "Manajer"))).resolves.toMatchObject({
      securityLockoutDurationMinutes: 20,
    });
    await expect(svc.updateAppSettings(null, { mcpChatgptWriteEnabled: true } as any, owner())).resolves.toMatchObject({ mcpChatgptWriteEnabled: true });
    expect((await gov.getAiGovernance(owner())).mode.value).toBe("controlled");
  });
});
