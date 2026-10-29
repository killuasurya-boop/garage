import { describe, expect, it } from "vitest";

import { AI_VERIFY_TTL_MS, computeAiStatus, type ConnectionFacts, type StatusFacts } from "@/lib/owner-ai-status";

const NOW = new Date("2026-10-30T05:00:00Z");
const ago = (ms: number) => new Date(NOW.getTime() - ms);

function conn(over: Partial<ConnectionFacts> = {}): ConnectionFacts {
  return {
    id: "c1",
    clientName: "ChatGPT",
    oauthClientId: "client-123456",
    firstSeenAt: ago(86_400_000),
    lastSeenAt: ago(60_000),
    lastReadOkAt: null,
    lastWriteOkAt: null,
    lastVerifiedAt: null,
    revokedAt: null,
    ...over,
  };
}

function facts(over: Partial<StatusFacts> = {}): StatusFacts {
  return {
    now: NOW,
    gatewayConfigured: true,
    gatewayReason: null,
    paused: false,
    writeEnabled: true,
    ownerTwoFactor: true,
    connections: [],
    lastOperation: null,
    ...over,
  };
}

describe("computeAiStatus — dimensi terpisah, tanpa status palsu", () => {
  it("server aktif tapi belum ada ChatGPT: NOT SETUP, link NEVER_VERIFIED", () => {
    const s = computeAiStatus(facts());
    expect(s.gateway.state).toBe("ONLINE");
    expect(s.link.state).toBe("NEVER_VERIFIED");
    expect(s.toolAccess.state).toBe("UNKNOWN");
    expect(s.chip.state).toBe("AI_NOT_SETUP");
  });

  it("tersambung OAuth tanpa kode verifikasi ≠ VERIFIED (STANDBY)", () => {
    const s = computeAiStatus(facts({ connections: [conn({ lastReadOkAt: ago(1000) })] }));
    expect(s.link.state).toBe("NEVER_VERIFIED");
    expect(s.chip.state).toBe("AI_STANDBY");
  });

  it("verifikasi dalam TTL = VERIFIED; lewat TTL = NEEDS_REVERIFY (bukan error)", () => {
    const fresh = computeAiStatus(facts({ connections: [conn({ lastVerifiedAt: ago(60_000) })] }));
    expect(fresh.link.state).toBe("VERIFIED");
    expect(fresh.chip.state).toBe("AI_VERIFIED");
    expect(fresh.link.reverifyDueAt).toBe(new Date(NOW.getTime() - 60_000 + AI_VERIFY_TTL_MS).toISOString());

    const stale = computeAiStatus(facts({ connections: [conn({ lastVerifiedAt: ago(AI_VERIFY_TTL_MS + 1) })] }));
    expect(stale.link.state).toBe("NEEDS_REVERIFY");
    expect(stale.chip.state).toBe("AI_STANDBY");
  });

  it("koneksi dicabut tidak dihitung terverifikasi", () => {
    const s = computeAiStatus(facts({ connections: [conn({ lastVerifiedAt: ago(1000), revokedAt: ago(500) })] }));
    expect(s.link.state).toBe("REVOKED");
    expect(s.chip.state).not.toBe("AI_VERIFIED");
  });

  it("akses tool: tulis hanya READ_WRITE bila tulis TERBUKTI; saklar Owner = READ_ONLY; jeda = BLOCKED", () => {
    const verified = conn({ lastVerifiedAt: ago(1000), lastReadOkAt: ago(1000) });
    expect(computeAiStatus(facts({ connections: [verified] })).toolAccess.state).toBe("UNKNOWN");
    expect(computeAiStatus(facts({ connections: [{ ...verified, lastWriteOkAt: ago(10) }] })).toolAccess.state).toBe("READ_WRITE");
    expect(computeAiStatus(facts({ writeEnabled: false, connections: [verified] })).toolAccess.state).toBe("READ_ONLY");
    const paused = computeAiStatus(facts({ paused: true, connections: [verified] }));
    expect(paused.gateway.state).toBe("PAUSED");
    expect(paused.toolAccess.state).toBe("BLOCKED");
    expect(paused.chip.state).toBe("AI_STANDBY");
  });

  it("Owner tanpa 2FA / server mati = ERROR", () => {
    expect(computeAiStatus(facts({ ownerTwoFactor: false, connections: [conn()] })).chip.state).toBe("AI_ERROR");
    expect(computeAiStatus(facts({ gatewayConfigured: false, gatewayReason: "x", connections: [conn()] })).chip.state).toBe("AI_ERROR");
    expect(computeAiStatus(facts({ gatewayConfigured: false, gatewayReason: "x" })).chip.state).toBe("AI_NOT_SETUP");
  });

  it("eksekusi: confirmed baru = RUNNING; gagal/terputus 24 jam terakhir = FAILED; lama = IDLE", () => {
    const base = { connections: [conn({ lastVerifiedAt: ago(1000) })] };
    expect(computeAiStatus(facts({ ...base, lastOperation: { status: "confirmed", at: ago(30_000), tool: "x" } })).chip.state).toBe("AI_RUNNING");
    const failed = computeAiStatus(facts({ ...base, lastOperation: { status: "failed", at: ago(3_600_000), tool: "x" } }));
    expect(failed.execution.state).toBe("FAILED");
    // Satu operasi gagal/ditolak kebijakan bukan alarm merah 24 jam.
    expect(failed.chip.state).toBe("AI_VERIFIED");
    expect(computeAiStatus(facts({ ...base, lastOperation: { status: "confirmed", at: ago(600_000), tool: "x" } })).execution.state).toBe("FAILED");
    expect(computeAiStatus(facts({ ...base, lastOperation: { status: "failed", at: ago(2 * 86_400_000), tool: "x" } })).execution.state).toBe("IDLE");
    expect(computeAiStatus(facts({ ...base, lastOperation: { status: "executed", at: ago(10_000), tool: "x" } })).chip.state).toBe("AI_VERIFIED");
  });
});
