import { describe, expect, it } from "vitest";
import { closingDateSchema, closingQuantitySchema, saveClosingSchema, replenishmentActionSchema, closingSettingsSchema, shortageActionSchema, parseReplenishmentFilters } from "@/lib/wms-replenishment-validation";

const productId = "e87e9c30-f01c-4bdb-9343-4be22d8ff0a9";
const input = { idempotencyKey: "closing-test-1", division: "bar", businessDate: "2026-10-23", neededDate: "2026-10-24", warehouseId: productId, items: [{ productId, physicalQty: null, targetQty: 10, requestedQty: 5 }] };

describe("Closing HTTP boundary validation", () => {
  it("rejects impossible calendar dates and accepts leap-day correctly", () => {
    expect(closingDateSchema.safeParse("2026-02-29").success).toBe(false);
    expect(closingDateSchema.safeParse("2028-02-29").success).toBe(true);
  });
  it("keeps uncounted separate from zero and rejects nonfinite/negative/excess precision", () => {
    expect(saveClosingSchema.parse(input).items[0].physicalQty).toBeNull();
    for (const qty of [-1, Infinity, NaN, 0.00001]) expect(closingQuantitySchema.safeParse(qty).success).toBe(false);
    expect(closingQuantitySchema.safeParse(1.1234).success).toBe(true);
  });
  it("rejects duplicate materials, forged actor fields, stale edits without version and past need date", () => {
    expect(saveClosingSchema.safeParse({ ...input, items: [input.items[0], input.items[0]] }).success).toBe(false);
    expect(saveClosingSchema.safeParse({ ...input, role: "Owner" }).success).toBe(false);
    expect(saveClosingSchema.safeParse({ ...input, id: productId }).success).toBe(false);
    expect(saveClosingSchema.safeParse({ ...input, neededDate: "2026-10-22" }).success).toBe(false);
  });
  it("requires receipt allocation and shipment identity; rejects duplicate allocations", () => {
    const receipt = { action: "receive", idempotencyKey: "receipt-test-1", version: 1, shipmentId: productId, items: [{ allocationId: productId, qty: 1 }] };
    expect(replenishmentActionSchema.safeParse(receipt).success).toBe(true);
    expect(replenishmentActionSchema.safeParse({ ...receipt, shipmentId: undefined }).success).toBe(false);
    expect(replenishmentActionSchema.safeParse({ ...receipt, items: [...receipt.items, ...receipt.items] }).success).toBe(false);
    expect(replenishmentActionSchema.safeParse({ ...receipt, items: [{ itemId: productId, qty: 1 }] }).success).toBe(false);
  });
  it("rejects invalid settings time, empty settings patch and unauthorized arbitrary fields", () => {
    expect(closingSettingsSchema.safeParse({ idempotencyKey: "setting-test-1", openTime: "25:00" }).success).toBe(false);
    expect(closingSettingsSchema.safeParse({ idempotencyKey: "setting-test-1" }).success).toBe(false);
    expect(shortageActionSchema.safeParse({ idempotencyKey: "shortage-test-1", version: 1, action: "procured" }).success).toBe(false);
  });
  it("rejects malformed filters and reversed/oversized date ranges", () => {
    expect(parseReplenishmentFilters(new URL("https://garage.test/?from=2026-10-24&to=2026-10-23")).success).toBe(false);
    expect(parseReplenishmentFilters(new URL("https://garage.test/?division=unknown")).success).toBe(false);
    expect(parseReplenishmentFilters(new URL("https://garage.test/?from=2024-01-01&to=2026-01-01")).success).toBe(false);
  });
});
