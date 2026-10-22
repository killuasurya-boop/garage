import { randomUUID, createHash } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { and, eq } from "drizzle-orm";
import { setupGarageTestDb, seedGarageBasics, teardownGarageTestDb, type GarageTestDb } from "@/lib/test-helpers/garage-test-db";
import type { ClosingActor, SaveClosingInput, ClosingTransitionInput } from "@/lib/wms-replenishment-types";

/* eslint-disable @typescript-eslint/no-explicit-any */
let t: GarageTestDb;
let svc: typeof import("@/lib/wms-replenishment");
let stockSvc: typeof import("@/lib/wms-service");
let owner: ClosingActor, bar: ClosingActor, kitchen: ClosingActor, warehouse: ClosingActor;
let wh: Record<string, string>;
let posBaseline: string;
let sequence = 0;
const key = () => randomUUID();

async function protectedSnapshot() {
  // Real POS records, including an active order and captured payment, must survive every WMS path.
  const tables = [t.schema.productCategories, t.schema.menuItems, t.schema.menuVariants, t.schema.orders, t.schema.orderItems, t.schema.payments, t.schema.cashSessions, t.schema.supplierInvoices, t.schema.expenses, t.schema.paymentSettlements, t.schema.wmsReceiving, t.schema.wmsReceivingItem];
  const rows = await Promise.all(tables.map(table => t.getDb().select().from(table)));
  return createHash("sha256").update(JSON.stringify(rows.map(list => list.map((r: any) => JSON.stringify(r)).sort()))).digest("hex");
}
async function balance(productId: string, warehouseId: string) {
  const [row] = await t.getDb().select().from(t.schema.wmsWarehouseStock).where(and(eq(t.schema.wmsWarehouseStock.productId, productId), eq(t.schema.wmsWarehouseStock.warehouseId, warehouseId)));
  return Number(row?.qty ?? 0);
}
async function moves(productId: string) {
  return t.getDb().select().from(t.schema.wmsStockMovement).where(eq(t.schema.wmsStockMovement.productId, productId));
}
async function fixture(mainQty = 10, destinationQty = 2, division: "bar" | "dapur" = "bar") {
  sequence++;
  const [product] = await t.getDb().insert(t.schema.wmsProduct).values({ sku: `CLOSE-${sequence}`, name: `Bahan terdaftar ${sequence}`, category: `Closing ${division}`, unit: "L", minStock: 10, hpp: 12000 }).returning();
  const businessDate = new Date(Date.UTC(2026, 0, sequence)).toISOString().slice(0, 10);
  const neededDate = new Date(Date.UTC(2026, 0, sequence + 1)).toISOString().slice(0, 10);
  await stockSvc.runInTx(async tx => {
    if (mainQty) await stockSvc.recordStockMovement(tx, { type: "in", productId: product.id, warehouseId: wh.main, deltaQty: mainQty, hpp: 12000, batchNo: `EARLY-${sequence}`, expiredAt: new Date("2090-01-01"), userId: owner.id });
    if (destinationQty) await stockSvc.recordStockMovement(tx, { type: "in", productId: product.id, warehouseId: wh[division], deltaQty: destinationQty, hpp: 12000, batchNo: `DIV-${sequence}`, userId: owner.id });
  });
  const input: SaveClosingInput = { idempotencyKey: key(), division, warehouseId: wh[division], businessDate, neededDate, items: [{ productId: product.id, physicalQty: destinationQty, targetQty: 10, requestedQty: 10 - destinationQty }] };
  return { productId: product.id, input, actor: division === "bar" ? bar : kitchen };
}
async function step(request: any, action: ClosingTransitionInput["action"], actor = owner, extra: Partial<ClosingTransitionInput> = {}) {
  return svc.transitionReplenishment(actor, request.id, { action, version: request.version, idempotencyKey: key(), ...extra });
}
async function ready(input: SaveClosingInput, actor = bar) {
  let request = await svc.saveClosing(actor, { ...input, submit: true });
  request = await step(request, "approve", owner, { sourceWarehouseId: wh.main });
  request = await step(request, "prepare", warehouse);
  return step(request, "ready", warehouse);
}

beforeAll(async () => {
  t = await setupGarageTestDb();
  svc = await import("@/lib/wms-replenishment");
  stockSvc = await import("@/lib/wms-service");
  const basic = await seedGarageBasics(t, { userId: "closing-owner" });
  owner = { id: basic.userId, name: "Owner", role: "Owner", outletId: basic.outletId };
  bar = { ...owner, id: "closing-bar", name: "Bar", role: "Kasir", workstation: "bar" };
  kitchen = { ...bar, id: "closing-dapur", name: "Dapur", workstation: "dapur" };
  warehouse = { ...bar, id: "closing-warehouse", name: "Gudang", workstation: null };
  await t.getDb().insert(t.schema.user).values([bar, kitchen, warehouse].map(a => ({ id: a.id, name: a.name, email: `${a.id}@garage.id` })));
  await t.getDb().insert(t.schema.staffProfiles).values([owner, bar, kitchen, warehouse].map(a => ({ userId: a.id, outletId: a.outletId, role: a.role, workstation: a.workstation })));
  wh = {};
  for (const kind of ["main", "bar", "dapur", "transit", "damaged"] as const) {
    const [row] = await t.getDb().insert(t.schema.wmsWarehouse).values({ code: `CLOSE-${kind}`, name: `Closing ${kind}`, type: kind, area: "umum" }).returning();
    wh[kind] = row.id;
  }
  await t.getDb().insert(t.schema.wmsCategory).values([{ name: "Closing bar", area: "bar" }, { name: "Closing dapur", area: "dapur" }]);
  await svc.updateClosingSettings(owner, { idempotencyKey: key(), locations: Object.entries(wh).map(([kind, warehouseId]) => ({ warehouseId, kind: kind as "main" | "bar" | "dapur" | "transit" | "damaged", area: "umum" })), access: [{ userId: bar.id, warehouseId: wh.bar, capability: "bar" }, { userId: kitchen.id, warehouseId: wh.dapur, capability: "dapur" }, { userId: warehouse.id, warehouseId: wh.main, capability: "warehouse" }] });
  const [order] = await t.getDb().insert(t.schema.orders).values({ orderNo: "CLOSING-POS-PROTECTED", outletId: owner.outletId, channel: "Dine In", status: "preparing", subtotal: 20000, service: 0, tax: 0, total: 20000 }).returning();
  await t.getDb().insert(t.schema.orderItems).values({ orderId: order.id, menuItemId: "itm-coffee", variantId: "reg", itemName: "Kopi Test", variantLabel: "Regular", unitPrice: 20000, qty: 1, lineTotal: 20000 });
  await t.getDb().insert(t.schema.payments).values({ orderId: order.id, method: "cash", amount: 20000, status: "captured" });
  await t.getDb().insert(t.schema.productCategories).values({ name: "Kategori POS terlindungi", station: "bar", posGroup: "Bar" });
  posBaseline = await protectedSnapshot();
}, 120_000);
afterEach(async () => {
  vi.useRealTimers();
  if (posBaseline) expect(await protectedSnapshot()).toBe(posBaseline);
});
afterAll(async () => { if (t) await teardownGarageTestDb(t); });

describe("Closing stock: isolated ledger integration", () => {
  it("saves observed variance, submits the draft, and records no-request closing without adjusting stock", async () => {
    const f = await fixture();
    const baseline = await moves(f.productId);
    const draft = await svc.saveClosing(bar, { ...f.input, items: [{ ...f.input.items[0], physicalQty: 1, requestedQty: 9 }] });
    expect(draft.status).toBe("draft"); expect(draft.items[0].variance).toBe(-1);
    const submitted = await svc.saveClosing(bar, { ...f.input, id: draft.id, version: draft.version, idempotencyKey: key(), submit: true, items: [{ ...f.input.items[0], physicalQty: 1, requestedQty: 9 }] });
    expect(submitted.status).toBe("submitted"); expect(submitted.history.length).toBe(2);
    expect(await balance(f.productId, wh.bar)).toBe(2); expect(await moves(f.productId)).toEqual(baseline);
    const k = await fixture(0, 2, "dapur");
    const none = await svc.saveClosing(k.actor, { ...k.input, submit: true, noRequest: true, items: [{ ...k.input.items[0], requestedQty: 0, overrideReason: "Persediaan cukup untuk rencana besok" }] });
    expect(none.status).toBe("completed"); expect(await balance(k.productId, wh.dapur)).toBe(2);
  });

  it("enforces division/outlet authorization at the service boundary", async () => {
    const f = await fixture();
    await expect(svc.saveClosing(kitchen, f.input)).rejects.toMatchObject({ status: 403 });
    const request = await svc.saveClosing(bar, { ...f.input, idempotencyKey: key() });
    await expect(svc.getReplenishment(kitchen, request.id)).rejects.toMatchObject({ status: 403 });
    await expect(svc.getReplenishment({ ...owner, outletId: randomUUID() }, request.id)).rejects.toMatchObject({ status: 404 });
    await expect(step(request, "approve", warehouse, { sourceWarehouseId: wh.main })).rejects.toMatchObject({ status: 403 });
  });

  it("replays identical creates once, rejects changed payload reuse, and rejects stale draft edits", async () => {
    const f = await fixture();
    const draft = await svc.saveClosing(bar, f.input);
    const replay = await svc.saveClosing(bar, f.input);
    expect(replay.id).toBe(draft.id); expect(replay.version).toBe(draft.version);
    expect((await svc.getReplenishment(bar, draft.id)).history.length).toBe(1);
    await expect(svc.saveClosing(bar, { ...f.input, note: "changed" })).rejects.toMatchObject({ status: 409 });
    const edit = await svc.saveClosing(bar, { ...f.input, id: draft.id, version: draft.version, idempotencyKey: key(), note: "saved" });
    expect(edit.version).toBe(draft.version + 1);
    await expect(svc.saveClosing(bar, { ...f.input, id: draft.id, version: draft.version, idempotencyKey: key() })).rejects.toMatchObject({ status: 409 });
    expect((await svc.getReplenishment(bar, draft.id)).note).toBe("saved");
  });

  it("subtracts confirmed incoming once when recommending another closing", async () => {
    const f = await fixture();
    let first = await svc.saveClosing(bar, { ...f.input, submit: true });
    first = await step(first, "approve", owner, { sourceWarehouseId: wh.main });
    expect(first.status).toBe("approved");
    const second = await svc.saveClosing(bar, { ...f.input, idempotencyKey: key(), businessDate: "2025-12-31", items: [{ ...f.input.items[0], physicalQty: 1, requestedQty: 1 }] });
    expect(second.items[0]).toMatchObject({ incomingQty: 8, recommendationQty: 1 });
    const catalog = await svc.getClosingCatalog(bar, "bar", f.input.neededDate);
    expect(catalog.products.find(p => p.productId === f.productId)?.incomingQty).toBe(8);
    expect(await balance(f.productId, wh.main)).toBe(10);
  });

  it("consolidates demand once across compatible sources and excludes draft documents", async () => {
    const f = await fixture();
    const [secondSource] = await t.getDb().insert(t.schema.wmsWarehouse).values({ code: `CLOSE-SECOND-${sequence}`, name: "Gudang kompatibel kedua", type: "main", area: "umum" }).returning();
    await svc.updateClosingSettings(owner, { idempotencyKey: key(), locations: [{ warehouseId: secondSource.id, kind: "main", area: "umum" }] });
    const draft = await svc.saveClosing(bar, f.input);
    const draftPreparation = await svc.getPreparation(owner, { businessDate: f.input.businessDate });
    expect(draftPreparation.sourceLocations.map(source => source.id)).toEqual(expect.arrayContaining([wh.main, secondSource.id]));
    expect(draftPreparation.requests).toHaveLength(0);
    expect(draftPreparation.pickList).toHaveLength(0);
    expect(draftPreparation.notifications.some(notification => notification.requestId === draft.id)).toBe(false);
    let request = await svc.saveClosing(bar, { ...f.input, id: draft.id, version: draft.version, idempotencyKey: key(), submit: true });
    const submittedPreparation = await svc.getPreparation(owner, { businessDate: f.input.businessDate });
    const submittedLines = submittedPreparation.pickList.filter(line => line.productId === f.productId);
    expect(submittedLines.reduce((sum, line) => sum + line.totalRequested, 0)).toBe(8);
    expect(submittedLines.flatMap(line => line.requests)).toEqual([expect.objectContaining({ requestId: request.id, qty: 8, reservedQty: 0 })]);
    request = await step(request, "approve", owner, { sourceWarehouseId: wh.main });
    const approvedPreparation = await svc.getPreparation(owner, { businessDate: f.input.businessDate });
    const approvedLines = approvedPreparation.pickList.filter(line => line.productId === f.productId);
    expect(approvedLines.reduce((sum, line) => sum + line.totalRequested, 0)).toBe(8);
    expect(approvedLines).toEqual([expect.objectContaining({ sourceWarehouseId: wh.main, totalRequested: 8, totalReserved: 8, onHand: 10, available: 2 })]);
    expect(approvedLines.flatMap(line => line.requests)).toEqual([expect.objectContaining({ requestId: request.id, qty: 8, reservedQty: 8 })]);
    expect(await balance(f.productId, wh.main)).toBe(10);
    expect(await balance(f.productId, secondSource.id)).toBe(0);
  });

  it("serializes competing approvals without over-reserving or moving physical stock", async () => {
    const f = await fixture(10, 0);
    const one = await svc.saveClosing(bar, { ...f.input, submit: true });
    const two = await svc.saveClosing(bar, { ...f.input, businessDate: "2025-12-30", idempotencyKey: key(), submit: true });
    const baseline = await moves(f.productId);
    const results = await Promise.all([step(one, "approve", owner, { sourceWarehouseId: wh.main }), step(two, "approve", owner, { sourceWarehouseId: wh.main })]);
    expect(results.map(r => Number(r.items[0].approvedQty)).sort((a, b) => a - b)).toEqual([0, 10]);
    const reservations = await t.getDb().select().from(t.schema.wmsClosingReservation).where(eq(t.schema.wmsClosingReservation.productId, f.productId));
    expect(reservations.reduce((sum: number, r: any) => sum + Number(r.qty), 0)).toBe(10);
    expect(await balance(f.productId, wh.main)).toBe(10); expect(await moves(f.productId)).toEqual(baseline);
    await expect(stockSvc.runInTx(tx => stockSvc.recordStockMovement(tx, { type: "transfer", productId: f.productId, warehouseId: wh.main, deltaQty: -1, hpp: 12000 }))).rejects.toThrow(/reservasi/);
  });

  it("dispatches FEFO into transit, receives partially with damage, and replays without duplicate movements", async () => {
    const f = await fixture(3, 2);
    await stockSvc.runInTx(tx => stockSvc.recordStockMovement(tx, { type: "in", productId: f.productId, warehouseId: wh.main, deltaQty: 7, hpp: 15000, batchNo: "LATER", expiredAt: new Date("2091-01-01") }));
    let request = await ready(f.input);
    const dispatchInput: ClosingTransitionInput = { action: "dispatch", version: request.version, idempotencyKey: key(), sourceWarehouseId: wh.main };
    request = await svc.transitionReplenishment(warehouse, request.id, dispatchInput);
    const shipment = request.shipments[0];
    expect(shipment.allocations.map((a: any) => [a.batchNo, Number(a.qty)])).toEqual([[`EARLY-${sequence}`, 3], ["LATER", 5]]);
    expect(await balance(f.productId, wh.main)).toBe(2); expect(await balance(f.productId, wh.transit)).toBe(8); expect(await balance(f.productId, wh.bar)).toBe(2);
    const afterDispatch = await moves(f.productId);
    await svc.transitionReplenishment(warehouse, request.id, dispatchInput);
    expect(await moves(f.productId)).toEqual(afterDispatch);
    const receiveInput: ClosingTransitionInput = { action: "receive", version: request.version, idempotencyKey: key(), shipmentId: shipment.id, reason: "Kemasan bocor saat serah terima", items: [{ allocationId: shipment.allocations[0].id, qty: 2, damagedQty: 1 }] };
    request = await svc.transitionReplenishment(bar, request.id, receiveInput);
    expect(request.status).toBe("partially_received"); expect(request.items[0]).toMatchObject({ receivedQty: 2, damagedQty: 1 });
    expect(await balance(f.productId, wh.bar)).toBe(4); expect(await balance(f.productId, wh.damaged)).toBe(1); expect(await balance(f.productId, wh.transit)).toBe(5);
    const afterReceipt = await moves(f.productId);
    await svc.transitionReplenishment(bar, request.id, receiveInput); expect(await moves(f.productId)).toEqual(afterReceipt);
    request = await step(request, "receive", bar, { shipmentId: shipment.id, items: [{ allocationId: shipment.allocations[1].id, qty: 5 }] });
    expect(await balance(f.productId, wh.transit)).toBe(0);
    expect(request.items[0]).toMatchObject({ receivedQty: 7, damagedQty: 1 });
    const total = await Promise.all([wh.main, wh.bar, wh.transit, wh.damaged].map(id => balance(f.productId, id)));
    expect(total.reduce((a, b) => a + b, 0)).toBe(12);
  });

  it("completes a delivery only after the division confirms every dispatched quantity", async () => {
    const f = await fixture(10, 0, "dapur");
    let request = await ready(f.input, kitchen);
    request = await step(request, "dispatch", warehouse, { sourceWarehouseId: wh.main });
    const shipment = request.shipments[0];
    await expect(step(request, "receive", bar, { shipmentId: shipment.id, items: [{ allocationId: shipment.allocations[0].id, qty: 10 }] })).rejects.toMatchObject({ status: 403 });
    expect(await balance(f.productId, wh.dapur)).toBe(0);
    request = await step(request, "receive", kitchen, { shipmentId: shipment.id, items: [{ allocationId: shipment.allocations[0].id, qty: 4 }] });
    expect(request.status).toBe("partially_received");
    request = await step(request, "receive", kitchen, { shipmentId: shipment.id, items: [{ allocationId: shipment.allocations[0].id, qty: 6 }] });
    expect(request.status).toBe("completed"); expect(request.shipments[0].status).toBe("completed");
    expect(await balance(f.productId, wh.dapur)).toBe(10); expect(await balance(f.productId, wh.transit)).toBe(0);
  });

  it("lets management resolve fully accounted damage without another stock or financial movement", async () => {
    const f = await fixture(10, 0);
    let request = await ready(f.input);
    await expect(step(request, "resolve_difference", owner, { reason: "Selisih diperiksa" })).rejects.toMatchObject({ status: 409 });
    request = await step(request, "dispatch", warehouse, { sourceWarehouseId: wh.main });
    const shipment = request.shipments[0], allocation = shipment.allocations[0];
    request = await step(request, "receive", bar, { shipmentId: shipment.id, reason: "Satu kemasan bocor", items: [{ allocationId: allocation.id, qty: 8, damagedQty: 1 }] });
    await expect(step(request, "resolve_difference", owner, { reason: "Selisih diperiksa" })).rejects.toMatchObject({ status: 409 });
    expect(await balance(f.productId, wh.transit)).toBe(1);
    request = await step(request, "receive", bar, { shipmentId: shipment.id, items: [{ allocationId: allocation.id, qty: 1 }] });
    expect(request.status).toBe("partially_received");
    await expect(step(request, "resolve_difference", bar, { reason: "Selisih diperiksa" })).rejects.toMatchObject({ status: 403 });
    await expect(step(request, "resolve_difference", owner, { reason: "  a " })).rejects.toMatchObject({ status: 400 });
    const reservation = request.reservations[0];
    await t.getDb().update(t.schema.wmsClosingReservation).set({ qty: 1 }).where(eq(t.schema.wmsClosingReservation.id, reservation.id));
    await expect(step(request, "resolve_difference", owner, { reason: "Selisih diperiksa" })).rejects.toMatchObject({ status: 409 });
    await t.getDb().update(t.schema.wmsClosingReservation).set({ qty: 0 }).where(eq(t.schema.wmsClosingReservation.id, reservation.id));
    const beforeItems = request.items, beforeShipments = request.shipments, beforeMoves = await moves(f.productId);
    const beforeBalances = await Promise.all(Object.values(wh).map(id => balance(f.productId, id)));
    const input: ClosingTransitionInput = { action: "resolve_difference", version: request.version, idempotencyKey: key(), reason: "Kerusakan diverifikasi; tidak ada penggantian diperlukan" };
    const manager = { ...owner, role: "Manajer" };
    const resolved = await svc.transitionReplenishment(manager, request.id, input);
    expect(resolved.status).toBe("completed"); expect(resolved.version).toBe(request.version + 1);
    expect(resolved.items).toEqual(beforeItems); expect(resolved.shipments).toEqual(beforeShipments);
    expect(resolved.items[0]).toMatchObject({ requestedQty: 10, receivedQty: 9, damagedQty: 1 });
    expect(resolved.history.at(-1)).toMatchObject({ action: "Closing resolve_difference", actorId: owner.id, detail: { reason: input.reason, before: "partially_received", after: "completed" } });
    await svc.transitionReplenishment(manager, request.id, input);
    expect((await svc.getReplenishment(owner, request.id)).history).toHaveLength(resolved.history.length);
    expect(await moves(f.productId)).toEqual(beforeMoves);
    expect(await Promise.all(Object.values(wh).map(id => balance(f.productId, id)))).toEqual(beforeBalances);
  });

  it("rolls back the entire dispatch document and ledger when a later line has no eligible batch", async () => {
    const f = await fixture(10, 0);
    const g = await fixture(10, 0);
    const input = { ...f.input, items: [...f.input.items, ...g.input.items] };
    const request = await ready(input);
    const finalItem = [...request.items].sort((a, b) => a.id.localeCompare(b.id)).at(-1)!;
    await t.getDb().update(t.schema.wmsBatch).set({ expiredAt: new Date("2000-01-01") }).where(eq(t.schema.wmsBatch.productId, finalItem.productId));
    const before = [await moves(f.productId), await moves(g.productId)];
    await expect(step(request, "dispatch", warehouse, { sourceWarehouseId: wh.main })).rejects.toThrow();
    const after = await svc.getReplenishment(owner, request.id);
    expect(after.status).toBe("ready"); expect(after.version).toBe(request.version); expect(after.shipments).toHaveLength(0);
    expect([await moves(f.productId), await moves(g.productId)]).toEqual(before);
    expect(await balance(f.productId, wh.main)).toBe(10); expect(await balance(f.productId, wh.transit)).toBe(0);
  });

  it("approves a shortage proposal without buying, receiving, paying, or changing inventory", async () => {
    const f = await fixture(3, 0);
    let request = await svc.saveClosing(bar, { ...f.input, submit: true });
    request = await step(request, "approve", owner, { sourceWarehouseId: wh.main });
    expect(request.status).toBe("partially_available"); expect(request.items[0].approvedQty).toBe(3);
    const shortages = await svc.listShortages(warehouse, { neededDate: f.input.neededDate });
    const shortage = shortages.find(s => s.requestId === request.id)!;
    expect(shortage.qty).toBe(7); expect(shortage.estimatedCost).toBe(84000);
    const [supplier] = await t.getDb().insert(t.schema.wmsSupplier).values({ name: `Supplier ${sequence}` }).returning();
    const baseline = await moves(f.productId);
    await expect(svc.decideShortage(warehouse, shortage.id, { idempotencyKey: key(), action: "approve", supplierId: supplier.id })).rejects.toMatchObject({ status: 403 });
    await svc.decideShortage(owner, shortage.id, { idempotencyKey: key(), action: "approve", supplierId: supplier.id });
    expect(await balance(f.productId, wh.main)).toBe(3); expect(await moves(f.productId)).toEqual(baseline);
    expect((await svc.listShortages(owner, { neededDate: f.input.neededDate })).find(s => s.id === shortage.id)?.status).toBe("approved");
  });

  it("keeps previous operating date after midnight WIB and marks requests past cutoff", async () => {
    const f = await fixture();
    vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date("2026-10-22T17:30:00Z"));
    const catalog = await svc.getClosingCatalog(bar, "bar");
    expect(catalog.businessDate).toBe("2026-10-22"); expect(catalog.neededDate).toBe("2026-10-23");
    const request = await svc.saveClosing(bar, { ...f.input, businessDate: catalog.businessDate, neededDate: catalog.neededDate, submit: true });
    expect(request.late).toBe(true); expect(request.neededDate).toBe("2026-10-23");
  });
});
