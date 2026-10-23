import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import * as schema from "@/db/schema";
import type { ClosingActor, ClosingTransitionInput, SaveClosingInput } from "@/lib/wms-replenishment-types";

// Opt-in only. Never read DATABASE_URL or connect to a remote/production database.
// The CI job supplies a disposable local postgres:16 service; no PGlite substitute.
const enabled = process.env.GARAGE_RUN_POSTGRES_TESTS === "1";
const suite = enabled ? describe : describe.skip;
let admin: pg.Pool, pool: pg.Pool;
let databaseName: string;
let db: ReturnType<typeof import("@/db")["getDb"]>;
let service: typeof import("@/lib/wms-replenishment");
let stockService: typeof import("@/lib/wms-service");
let owner: ClosingActor;
let source: string, destination: string;
let sequence = 0;
const key = () => randomUUID();

async function fixture() {
  sequence++;
  const [product] = await db.insert(schema.wmsProduct).values({ sku: `PG-RACE-${sequence}`, name: "Bahan uji konkurensi", category: "PG Test Bar", unit: "L", minStock: 10, hpp: 100 }).returning();
  await stockService.runInTx(tx => stockService.recordStockMovement(tx, { type: "in", productId: product.id, warehouseId: source, deltaQty: 10, hpp: 100, batchNo: `PG-BATCH-${sequence}`, expiredAt: new Date("2099-01-01"), userId: owner.id }));
  const input: SaveClosingInput = { idempotencyKey: key(), division: "bar", warehouseId: destination, businessDate: `2026-01-${String(sequence).padStart(2, "0")}`, neededDate: "2026-02-01", submit: true, items: [{ productId: product.id, physicalQty: 0, targetQty: 10, requestedQty: 10 }] };
  return { productId: product.id, input };
}
async function transition(request: { id: string; version: number }, action: ClosingTransitionInput["action"], extra: Partial<ClosingTransitionInput> = {}) {
  return service.transitionReplenishment(owner, request.id, { action, idempotencyKey: key(), version: request.version, ...extra });
}
async function physical(productId: string) {
  const rows = await db.select().from(schema.wmsWarehouseStock).where(eq(schema.wmsWarehouseStock.productId, productId));
  return Object.fromEntries(rows.map(row => [row.warehouseId, Number(row.qty)]));
}
async function posSnapshot() {
  return Promise.all([schema.productCategories, schema.menuItems, schema.menuVariants, schema.orders, schema.orderItems, schema.payments, schema.cashSessions].map(async table => {
    const result = await db.select().from(table);
    return result.map(row => JSON.stringify(row)).sort();
  }));
}
let protectedBaseline: Awaited<ReturnType<typeof posSnapshot>>;

/** Hold the actual module lock so both concurrent service calls must occupy distinct backend sessions. */
async function overlap<T>(calls: Array<() => Promise<T>>): Promise<PromiseSettledResult<T>[]> {
  const blocker = await pool.connect();
  let pending: Promise<PromiseSettledResult<T>[]> | undefined;
  try {
    await blocker.query("BEGIN");
    await blocker.query("SELECT pg_advisory_xact_lock(73453, 1)");
    pending = Promise.allSettled(calls.map(call => call()));
    const deadline = Date.now() + 10_000;
    let waitingPids: number[] = [];
    while (Date.now() < deadline) {
      const result = await admin.query<{ pid: number }>("SELECT pid FROM pg_stat_activity WHERE datname = $1 AND wait_event_type = 'Lock' AND wait_event = 'advisory'", [databaseName]);
      waitingPids = result.rows.map(row => row.pid);
      if (new Set(waitingPids).size >= calls.length) break;
      await new Promise(resolve => setTimeout(resolve, 20));
    }
    expect(new Set(waitingPids).size, "race must reach separate PostgreSQL backend sessions, not a single embedded connection").toBeGreaterThanOrEqual(calls.length);
    await blocker.query("COMMIT");
    return await pending;
  } finally {
    await blocker.query("ROLLBACK");
    blocker.release();
    if (pending) await pending;
  }
}

suite("REAL PostgreSQL multi-connection WMS races (requires explicit loopback test service)", () => {
  beforeAll(async () => {
    const raw = process.env.GARAGE_POSTGRES_TEST_URL;
    if (!raw) throw new Error("GARAGE_POSTGRES_TEST_URL wajib diisi; pengujian PostgreSQL tidak boleh diganti PGlite.");
    const url = new URL(raw);
    if (!["postgres:", "postgresql:"].includes(url.protocol) || !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) || url.search) throw new Error("Hanya layanan PostgreSQL uji lokal tanpa parameter URL yang diizinkan.");
    admin = new pg.Pool({ connectionString: raw, ssl: false, connectionTimeoutMillis: 5000 });
    databaseName = `garage_wms_concurrency_${randomUUID().replaceAll("-", "")}`;
    await admin.query(`CREATE DATABASE "${databaseName}"`);
    url.pathname = `/${databaseName}`;
    url.searchParams.set("application_name", databaseName);
    process.env.DATABASE_URL = url.toString();
    process.env.GARAGE_DB_DRIVER = "postgres";
    process.env.DATABASE_SSL = "false";
    const runtime = await import("@/db");
    // getDb uses the explicit postgres driver directly: no development fallback path.
    db = runtime.getDb(); pool = runtime.getPgPool() as pg.Pool;
    expect(runtime.getDatabaseDriver()).toBe("postgres");
    expect((await pool.query("SELECT current_database() AS name")).rows[0].name).toBe(databaseName);
    // Create schema from current Drizzle definitions. This suite validates locks, not migration history.
    const { generateDrizzleJson, generateMigration } = await import("drizzle-kit/api");
    for (const statement of await generateMigration(generateDrizzleJson({}), generateDrizzleJson(schema))) await pool.query(statement);
    const [outlet] = await db.insert(schema.outlets).values({ code: "PG-RACE", name: "Isolated PostgreSQL test" }).returning();
    await db.insert(schema.user).values({ id: "pg-race-owner", name: "Test Owner", email: "pg-race@garage.test" });
    owner = { id: "pg-race-owner", name: "Test Owner", role: "Owner", outletId: outlet.id };
    const locations = [];
    for (const kind of ["main", "bar", "transit", "damaged"] as const) {
      const [location] = await db.insert(schema.wmsWarehouse).values({ code: `PG-${kind}`, name: `PG ${kind}`, type: kind, area: "bar" }).returning();
      locations.push({ warehouseId: location.id, kind, area: "bar" as const });
      if (kind === "main") source = location.id;
      if (kind === "bar") destination = location.id;
    }
    await db.insert(schema.wmsCategory).values({ name: "PG Test Bar", area: "bar" });
    await serviceImport();
    await service.updateClosingSettings(owner, { idempotencyKey: key(), locations });
    await db.insert(schema.menuItems).values({ id: "pg-pos-protected", name: "POS protected", category: "Coffee", section: "Coffee", prep: "5m" });
    await db.insert(schema.menuVariants).values({ itemId: "pg-pos-protected", variantId: "reg", label: "Regular", price: 20000 });
    const [order] = await db.insert(schema.orders).values({ orderNo: "PG-POS-PROTECTED", outletId: owner.outletId, channel: "Dine In", status: "preparing", subtotal: 20000, service: 0, tax: 0, total: 20000 }).returning();
    await db.insert(schema.payments).values({ orderId: order.id, method: "cash", amount: 20000, status: "captured" });
    protectedBaseline = await posSnapshot();
  }, 120_000);
  afterEach(async () => { if (protectedBaseline) expect(await posSnapshot()).toEqual(protectedBaseline); });
  afterAll(async () => {
    if (pool) await pool.end();
    if (admin) {
      try {
        if (databaseName) {
          // Pool.end can finish just before PostgreSQL observes every socket close.
          // Wait for orderly disconnect; FORCE would emit unhandled client errors.
          let connections = 0;
          const deadline = Date.now() + 5000;
          do {
            const result = await admin.query<{ count: number }>("SELECT count(*)::int AS count FROM pg_stat_activity WHERE datname = $1", [databaseName]);
            connections = result.rows[0].count;
            if (!connections) break;
            await new Promise(resolve => setTimeout(resolve, 25));
          } while (Date.now() < deadline);
          expect(connections, "all test database connections must drain before cleanup").toBe(0);
          await admin.query(`DROP DATABASE "${databaseName}"`);
        }
      }
      finally { await admin.end(); }
    }
  });

  it("creates one document and one audit event when two real connections replay the same key", async () => {
    const f = await fixture();
    const results = await overlap([() => service.saveClosing(owner, f.input), () => service.saveClosing(owner, f.input)]);
    expect(results.every(result => result.status === "fulfilled")).toBe(true);
    if (results[0].status !== "fulfilled" || results[1].status !== "fulfilled") throw new Error("Concurrent saves failed");
    expect(results[0].value.id).toBe(results[1].value.id);
    const requests = await db.select().from(schema.wmsClosingRequest).where(eq(schema.wmsClosingRequest.businessDate, f.input.businessDate));
    expect(requests).toHaveLength(1);
    expect((await service.getReplenishment(owner, requests[0].id)).history).toHaveLength(1);
    await expect(service.saveClosing(owner, { ...f.input, note: "different payload" })).rejects.toMatchObject({ status: 409 });
  });

  it("prevents competing approvals on separate connections from reserving the same physical ten units twice", async () => {
    const f = await fixture();
    const a = await service.saveClosing(owner, f.input);
    const b = await service.saveClosing(owner, { ...f.input, idempotencyKey: key(), businessDate: "2025-12-31" });
    const before = await physical(f.productId);
    const results = await overlap([() => transition(a, "approve", { sourceWarehouseId: source }), () => transition(b, "approve", { sourceWarehouseId: source })]);
    expect(results.every(result => result.status === "fulfilled")).toBe(true);
    const reservations = await db.select().from(schema.wmsClosingReservation).where(eq(schema.wmsClosingReservation.productId, f.productId));
    expect(reservations.reduce((sum, row) => sum + Number(row.qty), 0)).toBe(10);
    const requests = await Promise.all([service.getReplenishment(owner, a.id), service.getReplenishment(owner, b.id)]);
    expect(requests.map(request => Number(request.items[0].approvedQty)).sort((x, y) => x - y)).toEqual([0, 10]);
    expect(await physical(f.productId)).toEqual(before);
  });

  it("posts a receipt once for simultaneous same-key retries, then rejects competing stale receipt versions", async () => {
    const f = await fixture();
    let request = await service.saveClosing(owner, f.input);
    request = await transition(request, "approve", { sourceWarehouseId: source });
    request = await transition(request, "prepare"); request = await transition(request, "ready");
    request = await transition(request, "dispatch", { sourceWarehouseId: source });
    const shipment = request.shipments[0], allocation = shipment.allocations[0];
    const input: ClosingTransitionInput = { action: "receive", idempotencyKey: key(), version: request.version, shipmentId: shipment.id, items: [{ allocationId: allocation.id, qty: 4 }] };
    const retried = await overlap([() => service.transitionReplenishment(owner, request.id, input), () => service.transitionReplenishment(owner, request.id, input)]);
    expect(retried.every(result => result.status === "fulfilled")).toBe(true);
    request = await service.getReplenishment(owner, request.id);
    expect(request.items[0].receivedQty).toBe(4);
    const before = await db.select().from(schema.wmsStockMovement).where(eq(schema.wmsStockMovement.productId, f.productId));
    const raced = await overlap([() => transition(request, "receive", { shipmentId: shipment.id, items: [{ allocationId: allocation.id, qty: 6 }] }), () => transition(request, "receive", { shipmentId: shipment.id, items: [{ allocationId: allocation.id, qty: 6 }] })]);
    expect(raced.filter(result => result.status === "fulfilled")).toHaveLength(1);
    const rejection = raced.find(result => result.status === "rejected") as PromiseRejectedResult;
    expect(rejection.reason).toMatchObject({ status: 409 });
    const final = await service.getReplenishment(owner, request.id);
    expect(final.status).toBe("completed"); expect(final.items[0].receivedQty).toBe(10);
    expect((await physical(f.productId))[destination]).toBe(10);
    expect((await db.select().from(schema.wmsStockMovement).where(eq(schema.wmsStockMovement.productId, f.productId))).length - before.length).toBe(2);
  });
});

async function serviceImport() {
  service = await import("@/lib/wms-replenishment");
  stockService = await import("@/lib/wms-service");
}
