import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { setupGarageTestDb, teardownGarageTestDb, type GarageTestDb } from "@/lib/test-helpers/garage-test-db";

// Audit #12: laporan pelanggaran CSP (format CSP2 & Reporting API) tercatat ringkas; input aneh tidak error.
let t: GarageTestDb;

beforeAll(async () => {
  t = await setupGarageTestDb();
}, 90_000);

afterAll(async () => {
  if (t) await teardownGarageTestDb(t);
});

const post = async (body: string) => {
  const { POST } = await import("@/app/api/csp-report/route");
  return POST(new Request("http://localhost/api/csp-report", { method: "POST", body, headers: { "x-real-ip": "9.9.9.9" } }));
};

describe("laporan CSP", () => {
  it("format CSP2 & Reporting API dicatat sebagai csp_violation", async () => {
    expect((await post(JSON.stringify({ "csp-report": { "document-uri": "https://garagecoffee.id/pos", "violated-directive": "script-src", "effective-directive": "script-src", "blocked-uri": "https://evil.example/x.js" } }))).status).toBe(204);
    expect((await post(JSON.stringify([{ type: "csp-violation", body: { documentURL: "https://garagecoffee.id/", effectiveDirective: "img-src", blockedURL: "http://insecure/img.png" } }]))).status).toBe(204);
    const { eq } = await import("drizzle-orm");
    const rows = await t.getDb().select().from(t.schema.auditLogs).where(eq(t.schema.auditLogs.action, "csp_violation"));
    expect(rows.map((r: { object: string }) => r.object)).toEqual(expect.arrayContaining(["script-src · https://evil.example/x.js", "img-src · http://insecure/img.png"]));
  });

  it("body rusak / kosong tidak error (204, tidak dicatat)", async () => {
    expect((await post("bukan json")).status).toBe(204);
    expect((await post("")).status).toBe(204);
  });
});
