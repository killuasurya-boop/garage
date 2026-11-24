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

  it("rating Google diatur dari Pengaturan Website: default, pembulatan, berpasangan, kosong = disembunyikan", async () => {
    const svc = await import("@/lib/garage-service");
    const { GARAGE_LOCATION } = await import("@/lib/garage-location");
    // Belum pernah diubah Owner: nilai lama, tanpa regresi.
    expect(await svc.getBusinessInfo()).toMatchObject({ googleRating: GARAGE_LOCATION.rating, googleReviewCount: GARAGE_LOCATION.reviewCount });

    await svc.saveBusinessInfo({ googleRating: 4.86, googleReviewCount: 120 }, null);
    expect(await svc.getBusinessInfo()).toMatchObject({ googleRating: 4.9, googleReviewCount: 120 });

    // Rating tanpa jumlah ulasan tidak pernah ditampilkan setengah.
    await svc.saveBusinessInfo({ googleRating: 4.5, googleReviewCount: null }, null);
    expect(await svc.getBusinessInfo()).toMatchObject({ googleRating: null, googleReviewCount: null });

    await svc.saveBusinessInfo({ googleRating: 4.7, googleReviewCount: 30 }, null);
    await svc.saveBusinessInfo({ googleRating: null, googleReviewCount: null }, null);
    const cleared = await svc.getBusinessInfo();
    expect(cleared).toMatchObject({ googleRating: null, googleReviewCount: null, hoursOpen: "15:00" });

    // Field lain tetap utuh saat rating diubah.
    await svc.saveBusinessInfo({ googleRating: 5, googleReviewCount: 14 }, null);
    expect(await svc.getBusinessInfo()).toMatchObject({ googleRating: 5, googleReviewCount: 14, hoursClose: "23:00" });
  });

  it("tagline struk default tidak lagi memuat Motor", async () => {
    const svc = await import("@/lib/garage-service");
    const settings = await svc.getAppSettings(null);
    expect(settings.brandTagline).not.toMatch(/motor/i);
  });
});
