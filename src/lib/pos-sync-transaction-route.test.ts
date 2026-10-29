import { describe, expect, it } from "vitest";

// Audit #17: kunci terminal POS diperiksa sebelum validasi body — tanpa kunci selalu 401.
describe("POST /api/pos/sync-transaction", () => {
  it("tanpa x-api-key → 401 walau body rusak (tidak membocorkan aturan validasi)", async () => {
    const { POST } = await import("@/app/api/pos/sync-transaction/route");
    const response = await POST(new Request("http://localhost/api/pos/sync-transaction", { method: "POST", body: "{}", headers: { "content-type": "application/json", "x-real-ip": "7.7.7.7" } }));
    expect(response.status).toBe(401);
  });
});
