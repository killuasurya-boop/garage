import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { seedGarageBasics, setupGarageTestDb, teardownGarageTestDb, type GarageTestDb } from "@/lib/test-helpers/garage-test-db";

let t: GarageTestDb;
let outletId: string;
let eventId: string;
let otherOutlet: string;
let service: typeof import("@/lib/event-main-menu-service");
const now = new Date("2026-10-24T10:00:00Z");
beforeAll(async () => {
  t = await setupGarageTestDb();
  ({ outletId } = await seedGarageBasics(t));
  const [other] = await t.getDb().insert(t.schema.outlets).values({ code: "ZZZ", name: "Other Outlet" }).returning();
  otherOutlet = other.id;
  const [event] = await t.getDb().insert(t.schema.events).values({ slug: "main-event", title: "Main Menu Event", status: "published", outletId, startsAt: new Date("2026-10-24T09:00:00Z"), endsAt: new Date("2026-10-24T11:00:00Z"), venueName: "Garage", address: "", mapsUrl: "", contactWhatsapp: "" }).returning();
  eventId = event.id;
  service = await import("@/lib/event-main-menu-service");
}, 120000);
afterAll(async () => { if (t) await teardownGarageTestDb(t); });
const actor = () => ({ userId: "user-itest", name: "Owner Test", outletId });

describe("main digital menu selected event", () => {
  it("defaults to ordinary menu with no selected event", async () => {
    expect(await service.getMainDigitalMenuEvent(undefined, now)).toBeNull();
  });
  it("persists one selection per outlet and audits it", async () => {
    await service.setMainDigitalMenuEvent(eventId, actor());
    expect(await service.getMainDigitalMenuSelection(outletId)).toMatchObject({ eventId, outletId });
    expect((await service.getMainDigitalMenuEvent(undefined, now))?.event.id).toBe(eventId);
    expect(await service.getMainDigitalMenuEvent(otherOutlet, now)).toBeNull();
    const logs = await t.getDb().select().from(t.schema.auditLogs);
    expect(logs.some((log: { action: string }) => log.action === "Set main digital menu event")).toBe(true);
  });
  it("never displays outside schedule or after archive", async () => {
    expect(await service.getMainDigitalMenuEvent(outletId, new Date("2026-10-24T08:59:59Z"))).toBeNull();
    expect(await service.getMainDigitalMenuEvent(outletId, new Date("2026-10-24T11:00:00Z"))).toBeNull();
    await t.getDb().update(t.schema.events).set({ status: "archived" }).where(eq(t.schema.events.id, eventId));
    expect(await service.getMainDigitalMenuEvent(outletId, now)).toBeNull();
    await t.getDb().update(t.schema.events).set({ status: "published" }).where(eq(t.schema.events.id, eventId));
  });
  it("rejects cross-outlet selection and draft selection", async () => {
    await expect(service.setMainDigitalMenuEvent(eventId, { ...actor(), outletId: otherOutlet })).rejects.toThrow();
    await t.getDb().update(t.schema.events).set({ status: "draft" }).where(eq(t.schema.events.id, eventId));
    await expect(service.setMainDigitalMenuEvent(eventId, actor())).rejects.toThrow("diterbitkan");
    await t.getDb().update(t.schema.events).set({ status: "published" }).where(eq(t.schema.events.id, eventId));
  });
  it("can turn off event presentation without editing the regular catalog", async () => {
    await service.setMainDigitalMenuEvent(null, actor());
    expect(await service.getMainDigitalMenuEvent(outletId, now)).toBeNull();
    const [variant] = await t.getDb().select().from(t.schema.menuVariants).where(eq(t.schema.menuVariants.itemId, "itm-coffee"));
    expect(variant.price).toBe(20000);
  });
});
