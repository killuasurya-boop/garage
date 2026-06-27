import { describe, expect, it, vi } from "vitest";

const values = vi.fn();
const insert = vi.fn(() => ({ values }));

vi.mock("@/db", () => ({
  getDb: () => ({ insert }),
}));

vi.mock("@/db/schema", () => ({
  auditLogs: "auditLogs",
}));

describe("GARAGE social audit", () => {
  it("mencatat event audit tanpa token provider", async () => {
    const { recordSocialAudit } = await import("@/lib/garage-social-audit");
    await recordSocialAudit({
      actor: "owner-1",
      action: "integration.test",
      object: "youtube",
      status: "success",
      metadata: { provider: "youtube" },
    });

    expect(insert).toHaveBeenCalledWith("auditLogs");
    expect(values).toHaveBeenCalledWith(
      expect.objectContaining({
        actor: "owner-1",
        action: "integration.test",
        object: "youtube",
        device: "GARAGE OS Publisher",
        status: "success",
        metadata: { provider: "youtube" },
      }),
    );
    expect(JSON.stringify(values.mock.calls[0][0])).not.toContain("token");
  });
});
