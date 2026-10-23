import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { setupGarageTestDb, seedGarageBasics, teardownGarageTestDb, type GarageTestDb } from "@/lib/test-helpers/garage-test-db";
import { getClosingReadiness } from "@/lib/wms-replenishment-readiness";
let t: GarageTestDb;
let outletId: string;
beforeAll(async () => { t = await setupGarageTestDb(); ({ outletId } = await seedGarageBasics(t)); }, 120_000);
afterAll(async () => { if (t) await teardownGarageTestDb(t); });
describe("Read-only configuration diagnostic", () => {
  it("reports actual missing mappings without changing configuration, audit, stock, or POS", async () => {
    const tables = [t.schema.wmsClosingSettings, t.schema.wmsClosingLocation, t.schema.wmsClosingAccess, t.schema.wmsClosingEvent, t.schema.auditLogs, t.schema.wmsWarehouseStock, t.schema.wmsStockMovement, t.schema.menuItems, t.schema.menuVariants, t.schema.payments];
    const snapshot = () => Promise.all(tables.map(table => t.getDb().select().from(table)));
    const before = await snapshot();
    const result = await getClosingReadiness({ id: "user-itest", name: "Owner", role: "Owner", outletId });
    expect(result).toMatchObject({ outletId, ready: false, scope: "configuration_only", driver: "pglite" });
    expect(result.summary.blockers).toBeGreaterThan(0);
    expect(await snapshot()).toEqual(before);
  });
  it("denies staff roles even when called without the HTTP handler", async () => {
    await expect(getClosingReadiness({ id: "user-itest", name: "Bar", role: "Kasir", outletId, workstation: "bar" })).rejects.toMatchObject({ status: 403, code: "FORBIDDEN" });
  });
});
