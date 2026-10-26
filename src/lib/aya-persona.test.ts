import { describe, expect, it } from "vitest";

import { handleMcpMessage } from "@/lib/agent-mcp";
import { AYA_NAME, ayaOwnerIdentityPolicy, garageAiOperationalPersonaPolicy, garageAiOwnerAnswerPolicy } from "@/lib/garage-ai-persona";
import type { GarageSession } from "@/lib/server-auth";

// D-07: Aya = identitas asisten AI untuk Owner (in-app & MCP). Jalur staf belum
// memakai Aya (D-07e OPEN); wujud/sapaan tidak dikarang (D-07a–d OPEN).

const session = (role: string) =>
  ({ user: { id: "u", name: "U" }, profile: { role, outlet: { id: "o" }, agentKey: null } }) as unknown as GarageSession;
const ctx = { authorization: "", internalOrigin: "http://127.0.0.1:1" };

async function instructions(role: string) {
  const res = (await handleMcpMessage({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} }, session(role), ctx)) as {
    result: { instructions: string };
  };
  return res.result.instructions;
}

describe("persona Aya (D-07)", () => {
  it("Owner: instruksi MCP & kebijakan jawaban Owner memperkenalkan Aya", async () => {
    expect(AYA_NAME).toBe("Aya");
    expect(await instructions("Owner")).toContain("Nama Anda Aya");
    expect(garageAiOwnerAnswerPolicy.startsWith(ayaOwnerIdentityPolicy)).toBe(true);
  });

  it("Manajer & jalur staf tidak memakai Aya (menunggu D-07e)", async () => {
    expect(await instructions("Manajer")).not.toContain("Aya");
    expect(garageAiOperationalPersonaPolicy).not.toContain("Aya");
  });

  it("Aya tidak mengubah aturan: tetap AI, data dari sistem, aksi berisiko lewat konfirmasi", () => {
    expect(ayaOwnerIdentityPolicy).toMatch(/bukan manusia/);
    expect(ayaOwnerIdentityPolicy).toMatch(/konfirmasi Owner/);
  });
});
