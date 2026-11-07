import { describe, expect, it } from "vitest";

import { handleMcpMessage } from "@/lib/agent-mcp";
import {
  AYA_AVATAR_SRC,
  AYA_NAME,
  ayaCustomerPolicy,
  ayaOwnerIdentityPolicy,
  ayaStaffIdentityPolicy,
  garageAiOperationalPersonaPolicy,
  garageAiOwnerAnswerPolicy,
} from "@/lib/garage-ai-persona";
import type { GarageSession } from "@/lib/server-auth";

// D-07 (sheet karakter Owner 27 Okt): Aya = AI pet companion putih bermata sipit, untuk Owner
// (eksekutif), staf semua divisi (pengingat kerja), dan pelanggan website.

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
  it("Aya adalah AI pet companion (bukan hewan/manusia); avatar resmi tersedia", () => {
    expect(AYA_NAME).toBe("Aya");
    expect(AYA_AVATAR_SRC).toBe("/garage-brand/aya/v5/aya-master.svg");
    for (const policy of [ayaOwnerIdentityPolicy, ayaStaffIdentityPolicy, ayaCustomerPolicy]) {
      expect(policy).toContain("AI pet companion");
      expect(policy).toContain("bermata sipit");
      expect(policy).not.toMatch(/hewan/);
    }
  });

  it("Owner: gaya eksekutif; staf: pengingat kerja semua divisi (MCP & AI in-app)", async () => {
    expect(await instructions("Owner")).toContain("asisten eksekutif");
    const staff = await instructions("Manajer");
    expect(staff).toContain("Nama Anda Aya");
    expect(staff).toContain("mengingatkan pekerjaan");
    expect(garageAiOwnerAnswerPolicy.startsWith(ayaOwnerIdentityPolicy)).toBe(true);
    expect(garageAiOperationalPersonaPolicy.startsWith(ayaStaffIdentityPolicy)).toBe(true);
  });

  it("pelanggan: menyambut & mengajak memesan, tanpa data internal atau data pembayaran", () => {
    expect(ayaCustomerPolicy).toContain("mengajak memesan");
    expect(ayaCustomerPolicy).toMatch(/Jangan membuka data internal/);
    expect(ayaCustomerPolicy).toMatch(/checkout resmi/);
  });

  it("Aya tidak mengubah aturan: tetap AI, aksi berisiko lewat konfirmasi", () => {
    expect(ayaOwnerIdentityPolicy).toMatch(/bukan manusia/);
    expect(ayaOwnerIdentityPolicy).toMatch(/konfirmasi Owner/);
  });
});
