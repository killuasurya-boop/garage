import { describe, expect, it } from "vitest";
import { bundleGroupSummary, bundleHasRestricted, bundleImageSources, bundleSelectionLabel, bundleUnavailableReason, eventDisplayMenu, eventEntryAvailable, mergeMainEventMenu } from "@/lib/event-menu-display";
import type { EventMenuEntry, EventMenuProduct } from "@/lib/event-menu-types";

const now = Date.parse("2026-10-24T10:00:00Z");
const products: EventMenuProduct[] = [{ id: "coffee", name: "Kopi", category: "Coffee", imageUrl: null, description: null, stock: "ready", variants: [{ id: "cold", label: "Cold", price: 20000 }] }];
const entry: EventMenuEntry = { id: "entry", eventId: "event", kind: "item", name: "Kopi Event", description: null, menuItemId: "coffee", variantId: "cold", price: 15000, status: "active", startsAt: "2026-10-24T09:00:00Z", endsAt: "2026-10-24T11:00:00Z", quota: null, usedQuantity: 10000, sortOrder: 0, groups: [], imageUrl: null };

describe("event menu display", () => {
  it("merges bundles first and contextual variants without duplicate or revived standalone products", () => {
    const regular = eventDisplayMenu([entry], products, now).map(item => ({ ...item, id: "coffee", variants: [{ id: "cold", label: "Cold", price: 20000 }, { id: "hot", label: "Hot", price: 18000 }] }));
    const bundle = { ...entry, id: "bundle", kind: "bundle" as const, menuItemId: null, variantId: null, groups: [{ id: "drink", name: "Minuman", quantity: 1, options: [{ itemId: "coffee", variantId: "cold" }] }] };
    const context = { eventId: "event", slug: "event", title: "Event", startsAt: entry.startsAt, endsAt: entry.endsAt, entries: [entry, bundle, { ...entry, id: "hidden", menuItemId: "hidden" }], products };
    const merged = mergeMainEventMenu(regular, context, now);
    expect(merged.map(item => item.id)).toEqual(["event:bundle", "coffee"]);
    expect(merged[1].variants).toEqual([{ id: "cold", label: "Cold", price: 15000, eventPrice: true, eventEntryId: "entry" }, { id: "hot", label: "Hot", price: 18000 }]);
    expect(regular[0].variants[0].price).toBe(20000);
    expect(mergeMainEventMenu(regular, context, Date.parse(entry.endsAt))[1].variants[0].price).toBe(20000);
  });
  it("shows contextual price without mutating regular catalog and treats null quota as unlimited", () => {
    const menu = eventDisplayMenu([entry], products, now);
    expect(menu[0]).toMatchObject({ id: "event:entry", stock: "ready", variants: [{ id: "event", price: 15000 }] });
    expect(products[0].variants[0].price).toBe(20000);
  });
  it("retains exhausted event prices and disables only the affected variant", () => {
    const regular = eventDisplayMenu([entry], products, now).map(item => ({ ...item, id: "coffee", variants: [{ id: "cold", label: "Cold", price: 20000 }, { id: "hot", label: "Hot", price: 18000 }] }));
    const context = { eventId: "event", slug: "event", title: "Event", startsAt: entry.startsAt, endsAt: entry.endsAt, entries: [{ ...entry, quota: 10000 }], products };
    const item = mergeMainEventMenu(regular, context, now)[0];
    expect(item.stock).toBe("ready");
    expect(item.variants[0]).toMatchObject({ price: 15000, eventEntryId: "entry", eventUnavailable: "quota" });
    expect(item.variants[1]).toEqual({ id: "hot", label: "Hot", price: 18000 });
    expect(mergeMainEventMenu([{ ...regular[0], variants: [regular[0].variants[0]] }], context, now)[0].stock).toBe("sold_out");
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
    expect(eventEntryAvailable(entry, [{ ...products[0], showInDigitalMenu: false }], now)).toBe(false);
    expect(eventEntryAvailable(bundle, [{ ...products[0], showInDigitalMenu: false }], now)).toBe(true);
  });
});

describe("bundle display helpers", () => {
  const catalog: EventMenuProduct[] = [
    { id: "rokok", name: "Black Matcha", category: "Rokok", imageUrl: null, description: null, stock: "ready", showInDigitalMenu: false, bundleOnly: true, variants: [{ id: "regular", label: "Regular", price: 18000 }] },
    { id: "aren", name: "Gula Aren", category: "Coffee", imageUrl: "/menu-photos/aren.webp", description: null, stock: "ready", variants: [{ id: "cold", label: "Cold", price: 23000 }, { id: "hot", label: "Hot", price: 23000 }] },
    { id: "matcha", name: "Matcha", category: "Non-Coffee", imageUrl: null, description: null, stock: "ready", variants: [{ id: "cold", label: "Cold", price: 22000 }, { id: "hot", label: "Hot", price: 20000 }] },
    { id: "nugget", name: "Nugget", category: "Cemilan", imageUrl: "/menu-photos/nugget.webp", description: null, stock: "ready", variants: [{ id: "regular", label: "Regular", price: 12000 }] },
  ];
  const paket: EventMenuEntry = { ...entry, id: "paket", kind: "bundle", name: "Bundling 50.000", menuItemId: null, variantId: null, price: 50000, usedQuantity: 0, groups: [
    { id: "r", name: "Rokok", quantity: 1, options: [{ itemId: "rokok", variantId: "regular" }] },
    { id: "m", name: "Pilihan Minuman", quantity: 1, options: [{ itemId: "aren", variantId: "hot" }, { itemId: "aren", variantId: "cold" }, { itemId: "matcha", variantId: "hot" }, { itemId: "matcha", variantId: "cold" }] },
    { id: "c", name: "Cemilan", quantity: 1, options: [{ itemId: "nugget", variantId: "regular" }] },
  ] };

  it("summarises groups without the 'Pilihan … pilihan' duplication", () => {
    expect(bundleGroupSummary(paket.groups[1], catalog)).toEqual({ label: "Minuman", choice: "pilih 1 dari 2", detail: "Gula Aren, Matcha · Hot/Cold" });
    expect(bundleGroupSummary(paket.groups[0], catalog)).toEqual({ label: "Rokok", choice: "Black Matcha", detail: null });
  });

  it("explains why a bundle cannot be ordered", () => {
    expect(bundleUnavailableReason(paket, catalog, now)).toBeNull();
    expect(bundleUnavailableReason({ ...paket, startsAt: "2026-10-24T12:00:00Z", endsAt: "2026-10-24T15:00:00Z" }, catalog, now)).toBe("Mulai 19.00");
    expect(bundleUnavailableReason({ ...paket, quota: 5, usedQuantity: 5 }, catalog, now)).toBe("Kuota habis");
  });

  it("uses the bundle photo, else a collage of non-tobacco component photos", () => {
    expect(bundleImageSources({ ...paket, imageUrl: "/garage-uploads/event-menu/p.webp" }, catalog)).toEqual(["/garage-uploads/event-menu/p.webp"]);
    expect(bundleImageSources(paket, catalog)).toEqual(["/menu-photos/aren.webp", "/menu-photos/nugget.webp"]);
  });

  it("flags tobacco bundles and builds a short cart label", () => {
    expect(bundleHasRestricted(paket, catalog)).toBe(true);
    expect(bundleSelectionLabel(paket, [{ groupId: "r", itemId: "rokok", variantId: "regular" }, { groupId: "m", itemId: "aren", variantId: "hot" }, { groupId: "c", itemId: "nugget", variantId: "regular" }], catalog)).toBe("Black Matcha · Gula Aren Hot · Nugget");
  });
});
