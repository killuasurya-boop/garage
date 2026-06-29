import { describe, it, expect, beforeAll, afterAll } from "vitest";

import {
  setupGarageTestDb,
  teardownGarageTestDb,
  type GarageTestDb,
} from "@/lib/test-helpers/garage-test-db";

// =============================================================================
// RECRUITMENT POSITIONS — seed self-healing: posisi baru (mis. waiter) muncul
// walau tabel sudah pernah ter-seed (skenario produksi), tanpa duplikat.
// =============================================================================

/* eslint-disable @typescript-eslint/no-explicit-any */
let t: GarageTestDb;
let svc: any;

beforeAll(async () => {
  t = await setupGarageTestDb();
  svc = await import("@/lib/garage-recruitment-positions-service");
}, 60_000);

afterAll(async () => {
  await teardownGarageTestDb(t);
});

describe("Recruitment positions — self-healing seed", () => {
  it("DB sudah terisi sebagian (tanpa waiter) → waiter ikut muncul, tanpa duplikat", async () => {
    // Simulasikan produksi: tabel sudah punya beberapa posisi lama tanpa waiter.
    await t.getDb().insert(t.schema.recruitmentPositions).values([
      { slug: "barista", title: "Barista", location: "Tebing Tinggi", type: "Full-time", experience: "-", description: "-", isOpen: true, sortOrder: 0 },
      { slug: "cashier", title: "Cashier", location: "Tebing Tinggi", type: "Full-time", experience: "-", description: "-", isOpen: true, sortOrder: 1 },
    ]);

    const list = await svc.listOpenPositions();
    const slugs = list.map((p: any) => p.slug);

    // waiter (posisi baru) otomatis ter-seed.
    expect(slugs).toContain("waiter");
    // posisi lama tidak terduplikasi.
    expect(slugs.filter((s: string) => s === "barista").length).toBe(1);
    // posisi default lain juga lengkap.
    expect(slugs).toContain("kitchen-crew");
  });

  it("posisi waiter punya judul yang benar", async () => {
    const list = await svc.listAllPositions();
    const waiter = list.find((p: any) => p.slug === "waiter");
    expect(waiter?.title).toMatch(/waiter|pelayan/i);
  });
});
