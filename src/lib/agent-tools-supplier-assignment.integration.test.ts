import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { Role } from "@/lib/garage-data";
import type { GarageSession } from "@/lib/server-auth";
import { seedGarageBasics, setupGarageTestDb, teardownGarageTestDb, type GarageTestDb } from "@/lib/test-helpers/garage-test-db";

// Integration tests for owner-confirmed, supplier-only kitchen master changes.
// Never use production database or menu/recipe/POS writes.
let t: GarageTestDb;
let outletId = "";
const OWNER = "user-wms-supplier-owner";
const CASHIER = "user-wms-supplier-cashier";
let supplierId = "";
let otherSupplierId = "";
const ctx = { authorization: "", internalOrigin: "http://127.0.0.1:1", confirmFlow: true };

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

const args = (skus: string[], supplier = supplierId) => ({
  supplierId: supplier,
  skus,
  alasan: "Validasi supplier utama bahan Dapur pada pengujian",
});

beforeAll(async () => {
  t = await setupGarageTestDb();
  ({ outletId } = await seedGarageBasics(t, { userId: OWNER }));
  const db = t.getDb();
  await db.insert(t.schema.user).values({ id: CASHIER, name: "Kasir", email: `${CASHIER}@garage.id` });
  await db.insert(t.schema.wmsCategory)
    .values([
      { name: "Dapur · Sayuran", area: "dapur" },
      { name: "Dapur · Gas & Kebersihan", area: "dapur" },
      { name: "Bar · Kopi", area: "bar" },
    ]).onConflictDoNothing();
  const [a, b] = await db.insert(t.schema.wmsSupplier).values([
    { name: "ANANDA TEST", areas: ["dapur"] },
    { name: "OTHER TEST", areas: ["dapur"] },
  ]).returning({ id: t.schema.wmsSupplier.id });
  supplierId = a.id;
  otherSupplierId = b.id;
  await db.insert(t.schema.wmsProduct).values([
    { sku: "KIT-997", name: "Bawang Uji A", category: "Dapur · Sayuran", unit: "gr" },
    { sku: "KIT-998", name: "Bawang Uji B", category: "Dapur · Sayuran", unit: "gr" },
    { sku: "KIT-996", name: "Gas Uji", category: "Dapur · Gas & Kebersihan", unit: "pcs" },
    { sku: "BAR-999", name: "Kopi Uji", category: "Bar · Kopi", unit: "gr" },
  ]);
}, 60_000);

afterAll(async () => {
  await teardownGarageTestDb(t);
});

describe("garage_assign_kitchen_suppliers", () => {
  it("is R2, confirm-only, and only available with confirmation flow", async () => {
    const { findAgentTool, runAgentTool } = await import("@/lib/agent-tools");
    const tool = findAgentTool("garage_assign_kitchen_suppliers");
    expect(tool).toMatchObject({ domain: "gudang", risk: "R2", write: true, confirmOnly: true });
    await expect(runAgentTool(as(OWNER, "Owner"), "garage_assign_kitchen_suppliers", args(["KIT-997"]), {
      authorization: "", internalOrigin: "http://127.0.0.1:1",
    })).rejects.toMatchObject({ code: "UNKNOWN_TOOL" });
  });

  it("rejects cashier, non-kitchen items, and materials needing special review", async () => {
    const { runAgentTool } = await import("@/lib/agent-tools");
    await expect(runAgentTool(as(CASHIER, "Kasir"), "garage_assign_kitchen_suppliers", args(["KIT-997"]), ctx))
      .rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(runAgentTool(as(OWNER, "Owner"), "garage_assign_kitchen_suppliers", args(["KIT-996"]), ctx))
      .rejects.toMatchObject({ code: "MATERIAL_NOT_ELIGIBLE" });
    await expect(runAgentTool(as(OWNER, "Owner"), "garage_assign_kitchen_suppliers", args(["KIT-997", "BAR-999"]), ctx))
      .rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("writes only supplier reference, verifies rows, supports repeat without duplication", async () => {
    const { runAgentTool } = await import("@/lib/agent-tools");
    const before = await t.getDb().select().from(t.schema.wmsProduct);
    const result = await runAgentTool(as(OWNER, "Owner"), "garage_assign_kitchen_suppliers", args(["KIT-997", "KIT-998"]), ctx) as any;
    expect(result).toMatchObject({ tersimpan: true, verifikasi: { cocok: 2, total: 2 } });
    expect(result.diperbarui).toHaveLength(2);
    const after = await t.getDb().select().from(t.schema.wmsProduct);
    for (const sku of ["KIT-997", "KIT-998"]) {
      const prior = before.find((x) => x.sku === sku)!;
      const current = after.find((x) => x.sku === sku)!;
      expect(current.defaultSupplierId).toBe(supplierId);
      expect(current.hpp).toBe(prior.hpp);
      expect(current.minStock).toBe(prior.minStock);
      expect(current.unit).toBe(prior.unit);
    }
    const again = await runAgentTool(as(OWNER, "Owner"), "garage_assign_kitchen_suppliers", args(["KIT-997", "KIT-998"]), ctx) as any;
    expect(again.diperbarui).toHaveLength(0);
    expect(again.sudahSesuai).toHaveLength(2);
  });

  it("rejects conflicting suppliers instead of overwriting existing assignments", async () => {
    const { runAgentTool } = await import("@/lib/agent-tools");
    await expect(runAgentTool(as(OWNER, "Owner"), "garage_assign_kitchen_suppliers", args(["KIT-997"], otherSupplierId), ctx))
      .rejects.toMatchObject({ code: "SUPPLIER_CONFLICT" });
  });
});
