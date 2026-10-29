import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { Role } from "@/lib/garage-data";
import type { GarageSession } from "@/lib/server-auth";
import { seedGarageBasics, setupGarageTestDb, teardownGarageTestDb, type GarageTestDb } from "@/lib/test-helpers/garage-test-db";

// =============================================================================
// Tool master supplier & bahan (blueprint V3 Phase 3): service UI Gudang yang sama, tetapi
// create tidak pernah menimpa data lama, rekening bank tak tersentuh AI, stok tidak berubah,
// update mengembalikan field berubah + sidik sebelum/sesudah, Kasir ditolak.
// =============================================================================

/* eslint-disable @typescript-eslint/no-explicit-any */
let t: GarageTestDb;
let outletId = "";
let tools: typeof import("@/lib/agent-tools");
const OWNER = "user-mst-owner";
const KASIR = "user-mst-kasir";
const ctx = { authorization: "", internalOrigin: "http://127.0.0.1:1" };

function as(userId: string, role: Role): GarageSession {
  return {
    user: { id: userId, name: `Nama ${userId}`, email: `${userId}@garage.id` },
    profile: {
      id: `sp-${userId}`,
      role,
      shiftLabel: "Pagi",
      deviceLabel: "WEB",
      passwordResetRequired: false,
      outlet: { id: outletId, code: "TST", name: "Outlet Test", timezone: "Asia/Jakarta" },
    },
  } as unknown as GarageSession;
}
const run = (role: Role, name: string, args: Record<string, unknown>) =>
  tools.runAgentTool(as(role === "Owner" ? OWNER : KASIR, role), name, args, ctx) as Promise<any>;

beforeAll(async () => {
  t = await setupGarageTestDb();
  ({ outletId } = await seedGarageBasics(t, { userId: OWNER }));
  await t.getDb().insert(t.schema.user).values({ id: KASIR, name: "Kasir", email: `${KASIR}@garage.id` });
  const svc = await import("@/lib/wms-service");
  await svc.listWmsCategories(); // seed kategori default (Bahan Bar, Bahan Dapur)
  tools = await import("@/lib/agent-tools");
}, 60_000);

afterAll(async () => {
  await teardownGarageTestDb(t);
});

describe("registry", () => {
  it("terdaftar dengan domain & risiko yang benar, write = risk ≠ R0", () => {
    const meta = Object.fromEntries(tools.listAgentTools().map((tool) => [tool.name, tool]));
    expect(meta.garage_create_supplier).toMatchObject({ domain: "gudang", risk: "R1", write: true });
    expect(meta.garage_update_supplier).toMatchObject({ domain: "gudang", risk: "R1", write: true });
    expect(meta.garage_create_material).toMatchObject({ domain: "bahan_resep", risk: "R1", write: true });
    // Rekening bank tidak bisa dikirim lewat tool.
    expect(JSON.stringify(meta.garage_create_supplier.inputSchema)).not.toMatch(/bank/i);
  });
});

describe("supplier", () => {
  let supplierId = "";

  it("tambah supplier baru: nomor dinormalisasi, tanpa field bank, sidik sesudah", async () => {
    const res = await run("Owner", "garage_create_supplier", { name: "CV Susu Segar", phone: "+62 812 1111 2222", areas: ["bar"], paymentMethod: "transfer" });
    expect(res.dibuat).toBe(true);
    expect(res.supplier).toMatchObject({ name: "CV Susu Segar", phone: "081211112222" });
    expect(JSON.stringify(res.supplier)).not.toMatch(/bankAccount/);
    expect(res.bukti.sesudah).toMatch(/^[0-9a-f]{64}$/);
    supplierId = res.supplier.id;
  });

  it("nama sama (beda huruf besar) atau nomor sama → ditolak, data lama TIDAK tertimpa", async () => {
    await expect(run("Owner", "garage_create_supplier", { name: "cv susu segar", phone: "081299998888" })).rejects.toMatchObject({ code: "SUPPLIER_EXISTS" });
    await expect(run("Owner", "garage_create_supplier", { name: "PT Lain", phone: "0812-1111-2222" })).rejects.toMatchObject({ code: "SUPPLIER_PHONE_EXISTS" });
    const svc = await import("@/lib/wms-service");
    const rows = await svc.listWmsSuppliers();
    expect(rows.find((s: any) => s.id === supplierId)?.phone).toBe("081211112222");
  });

  it("nomor tidak valid → pesan jelas", async () => {
    await expect(run("Owner", "garage_create_supplier", { name: "UD Gula", phone: "abc" })).rejects.toMatchObject({ code: "PHONE_INVALID" });
  });

  it("update: hanya field dikirim, field berubah + sidik sebelum/sesudah; rekening bank tetap", async () => {
    const { eq } = await import("drizzle-orm");
    await t.getDb().update(t.schema.wmsSupplier).set({ bankName: "BNI", bankAccountNumber: "1234567890" } as any).where(eq(t.schema.wmsSupplier.id, supplierId));
    const res = await run("Owner", "garage_update_supplier", { supplierId, picName: "Bu Rina", paymentTermDays: 14 });
    expect(res.berubah).toEqual(expect.arrayContaining(["picName", "paymentTermDays"]));
    expect(res.berubah).not.toContain("phone");
    expect(res.bukti.sebelum).not.toBe(res.bukti.sesudah);
    const [row] = await t.getDb().select().from(t.schema.wmsSupplier).where(eq(t.schema.wmsSupplier.id, supplierId));
    expect(row).toMatchObject({ bankName: "BNI", bankAccountNumber: "1234567890", picName: "Bu Rina" });
  });

  it("update tanpa field → ditolak; supplier tak dikenal → NOT_FOUND; arsip & aktif lagi", async () => {
    await expect(run("Owner", "garage_update_supplier", { supplierId })).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    await expect(run("Owner", "garage_update_supplier", { supplierId: "00000000-0000-4000-8000-000000000000", note: "x" })).rejects.toMatchObject({ code: "NOT_FOUND" });
    const archived = await run("Owner", "garage_update_supplier", { supplierId, arsipkan: true });
    expect(archived.supplier.archivedAt).toBeTruthy();
    expect(archived.berubah).toContain("archivedAt");
    const restored = await run("Owner", "garage_update_supplier", { supplierId, arsipkan: false });
    expect(restored.supplier.archivedAt ?? null).toBeNull();
  });

  it("Kasir ditolak", async () => {
    await expect(run("Kasir", "garage_create_supplier", { name: "CV Kasir" })).rejects.toMatchObject({ status: 403 });
  });
});

describe("bahan baku", () => {
  it("tambah bahan: SKU otomatis, HPP dari kemasan, TANPA stok; nama ganda ditolak kecuali diizinkan", async () => {
    const res = await run("Owner", "garage_create_material", {
      name: "Susu UHT Uji",
      category: "Bahan Bar",
      unit: "ml",
      packName: "kotak",
      packQty: 1000,
      packPrice: 18000,
      minStock: 2000,
    });
    expect(res.dibuat).toBe(true);
    expect(res.bahan.sku).toBeTruthy();
    expect(Number(res.bahan.hpp)).toBeCloseTo(18, 4);
    expect(Number(res.bahan.stock ?? res.bahan.onHand ?? 0)).toBe(0);
    expect(res.bukti.sesudah).toMatch(/^[0-9a-f]{64}$/);

    await expect(run("Owner", "garage_create_material", { name: "susu uht uji", category: "Bahan Bar", unit: "ml" })).rejects.toMatchObject({
      code: "MATERIAL_EXISTS",
    });
    const second = await run("Owner", "garage_create_material", { name: "Susu UHT Uji", category: "Bahan Bar", unit: "ml", izinkanNamaSama: true });
    expect(second.bahan.sku).not.toBe(res.bahan.sku);
  });

  it("kategori tidak dikenal → ditolak (mode ketat, sama seperti UI)", async () => {
    await expect(run("Owner", "garage_create_material", { name: "Bahan Aneh", category: "Kategori Fiktif", unit: "pcs" })).rejects.toHaveProperty("code");
  });
});
