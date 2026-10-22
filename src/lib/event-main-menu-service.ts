import { and, eq } from "drizzle-orm";
import { ensureDatabaseReady } from "@/db";
import { appSettings, auditLogs, events, outlets } from "@/db/schema";
import { getEventMenuData } from "@/lib/event-menu-service";
import { EventError } from "@/lib/event-service";

const MAIN_EVENT_KEY = "digitalMenu.featuredEventId";
type Actor = { userId: string; name: string; outletId: string };

export async function getMainDigitalMenuSelection(outletId: string) {
  const db = await ensureDatabaseReady();
  const [setting] = await db.select({ value: appSettings.valueJson }).from(appSettings).where(and(eq(appSettings.outletId, outletId), eq(appSettings.key, MAIN_EVENT_KEY))).limit(1);
  const value = setting?.value;
  const eventId = typeof value === "string" ? value : value && typeof value === "object" && "eventId" in value && typeof value.eventId === "string" ? value.eventId : null;
  return { outletId, eventId };
}

export async function setMainDigitalMenuEvent(eventId: string | null, actor: Actor) {
  const db = await ensureDatabaseReady();
  return db.transaction(async tx => {
    // Serialize selection changes for this outlet and keep the audit with the mutation.
    const [outlet] = await tx.select().from(outlets).where(eq(outlets.id, actor.outletId)).for("update").limit(1);
    if (!outlet || outlet.status !== "active") throw new EventError(404, "OUTLET_NOT_FOUND", "Outlet aktif tidak ditemukan.");
    if (eventId) {
      // Read without locking the event: checkout locks event before the outlet FK.
      // The storefront and checkout revalidate current event status independently.
      const [event] = await tx.select().from(events).where(eq(events.id, eventId)).limit(1);
      if (!event || (event.outletId && event.outletId !== actor.outletId)) throw new EventError(404, "EVENT_NOT_FOUND", "Event tidak ditemukan di outlet ini.");
      if (event.status !== "published") throw new EventError(409, "EVENT_NOT_PUBLISHED", "Event harus diterbitkan sebelum ditampilkan di menu utama.");
    }
    const [before] = await tx.select().from(appSettings).where(and(eq(appSettings.outletId, actor.outletId), eq(appSettings.key, MAIN_EVENT_KEY))).limit(1);
    const updatedAt = new Date();
    const valueJson = { eventId };
    await tx.insert(appSettings).values({ outletId: actor.outletId, key: MAIN_EVENT_KEY, valueJson, updatedBy: actor.userId, updatedAt }).onConflictDoUpdate({ target: [appSettings.outletId, appSettings.key], set: { valueJson, updatedBy: actor.userId, updatedAt } });
    await tx.insert(auditLogs).values({ actor: actor.name, action: "Set main digital menu event", object: outlet.name, time: updatedAt.toISOString(), device: "Event Menu Manager", status: "recorded", metadata: { userId: actor.userId, outletId: actor.outletId, before: before?.valueJson ?? null, after: eventId } });
    return { outletId: actor.outletId, eventId };
  });
}

/** Match the same default-outlet rule used by ordinary QR checkout. */
export async function getMainDigitalMenuEvent(outletId?: string, now = new Date()) {
  const db = await ensureDatabaseReady();
  const [outlet] = await db.select({ id: outlets.id }).from(outlets).where(and(eq(outlets.status, "active"), outletId ? eq(outlets.id, outletId) : undefined)).orderBy(outlets.code).limit(1);
  if (!outlet) return null;
  const selection = await getMainDigitalMenuSelection(outlet.id);
  if (!selection.eventId) return null;
  const [event] = await db.select().from(events).where(eq(events.id, selection.eventId)).limit(1);
  if (!event || (event.outletId && event.outletId !== outlet.id) || event.status !== "published" || now < event.startsAt || now >= event.endsAt) return null;
  return getEventMenuData(event.id, { outletId: outlet.id, publicOnly: true, now });
}
