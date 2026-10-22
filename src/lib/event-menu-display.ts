import type { MenuItem } from "@/lib/garage-api-types";
import type { EventMenuEntry, EventMenuProduct } from "@/lib/event-menu-types";

export type EventMenuSelection = { groupId: string; itemId: string; variantId: string };
export type EventDigitalMenuContext = {
  mode?: "main" | "event-only";
  eventId: string;
  slug: string;
  title: string;
  startsAt: string;
  endsAt: string;
  preview?: boolean;
  entries: EventMenuEntry[];
  products: EventMenuProduct[];
};

export type EventDisplayVariant = MenuItem["variants"][number] & { eventPrice?: boolean; eventEntryId?: string; eventUnavailable?: "quota" | "product" | "schedule" };

/** Merge into the already visibility-filtered regular menu; never revive a hidden standalone product. */
export function mergeMainEventMenu(regularItems: MenuItem[], context: EventDigitalMenuContext, now = Date.now()): MenuItem[] {
  const bundles = eventDisplayMenu(context.entries.filter(entry => entry.kind === "bundle" && entry.status === "active"), context.products, now);
  const singles = regularItems.filter(item => !item.id.startsWith("event:")).map(item => {
    let contextual = false;
    const variants = item.variants.map((variant): EventDisplayVariant => {
      const entry = context.entries.find(row => row.kind === "item" && row.menuItemId === item.id && row.variantId === variant.id && row.status === "active" && now >= Date.parse(row.startsAt) && now < Date.parse(row.endsAt));
      if (!entry) return (variant as EventDisplayVariant).eventEntryId ? { ...variant, eventUnavailable: "schedule" } : variant;
      contextual = true;
      const unavailable = entry.quota !== null && entry.usedQuantity >= entry.quota ? "quota" : !eventEntryAvailable(entry, context.products, now) ? "product" : undefined;
      return { ...variant, price: entry.price, eventPrice: true, eventEntryId: entry.id, ...(unavailable ? { eventUnavailable: unavailable } : {}) };
    });
    return { ...item, variants, stock: variants.length && variants.every(variant => variant.eventUnavailable) ? "sold_out" as const : item.stock, tags: contextual && !item.tags.includes("Menu Event") ? [...item.tags, "Menu Event"] : item.tags };
  });
  return [...bundles, ...singles];
}

export function eventEntryAvailable(entry: EventMenuEntry, products: EventMenuProduct[], now = Date.now()) {
  if (entry.status !== "active" || now < Date.parse(entry.startsAt) || now >= Date.parse(entry.endsAt)) return false;
  if (entry.quota !== null && entry.usedQuantity >= entry.quota) return false;
  const available = (itemId: string, variantId: string | null) => {
    const product = products.find((p) => p.id === itemId);
    return Boolean(product && (entry.kind === "bundle" || product.showInDigitalMenu !== false) && product.stock !== "sold_out" && (!variantId || product.variants.some((v) => v.id === variantId)));
  };
  if (entry.kind === "item") return Boolean(entry.menuItemId && available(entry.menuItemId, entry.variantId));
  return entry.groups.length > 0 && entry.groups.every((group) => group.options.some((option) => available(option.itemId, option.variantId)));
}

/** Display-only products: never written to the master catalog or sent as regular order IDs. */
export function eventDisplayMenu(entries: EventMenuEntry[], products: EventMenuProduct[], now = Date.now()): MenuItem[] {
  return entries.map((entry) => {
    const product = products.find((p) => p.id === entry.menuItemId);
    const variant = product?.variants.find((v) => v.id === entry.variantId);
    return {
      id: `event:${entry.id}`,
      name: entry.name,
      category: entry.kind === "bundle" ? "Paket Event" : product?.category ?? "Menu Event",
      section: entry.kind === "bundle" ? "Paket Event" : product?.category ?? "Menu Event",
      variants: [{ id: "event", label: variant?.label ?? "Harga Event", price: entry.price }],
      stock: eventEntryAvailable(entry, products, now) ? "ready" : "sold_out",
      prep: "Sesuai menu",
      tags: [entry.kind === "bundle" ? "Paket Event" : "Menu Event"],
      description: entry.description ?? product?.description ?? undefined,
      imageUrl: product?.imageUrl ?? undefined,
      productType: entry.kind === "bundle" ? "bundle" : "menu",
      showInDigitalMenu: true,
    };
  });
}
