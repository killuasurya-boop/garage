import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { setupGarageTestDb, teardownGarageTestDb, type GarageTestDb } from "@/lib/test-helpers/garage-test-db";

// Migrasi 0138: jam buka resmi 15.00–23.00 & brand "Garage Coffee" (tanpa "& Motor").
let t: GarageTestDb;

beforeAll(async () => {
  t = await setupGarageTestDb();
}, 60_000);

afterAll(async () => {
  await teardownGarageTestDb(t);
});

describe("fakta website garagecoffee.id", () => {
  it("jam buka default & tersimpan 15.00–23.00", async () => {
    const svc = await import("@/lib/garage-service");
    const info = await svc.getBusinessInfo();
    expect(info).toMatchObject({ hoursOpen: "15:00", hoursClose: "23:00" });
    const { formatBusinessHours } = await import("@/lib/garage-location");
    expect(formatBusinessHours(info.hoursOpen, info.hoursClose)).toBe("15.00–23.00 WIB");
  });

  it("tagline struk default tidak lagi memuat Motor", async () => {
    const svc = await import("@/lib/garage-service");
    const settings = await svc.getAppSettings(null);
    expect(settings.brandTagline).not.toMatch(/motor/i);
  });
});
