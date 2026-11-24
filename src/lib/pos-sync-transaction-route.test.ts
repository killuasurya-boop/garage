import { describe, expect, it, vi } from "vitest";

// Audit #17: kunci terminal POS diperiksa sebelum validasi body — tanpa kunci selalu 401.
describe("POST /api/pos/sync-transaction", () => {
  it("tanpa x-api-key → 401 walau body rusak (tidak membocorkan aturan validasi)", async () => {
    const { POST } = await import("@/app/api/pos/sync-transaction/route");
    const response = await POST(new Request("http://localhost/api/pos/sync-transaction", { method: "POST", body: "{}", headers: { "content-type": "application/json", "x-real-ip": "7.7.7.7" } }));
    expect(response.status).toBe(401);
  });

  it("kunci terminal ada tapi tanpa X-Idempotency-Key → 400 (anti poin dobel)", async () => {
    const { POST } = await import("@/app/api/pos/sync-transaction/route");
    const { DEV_POS_API_KEY } = await import("@/lib/pos-api-key");
    const pos = await import("@/lib/pos-api-key");
    const spy = vi
      .spyOn(pos, "requirePosTerminal")
      .mockResolvedValue({ data: { terminalCode: "T1" }, response: null } as never);
    const response = await POST(
      new Request("http://localhost/api/pos/sync-transaction", {
        method: "POST",
        body: JSON.stringify({ terminalCode: "T1", memberPhone: "081300001001", totalAmount: 10_000 }),
        headers: { "content-type": "application/json", "x-api-key": DEV_POS_API_KEY, "x-real-ip": "7.7.7.8" },
      }),
    );
    spy.mockRestore();
    expect(response.status).toBe(400);
  });
});
