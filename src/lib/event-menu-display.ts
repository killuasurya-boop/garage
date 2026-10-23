import type { MenuItem } from "@/lib/garage-api-types";
import type { EventMenuEntry, EventMenuGroup, EventMenuProduct } from "@/lib/event-menu-types";

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
      imageUrl: (entry.kind === "bundle" ? entry.imageUrl : null) ?? product?.imageUrl ?? undefined,
      productType: entry.kind === "bundle" ? "bundle" : "menu",
      showInDigitalMenu: true,
    };
  });
}

const variantText = (label: string | undefined) => (label && label.toLowerCase() !== "regular" ? label : "");
const timeFormat = new Intl.DateTimeFormat("id-ID", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" });

/** Ringkasan satu grup paket untuk kartu: "Minuman: pilih 1 dari 5" + daftar nama · Hot/Cold. */
export function bundleGroupSummary(group: EventMenuGroup, products: EventMenuProduct[]) {
  const label = group.name.replace(/^pilih(an)?\s+/i, "").trim() || group.name;
  const options = group.options.flatMap((option) => {
    const product = products.find((p) => p.id === option.itemId);
    const variant = product?.variants.find((v) => v.id === option.variantId);
    return product && variant ? [{ product, variant }] : [];
  });
  const count = group.quantity > 1 ? `${group.quantity}× ` : "";
  if (options.length === 1) {
    const { product, variant } = options[0];
    return { label, choice: `${count}${[product.name, variantText(variant.label)].filter(Boolean).join(" · ")}`, detail: null as string | null };
  }
  const names = [...new Set(options.map((o) => o.product.name))];
  const labels = [...new Set(options.map((o) => variantText(o.variant.label)).filter(Boolean))];
  const multiVariant = names.some((name) => options.filter((o) => o.product.name === name).length > 1);
  return {
    label,
    choice: `${count}pilih 1 dari ${names.length}`,
    detail: `${names.join(", ")}${multiVariant && labels.length ? ` · ${labels.join("/")}` : ""}`,
  };
}

/** Alasan paket tidak bisa dipesan (null = tersedia). */
export function bundleUnavailableReason(entry: EventMenuEntry, products: EventMenuProduct[], now = Date.now()): string | null {
  if (entry.status !== "active") return "Tidak aktif";
  if (now < Date.parse(entry.startsAt)) return `Mulai ${timeFormat.format(new Date(entry.startsAt))}`;
  if (now >= Date.parse(entry.endsAt)) return "Sudah berakhir";
  if (entry.quota !== null && entry.usedQuantity >= entry.quota) return "Kuota habis";
  return eventEntryAvailable(entry, products, now) ? null : "Komponen habis";
}

/** Foto paket; tanpa foto → foto komponen (bukan rokok) untuk kolase, maks 3. */
export function bundleImageSources(entry: EventMenuEntry, products: EventMenuProduct[]): string[] {
  if (entry.imageUrl) return [entry.imageUrl];
  const sources: string[] = [];
  for (const group of entry.groups) {
    const photo = group.options.map((option) => products.find((p) => p.id === option.itemId)).find((p) => p?.imageUrl && !p.bundleOnly)?.imageUrl;
    if (photo && !sources.includes(photo)) sources.push(photo);
  }
  return sources.slice(0, 3);
}

/** Paket berisi produk khusus paket (rokok) → perlu konfirmasi 21+. */
export function bundleHasRestricted(entry: EventMenuEntry, products: EventMenuProduct[]) {
  return entry.groups.some((group) => group.options.some((option) => products.find((p) => p.id === option.itemId)?.bundleOnly));
}

/** Label isi paket di keranjang/struk: "Black Matcha · Gula Aren Hot · Kentang Ori". */
export function bundleSelectionLabel(entry: EventMenuEntry, selections: EventMenuSelection[], products: EventMenuProduct[]) {
  return entry.groups.map((group) => {
    const selection = selections.find((s) => s.groupId === group.id);
    const product = products.find((p) => p.id === selection?.itemId);
    const variant = product?.variants.find((v) => v.id === selection?.variantId);
    const name = [product?.name ?? selection?.itemId ?? group.name, variantText(variant?.label)].filter(Boolean).join(" ");
    return group.quantity > 1 ? `${group.quantity}× ${name}` : name;
  }).join(" · ");
}
