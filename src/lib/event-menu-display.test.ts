import { describe, expect, it } from "vitest";
import { eventDisplayMenu, eventEntryAvailable } from "@/lib/event-menu-display";
import type { EventMenuEntry, EventMenuProduct } from "@/lib/event-menu-types";

const now = Date.parse("2026-10-24T10:00:00Z");
const products: EventMenuProduct[] = [{ id: "coffee", name: "Kopi", category: "Coffee", imageUrl: null, description: null, stock: "ready", variants: [{ id: "cold", label: "Cold", price: 20000 }] }];
const entry: EventMenuEntry = { id: "entry", eventId: "event", kind: "item", name: "Kopi Event", description: null, menuItemId: "coffee", variantId: "cold", price: 15000, status: "active", startsAt: "2026-10-24T09:00:00Z", endsAt: "2026-10-24T11:00:00Z", quota: null, usedQuantity: 10000, sortOrder: 0, groups: [] };

describe("event menu display", () => {
  it("shows contextual price without mutating regular catalog and treats null quota as unlimited", () => {
    const menu = eventDisplayMenu([entry], products, now);
    expect(menu[0]).toMatchObject({ id: "event:entry", stock: "ready", variants: [{ id: "event", price: 15000 }] });
    expect(products[0].variants[0].price).toBe(20000);
  });
  it("honors half-open schedules, manually sold out items and quota", () => {
    expect(eventEntryAvailable(entry, products, Date.parse(entry.startsAt))).toBe(true);
    expect(eventEntryAvailable(entry, products, Date.parse(entry.endsAt))).toBe(false);
    expect(eventEntryAvailable({ ...entry, quota: 10000 }, products, now)).toBe(false);
    expect(eventEntryAvailable(entry, [{ ...products[0], stock: "sold_out" }], now)).toBe(false);
  });
  it("updates scheduled availability when time crosses the start and end", () => {
    const start = Date.parse(entry.startsAt);
    expect(eventDisplayMenu([entry], products, start - 1)[0].stock).toBe("sold_out");
    expect(eventDisplayMenu([entry], products, start)[0].stock).toBe("ready");
    expect(eventDisplayMenu([entry], products, Date.parse(entry.endsAt))[0].stock).toBe("sold_out");
  });
  it("requires an available option for every bundle group and rejects missing variants", () => {
    const bundle: EventMenuEntry = { ...entry, kind: "bundle", menuItemId: null, variantId: null, groups: [{ id: "drink", name: "Minuman", quantity: 1, options: [{ itemId: "coffee", variantId: "cold" }] }] };
    expect(eventEntryAvailable(bundle, products, now)).toBe(true);
    expect(eventEntryAvailable({ ...bundle, groups: [...bundle.groups, { id: "food", name: "Makanan", quantity: 1, options: [{ itemId: "missing", variantId: "regular" }] }] }, products, now)).toBe(false);
    expect(eventEntryAvailable({ ...entry, variantId: "missing" }, products, now)).toBe(false);
  });
});
