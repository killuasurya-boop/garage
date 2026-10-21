import { randomUUID } from "node:crypto";

import { and, eq, inArray, ne, sql } from "drizzle-orm";
import { z } from "zod";

import { getDb, type GarageDb } from "@/db";
import { auditLogs, eventMenuEntries, events, inventoryItems, menuItems, menuRecipes, menuVariants, orderItems, orders } from "@/db/schema";
import { EventError } from "@/lib/event-service";
import type { EventCartItem, EventMenuContext, EventMenuData, EventMenuEntry, EventMenuProduct, ResolvedEventLine } from "@/lib/event-menu-types";

type Executor = Pick<GarageDb, "select" | "insert" | "update" | "execute">;
type Actor = { userId: string; name: string; outletId?: string };
type MenuRow = typeof eventMenuEntries.$inferSelect;

const isoDate = z.string().datetime({ offset: true });
const productOption = z.object({ itemId: z.string().trim().min(1).max(120), variantId: z.string().trim().min(1).max(100) });
export const eventCartItemSchema = z.object({
  entryId: z.string().uuid(), qty: z.number().int().min(1).max(25), note: z.string().trim().max(160).optional(),
  selections: z.array(productOption.extend({ groupId: z.string().trim().min(1).max(80) })).max(8).optional(),
});
export const eventMenuEntrySchema = z.object({
  kind: z.enum(["item", "bundle"]), name: z.string().trim().min(2).max(120),
  description: z.string().trim().max(600).nullable().optional(),
  menuItemId: z.string().trim().min(1).max(120).nullable().optional(), variantId: z.string().trim().min(1).max(100).nullable().optional(),
  price: z.number().int().min(1).max(100_000_000), status: z.enum(["active", "inactive", "archived"]).default("active"),
  startsAt: isoDate, endsAt: isoDate, quota: z.number().int().min(1).max(1_000_000).nullable().default(null),
  sortOrder: z.number().int().min(0).max(100_000).default(0),
  groups: z.array(z.object({ id: z.string().trim().min(1).max(80), name: z.string().trim().min(1).max(100), quantity: z.number().int().min(1).max(10), options: z.array(productOption).min(1).max(40) })).max(8).default([]),
}).superRefine((v, ctx) => {
  if (Date.parse(v.endsAt) <= Date.parse(v.startsAt)) ctx.addIssue({ code: "custom", path: ["endsAt"], message: "Jam selesai harus setelah jam mulai." });
  if (v.kind === "item" && (!v.menuItemId || !v.variantId || v.groups.length)) ctx.addIssue({ code: "custom", path: ["menuItemId"], message: "Menu satuan wajib memilih produk/varian dan tidak memakai grup paket." });
  if (v.kind === "bundle" && (v.menuItemId || v.variantId || !v.groups.length)) ctx.addIssue({ code: "custom", path: ["groups"], message: "Paket wajib mempunyai grup pilihan; produk utama harus kosong." });
  if (new Set(v.groups.map(g => g.id)).size !== v.groups.length) ctx.addIssue({ code: "custom", path: ["groups"], message: "ID grup paket harus unik." });
  for (const g of v.groups) if (new Set(g.options.map(o => `${o.itemId}\0${o.variantId}`)).size !== g.options.length) ctx.addIssue({ code: "custom", path: ["groups"], message: "Pilihan produk dalam grup tidak boleh duplikat." });
});
export type EventMenuEntryInput = z.input<typeof eventMenuEntrySchema>;

const imageUrl = z.string().trim().max(800).refine(v => !v || (v.startsWith("/") && !v.startsWith("//")) || /^https:\/\/[^\s"'<>]+$/.test(v), "URL gambar tidak valid.");
export const eventCreateSchema = z.object({
  title: z.string().trim().min(3).max(120), slug: z.string().trim().min(3).max(100).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  startsAt: isoDate, endsAt: isoDate,
  timezone: z.string().default("Asia/Jakarta").refine(v => { try { new Intl.DateTimeFormat("id-ID", { timeZone: v }); return true; } catch { return false; } }, "Zona waktu tidak valid."),
  tagline: z.string().trim().max(160).nullable().optional(), about: z.string().trim().max(1200).nullable().optional(),
  bannerUrl: imageUrl.nullable().optional(), outletId: z.string().uuid().nullable().optional(),
  venueName: z.string().trim().max(120).default("Garage Coffee"), address: z.string().trim().max(300).default(""),
  mapsUrl: z.string().trim().max(800).default(""), contactWhatsapp: z.string().trim().max(30).default(""),
}).refine(v => Date.parse(v.endsAt) > Date.parse(v.startsAt), { path: ["endsAt"], message: "Jam selesai harus setelah jam mulai." });

function entryDto(row: MenuRow): EventMenuEntry {
  return { ...row, kind: row.kind as EventMenuEntry["kind"], status: row.status as EventMenuEntry["status"], startsAt: row.startsAt.toISOString(), endsAt: row.endsAt.toISOString() };
}
function eventContext(row: typeof events.$inferSelect, now: Date): EventMenuContext {
  return { id: row.id, slug: row.slug, title: row.title, tagline: row.tagline, startsAt: row.startsAt.toISOString(), endsAt: row.endsAt.toISOString(), timezone: row.timezone, status: row.status, outletId: row.outletId, bannerUrl: row.bannerUrl,
    phase: row.status !== "published" ? "unavailable" : now < row.startsAt ? "upcoming" : now >= row.endsAt ? "ended" : "active" };
}
async function audit(tx: Executor, actor: Actor, action: string, object: string, before: unknown, after: unknown) {
  await tx.insert(auditLogs).values({ actor: actor.name, action, object, time: new Date().toISOString(), device: "Event Menu Manager", status: "recorded", metadata: { userId: actor.userId, before, after } });
}
async function eventById(db: Executor, eventId: string, outletId?: string, lock = false) {
  const query = db.select().from(events).where(eq(events.id, eventId)).limit(1);
  const [event] = lock ? await query.for("update") : await query;
  if (!event || (outletId && event.outletId && event.outletId !== outletId)) throw new EventError(404, "EVENT_NOT_FOUND", "Event tidak ditemukan di outlet ini.");
  return event;
}

/** Event commerce never exposes or sells restricted tobacco/vape products. */
function allowedProduct(row: { name: string; category: string; brand: string | null; status: string; showInDigitalMenu: boolean }) {
  return row.status === "active" && !/rokok|tobacco|cigarette|nikotin|vape|black\s*matcha/i.test(`${row.name} ${row.category} ${row.brand ?? ""}`);
}
async function products(db: Executor, includeUnavailable = true) {
  const rows = await db.select({ item: menuItems, variant: menuVariants }).from(menuVariants).innerJoin(menuItems, eq(menuItems.id, menuVariants.itemId));
  return rows.filter(row => allowedProduct(row.item) && (includeUnavailable || row.item.stock !== "sold_out"));
}
async function productDtos(db: Executor): Promise<EventMenuProduct[]> {
  const rows = await products(db);
  const map = new Map<string, EventMenuProduct>();
  for (const { item, variant } of rows) {
    let value = map.get(item.id);
    if (!value) { value = { id: item.id, name: item.name, category: item.category, imageUrl: item.imageUrl, description: item.description, stock: item.stock, showInDigitalMenu: item.showInDigitalMenu, variants: [] }; map.set(item.id, value); }
    value.variants.push({ id: variant.variantId, label: variant.label, price: variant.price });
  }
  return [...map.values()];
}

export async function createCommerceEvent(input: z.input<typeof eventCreateSchema>, actor: Actor) {
  const value = eventCreateSchema.parse(input);
  return getDb().transaction(async tx => {
    const existing = await tx.select({ id: events.id }).from(events).where(eq(events.slug, value.slug)).limit(1);
    if (existing.length) throw new EventError(409, "EVENT_SLUG_EXISTS", "Slug event sudah dipakai.");
    if (actor.outletId && value.outletId && actor.outletId !== value.outletId) throw new EventError(403, "EVENT_OUTLET_FORBIDDEN", "Pilih outlet aktif sebelum membuat event.");
    const [event] = await tx.insert(events).values({ ...value, startsAt: new Date(value.startsAt), endsAt: new Date(value.endsAt), outletId: value.outletId ?? actor.outletId ?? null, status: "draft", featuredOnHome: false, updatedBy: actor.userId }).onConflictDoNothing({ target: events.slug }).returning();
    if (!event) throw new EventError(409, "EVENT_SLUG_EXISTS", "Slug event sudah dipakai.");
    await audit(tx, actor, "Create event", event.title, null, event);
    return eventContext(event, new Date());
  });
}

export async function getEventMenuData(eventId: string, options: { outletId?: string; publicOnly?: boolean; now?: Date } = {}): Promise<EventMenuData> {
  const db = getDb();
  const event = await eventById(db, eventId, options.outletId);
  if (options.publicOnly && event.status !== "published") throw new EventError(404, "EVENT_NOT_FOUND", "Event belum tersedia.");
  const allEntries = await db.select().from(eventMenuEntries).where(eq(eventMenuEntries.eventId, eventId)).orderBy(eventMenuEntries.sortOrder, eventMenuEntries.name);
  const catalog = await productDtos(db);
  const valid = (row: MenuRow) => row.kind === "item" ? catalog.some(p => p.id === row.menuItemId && p.showInDigitalMenu !== false && p.variants.some(v => v.id === row.variantId)) : row.groups.every(g => g.options.some(o => catalog.some(p => p.id === o.itemId && p.variants.some(v => v.id === o.variantId))));
  const entries = allEntries.filter(e => !options.publicOnly || (e.status === "active" && valid(e))).map(entryDto);
  if (options.publicOnly) for (const entry of entries) entry.groups = entry.groups.map(group => ({ ...group, options: group.options.filter(option => catalog.some(product => product.id === option.itemId && product.variants.some(variant => variant.id === option.variantId))) }));
  const bundleReferences = new Set(entries.filter(entry => entry.kind === "bundle").flatMap(entry => entry.groups.flatMap(group => group.options.map(option => option.itemId))));
  return { event: eventContext(event, options.now ?? new Date()), entries, products: options.publicOnly ? catalog.filter(product => product.showInDigitalMenu !== false || bundleReferences.has(product.id)) : catalog };
}
export async function getPublicEventMenu(slug: string) {
  const [event] = await getDb().select({ id: events.id }).from(events).where(and(eq(events.slug, slug), eq(events.status, "published"))).limit(1);
  if (!event) throw new EventError(404, "EVENT_NOT_FOUND", "Event belum tersedia.");
  return getEventMenuData(event.id, { publicOnly: true });
}

export async function saveEventMenuEntry(eventId: string, input: EventMenuEntryInput, actor: Actor, entryId?: string) {
  const value = eventMenuEntrySchema.parse(input);
  return getDb().transaction(async tx => {
    const event = await eventById(tx, eventId, actor.outletId, true);
    if (event.status === "archived") throw new EventError(409, "EVENT_ARCHIVED", "Event sudah diarsipkan.");
    const startsAt = new Date(value.startsAt), endsAt = new Date(value.endsAt);
    if (startsAt < event.startsAt || endsAt > event.endsAt) throw new EventError(400, "MENU_OUTSIDE_EVENT", "Jadwal menu harus berada dalam periode event.");
    const [before] = entryId ? await tx.select().from(eventMenuEntries).where(and(eq(eventMenuEntries.id, entryId), eq(eventMenuEntries.eventId, eventId))).limit(1) : [];
    if (entryId && !before) throw new EventError(404, "EVENT_MENU_NOT_FOUND", "Menu event tidak ditemukan.");
    if (before?.status === "archived" && value.status !== "archived") throw new EventError(409, "EVENT_MENU_ARCHIVED", "Menu yang diarsipkan tidak dapat diaktifkan kembali.");
    if (value.quota !== null && value.quota < (before?.usedQuantity ?? 0)) throw new EventError(409, "QUOTA_BELOW_USED", "Kuota tidak boleh di bawah jumlah yang sudah dipesan.");
    const catalog = await products(tx);
    const references = value.kind === "item" ? [{ itemId: value.menuItemId!, variantId: value.variantId! }] : value.groups.flatMap(g => g.options);
    for (const ref of references) if (!catalog.some(p => p.item.id === ref.itemId && p.variant.variantId === ref.variantId)) throw new EventError(400, "EVENT_PRODUCT_UNAVAILABLE", "Pilih produk/varian aktif makanan atau minuman yang terlihat di menu digital.");
    if (value.kind === "item" && !catalog.some(product => product.item.id === value.menuItemId && product.item.showInDigitalMenu)) throw new EventError(400, "EVENT_PRODUCT_HIDDEN", "Produk disembunyikan dari menu satuan. Aktifkan tampil di menu digital atau gunakan sebagai komponen paket.");
    if (value.kind === "item" && value.status === "active") {
      const conflicts = await tx.select().from(eventMenuEntries).where(and(eq(eventMenuEntries.eventId, eventId), eq(eventMenuEntries.status, "active"), eq(eventMenuEntries.menuItemId, value.menuItemId!), eq(eventMenuEntries.variantId, value.variantId!), entryId ? ne(eventMenuEntries.id, entryId) : undefined));
      if (conflicts.some(c => startsAt < c.endsAt && endsAt > c.startsAt)) throw new EventError(409, "EVENT_MENU_OVERLAP", "Jadwal harga produk/varian ini bertabrakan dengan menu event lain.");
    }
    const values = { ...value, menuItemId: value.kind === "item" ? value.menuItemId! : null, variantId: value.kind === "item" ? value.variantId! : null, description: value.description || null, startsAt, endsAt, updatedAt: new Date() };
    const [row] = before ? await tx.update(eventMenuEntries).set(values).where(eq(eventMenuEntries.id, before.id)).returning() : await tx.insert(eventMenuEntries).values({ ...values, eventId }).returning();
    await audit(tx, actor, before ? "Update event menu" : "Create event menu", row.name, before ?? null, row);
    return entryDto(row);
  });
}
export async function archiveEventMenuEntry(eventId: string, entryId: string, actor: Actor) {
  return getDb().transaction(async tx => {
    await eventById(tx, eventId, actor.outletId, true);
    const [before] = await tx.select().from(eventMenuEntries).where(and(eq(eventMenuEntries.id, entryId), eq(eventMenuEntries.eventId, eventId))).limit(1);
    if (!before) throw new EventError(404, "EVENT_MENU_NOT_FOUND", "Menu event tidak ditemukan.");
    const [row] = await tx.update(eventMenuEntries).set({ status: "archived", updatedAt: new Date() }).where(eq(eventMenuEntries.id, entryId)).returning();
    await audit(tx, actor, "Archive event menu", row.name, before, row);
    return entryDto(row);
  });
}

/** Allocate whole rupiah across component units, preserving the exact package total. */
function allocate(price: number, weights: number[]) {
  const denominator = weights.reduce((a, b) => a + b, 0);
  const shares = weights.map((weight, i) => ({ i, value: Math.floor(price * weight / denominator), remainder: (price * weight) % denominator }));
  let rest = price - shares.reduce((n, s) => n + s.value, 0);
  for (const share of [...shares].sort((a, b) => b.remainder - a.remainder || a.i - b.i)) { if (rest-- <= 0) break; share.value++; }
  return shares.map(s => s.value);
}

/** Caller supplies a DB transaction when reserveQuota=true; no physical stock decrement here. */
export async function resolveEventCart(db: Executor, input: { eventId: string; items: EventCartItem[]; outletId?: string; now?: Date; reserveQuota?: boolean }): Promise<ResolvedEventLine[]> {
  const items = z.array(eventCartItemSchema).min(1).max(40).parse(input.items);
  const event = await eventById(db, input.eventId, input.outletId, input.reserveQuota);
  const now = input.now ?? new Date();
  if (event.status !== "published" || now < event.startsAt || now >= event.endsAt) throw new EventError(409, "EVENT_NOT_ACTIVE", "Event belum aktif atau sudah berakhir. Gunakan menu reguler.");
  const query = db.select().from(eventMenuEntries).where(and(eq(eventMenuEntries.eventId, event.id), inArray(eventMenuEntries.id, items.map(i => i.entryId))));
  const entries = input.reserveQuota ? await query.for("update") : await query;
  const catalog = await products(db, false);
  const recipes = await db.select({ itemId: menuRecipes.menuItemId, variantId: menuRecipes.variantId, sku: inventoryItems.sku, qty: menuRecipes.qty, wastePct: menuRecipes.wastePct, unitCost: inventoryItems.unitCost, recipeUnit: menuRecipes.unit, inventoryUnit: inventoryItems.unit, stage: inventoryItems.stage }).from(menuRecipes).leftJoin(inventoryItems, eq(menuRecipes.inventorySku, inventoryItems.sku)).where(eq(menuRecipes.status, "active"));
  const unitKey = (value: string | null) => {
    const unit = value?.toLowerCase();
    if (unit === "g" || unit === "gram") return "gr";
    return unit === "pc" ? "pcs" : unit;
  };
  function verifiedCost(product: typeof catalog[number]): number | null {
    if (product.item.productType === "retail") return Number.isFinite(product.variant.baseCost) && product.variant.baseCost > 0 ? product.variant.baseCost : null;
    const lines = recipes.filter(r => r.itemId === product.item.id && (r.variantId === product.variant.variantId || r.variantId === "all"));
    if (!lines.length || lines.some(r => !r.sku || r.stage !== "active" || !Number.isFinite(Number(r.qty)) || !(Number(r.qty) > 0) || r.unitCost === null || !Number.isFinite(Number(r.unitCost)) || !(Number(r.unitCost) > 0) || !Number.isFinite(Number(r.wastePct)) || Number(r.wastePct) < 0 || !r.recipeUnit || unitKey(r.recipeUnit) !== unitKey(r.inventoryUnit))) return null;
    const cost = lines.reduce((sum, r) => sum + Number(r.qty) * Number(r.unitCost) * (1 + Number(r.wastePct) / 100), 0);
    return Number.isFinite(cost) ? Number(cost.toFixed(4)) : null;
  }
  const used = new Map<string, number>();
  const result: ResolvedEventLine[] = [];
  for (const item of items) {
    const entry = entries.find(e => e.id === item.entryId);
    if (!entry || entry.status !== "active" || now < entry.startsAt || now >= entry.endsAt) throw new EventError(409, "EVENT_MENU_UNAVAILABLE", "Menu event tidak tersedia pada waktu ini.");
    const requested = (used.get(entry.id) ?? 0) + item.qty;
    if (entry.quota !== null && entry.usedQuantity + requested > entry.quota) throw new EventError(409, "EVENT_MENU_QUOTA", `Kuota ${entry.name} tidak mencukupi.`);
    used.set(entry.id, requested);
    const selections = item.selections ?? [];
    const components: Array<{ itemId: string; variantId: string }> = [];
    if (entry.kind === "item") {
      if (selections.length) throw new EventError(400, "EVENT_SELECTION_INVALID", "Menu satuan tidak menerima pilihan paket.");
      components.push({ itemId: entry.menuItemId!, variantId: entry.variantId! });
    } else {
      if (selections.length !== entry.groups.length || new Set(selections.map(s => s.groupId)).size !== selections.length) throw new EventError(400, "EVENT_SELECTION_INVALID", "Lengkapi satu pilihan untuk setiap grup paket.");
      for (const group of entry.groups) {
        const selection = selections.find(s => s.groupId === group.id);
        if (!selection || !group.options.some(o => o.itemId === selection.itemId && o.variantId === selection.variantId)) throw new EventError(400, "EVENT_SELECTION_INVALID", `Pilihan ${group.name} tidak valid.`);
        for (let n = 0; n < group.quantity; n++) components.push(selection);
      }
    }
    const selected = components.map(component => {
      const product = catalog.find(p => p.item.id === component.itemId && p.variant.variantId === component.variantId);
      if (!product) throw new EventError(409, "EVENT_PRODUCT_UNAVAILABLE", "Produk/varian paket tidak tersedia. Muat ulang menu.");
      if (entry.kind === "item" && !product.item.showInDigitalMenu) throw new EventError(409, "EVENT_PRODUCT_HIDDEN", "Produk disembunyikan dari menu digital.");
      return product;
    });
    const prices = allocate(entry.price, selected.map(p => Math.max(1, p.variant.price)));
    const groupId = randomUUID();
    const grouped = new Map<string, ResolvedEventLine>();
    selected.forEach((p, index) => {
      const key = `${p.item.id}\0${p.variant.variantId}\0${prices[index]}`;
      const existing = grouped.get(key);
      if (existing) { existing.qty += item.qty; existing.lineTotal = existing.qty * existing.price; return; }
      const unitCost = verifiedCost(p);
      grouped.set(key, { itemId: p.item.id, variantId: p.variant.variantId, qty: item.qty, note: item.note, price: prices[index], lineTotal: prices[index] * item.qty,
        eventSnapshot: { eventId: event.id, eventTitle: event.title, entryId: entry.id, entryName: entry.name, kind: entry.kind as "item" | "bundle", groupId, entryQuantity: item.qty, componentIndex: 0, componentCount: 0, unitCost, packagePrice: entry.price } });
    });
    const lines = [...grouped.values()];
    lines.forEach((line, index) => { line.eventSnapshot.componentIndex = index; line.eventSnapshot.componentCount = lines.length; });
    result.push(...lines);
  }
  if (result.length > 120) throw new EventError(400, "EVENT_CART_TOO_LARGE", "Terlalu banyak komponen paket dalam satu order.");
  if (input.reserveQuota) for (const [id, quantity] of used) await db.update(eventMenuEntries).set({ usedQuantity: sql`${eventMenuEntries.usedQuantity} + ${quantity}`, updatedAt: now }).where(eq(eventMenuEntries.id, id));
  return result;
}

type RegularCheckoutItem = { itemId: string; variantId: string; qty: number; note?: string };
/** Resolve a shared cart without trusting contextual prices sent by the client. */
export async function resolveEventCheckoutCart(db: Executor, input: { eventId: string; items: EventCartItem[]; regularItems: RegularCheckoutItem[]; outletId?: string; now?: Date; reserveQuota?: boolean }) {
  const event = await eventById(db, input.eventId, input.outletId, input.reserveQuota);
  const now = input.now ?? new Date();
  if (event.status !== "published" || now < event.startsAt || now >= event.endsAt) throw new EventError(409, "EVENT_NOT_ACTIVE", "Event belum aktif atau sudah berakhir. Muat ulang menu untuk memakai harga reguler.");
  const regularItems = z.array(productOption.extend({ qty: z.number().int().min(1).max(25), note: z.string().trim().max(160).optional() })).max(40).parse(input.regularItems);
  if (!regularItems.length && !input.items.length) throw new EventError(400, "EVENT_CART_EMPTY", "Keranjang masih kosong.");
  if (regularItems.length + input.items.length > 40) throw new EventError(400, "EVENT_CART_TOO_LARGE", "Maksimal 40 pilihan dalam satu pesanan.");
  const rows = await db.select().from(eventMenuEntries).where(and(eq(eventMenuEntries.eventId, event.id), eq(eventMenuEntries.kind, "item"), eq(eventMenuEntries.status, "active")));
  const eventItems = [...input.items];
  const regular: RegularCheckoutItem[] = [];
  for (const item of regularItems) {
    const matches = rows.filter(row => row.menuItemId === item.itemId && row.variantId === item.variantId && now >= row.startsAt && now < row.endsAt);
    if (matches.length > 1) throw new EventError(409, "EVENT_MENU_OVERLAP", "Harga event bertabrakan. Hubungi kasir untuk memperbaiki jadwal menu.");
    if (matches.length) eventItems.push({ entryId: matches[0].id, qty: item.qty, note: item.note });
    else regular.push(item);
  }
  const eventLines = eventItems.length ? await resolveEventCart(db, { ...input, items: eventItems, now }) : [];
  return { regularItems: regular, eventLines };
}

/** Release only rejected, never-produced orders; caller already locks the order. */
export async function releaseEventQuotaForOrder(tx: Executor, orderId: string) {
  const [order] = await tx.select().from(orders).where(eq(orders.id, orderId)).limit(1);
  if (!order?.eventId) return;
  await eventById(tx, order.eventId, undefined, true);
  const marker = `Event quota released ${orderId}`;
  const [existing] = await tx.select({ id: auditLogs.id }).from(auditLogs).where(eq(auditLogs.action, marker)).limit(1);
  if (existing) return;
  const rows = await tx.select({ snapshot: orderItems.eventSnapshot }).from(orderItems).where(eq(orderItems.orderId, orderId));
  const groups = new Map<string, NonNullable<typeof rows[number]["snapshot"]>>();
  for (const row of rows) if (row.snapshot?.eventId === order.eventId) groups.set(row.snapshot.groupId, row.snapshot);
  for (const s of groups.values()) await tx.update(eventMenuEntries).set({ usedQuantity: sql`greatest(0, ${eventMenuEntries.usedQuantity} - ${s.entryQuantity})`, updatedAt: new Date() }).where(and(eq(eventMenuEntries.id, s.entryId), eq(eventMenuEntries.eventId, order.eventId)));
  await audit(tx, { userId: "system", name: "System" }, marker, order.orderNo, null, { entries: groups.size });
}
