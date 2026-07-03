import { describe, it, expect, beforeAll, afterAll } from "vitest";

import {
  setupGarageTestDb,
  teardownGarageTestDb,
  type GarageTestDb,
} from "@/lib/test-helpers/garage-test-db";

// =============================================================================
// WMS — Master data: kategori (ber-area) + supplier.
// =============================================================================

/* eslint-disable @typescript-eslint/no-explicit-any */
let t: GarageTestDb;
let svc: any;

beforeAll(async () => {
  t = await setupGarageTestDb();
  svc = await import("@/lib/wms-service");
  await svc.listWmsCategories(); // trigger seed default
}, 60_000);

afterAll(async () => {
  await teardownGarageTestDb(t);
});

describe("kategori master", () => {
  it("seed default berisi Bahan Bar (area bar) & Bahan Dapur (area dapur)", async () => {
    const cats = await svc.listWmsCategories();
    expect(cats.find((c: any) => c.name === "Bahan Bar")?.area).toBe("bar");
    expect(cats.find((c: any) => c.name === "Bahan Dapur")?.area).toBe("dapur");
  });

  it("tambah kategori baru ber-area, idempoten by nama", async () => {
    await svc.createWmsCategory({ name: "Bumbu Dapur", area: "dapur" });
    let cats = await svc.listWmsCategories();
    expect(cats.filter((c: any) => c.name === "Bumbu Dapur").length).toBe(1);
    // upsert: nama sama tak menggandakan
    await svc.createWmsCategory({ name: "Bumbu Dapur", area: "dapur" });
    cats = await svc.listWmsCategories();
    expect(cats.filter((c: any) => c.name === "Bumbu Dapur").length).toBe(1);
  });
});

describe("supplier master", () => {
  it("daftar supplier baru + muncul di list", async () => {
    await svc.createWmsSupplier({ name: "CV Kopi Nusantara", phone: "0812" });
    const sups = await svc.listWmsSuppliers();
    const s = sups.find((x: any) => x.name === "CV Kopi Nusantara");
    expect(s).toBeTruthy();
    expect(s.phone).toBe("0812");
  });
});
