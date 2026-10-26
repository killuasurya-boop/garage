import { describe, expect, it } from "vitest";

import { listAgentTools } from "@/lib/agent-tools";
import { buildCapabilities, GARAGE_DOMAINS, riskNeedsConfirmation } from "@/lib/mcp-tool-registry";

const tools = listAgentTools();
const domainIds = new Set<string>(GARAGE_DOMAINS.map((domain) => domain.id));

describe("registry tool AI (M1)", () => {
  it("16 domain PRD §04, id unik", () => {
    expect(GARAGE_DOMAINS).toHaveLength(16);
    expect(domainIds.size).toBe(16);
  });

  it("setiap tool punya domain valid & risiko; write konsisten dengan risiko", () => {
    for (const tool of tools) {
      expect(domainIds.has(tool.domain), `${tool.name} domain`).toBe(true);
      expect(["R0", "R1", "R2", "R3"], `${tool.name} risk`).toContain(tool.risk);
      expect(tool.write, `${tool.name} write vs risk`).toBe(tool.risk !== "R0");
    }
  });

  it("tool yang menyentuh uang minimal R2; garage_api (wildcard) R3", () => {
    const risk = Object.fromEntries(tools.map((tool) => [tool.name, tool.risk]));
    expect(risk.catat_pengeluaran).toBe("R2");
    expect(risk.putuskan_approval).toBe("R2");
    expect(risk.garage_api).toBe("R3");
    expect(riskNeedsConfirmation("R2")).toBe(true);
    expect(riskNeedsConfirmation("R1")).toBe(false);
  });

  it("peta kemampuan menandai domain tanpa tool & hal yang selalu ditolak", () => {
    const caps = buildCapabilities(tools);
    expect(caps.domains).toHaveLength(16);
    // Setelah M3a–M3f: tinggal domain yang belum punya tool (dilaporkan apa adanya ke Owner).
    expect(caps.belumTersedia).toEqual(["Konten & Marketing", "Email & Notifikasi"]);
    expect(caps.belumTersedia).not.toContain("Member & CRM");
    const keuangan = caps.domains.find((domain) => domain.id === "keuangan");
    expect(keuangan?.tools.find((tool) => tool.name === "catat_pengeluaran")?.butuhKonfirmasi).toBe(true);
    expect(caps.selaluDitolak.join(" ")).toMatch(/ledger/i);
  });
});
