/* eslint-disable @typescript-eslint/no-explicit-any */
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi, type MockInstance } from "vitest";

import * as planner from "@/lib/master-import-plan";
import type { GarageSession } from "@/lib/server-auth";
import {
  seedGarageBasics,
  setupGarageTestDb,
  teardownGarageTestDb,
  type GarageTestDb,
} from "@/lib/test-helpers/garage-test-db";

// Exercise real planning, transactions, approval, and database constraints. Only
// replace workbook decoding: small fixtures make the failure cases explicit and
// avoid depending on a binary workbook for transaction-safety regressions.
let t: GarageTestDb;
let service: typeof import("@/lib/master-import");
let parseWorkbook: MockInstance<typeof planner.parseMasterWorkbook>;
const actor = { id: "owner-m3f", name: "Owner M3f" };
const ctx = { authorization: "", internalOrigin: "http://127.0.0.1:1" };
let sequence = 700;

beforeAll(async () => {
  t = await setupGarageTestDb();
  await seedGarageBasics(t, { userId: actor.id });
  parseWorkbook = vi.spyOn(planner, "parseMasterWorkbook");
  service = await import("@/lib/master-import");
}, 60_000);

afterAll(async () => {
  parseWorkbook?.mockRestore();
  await teardownGarageTestDb(t);
});

async function fixture() {
  const suffix = String(++sequence);
  const menuItemId = `m3f-${suffix}`;
  const menuName = `Menu M3f ${suffix}`;
  const sku = `KIT-${suffix}`;
  await t.getDb().insert(t.schema.menuItems).values({
    id: menuItemId, name: menuName, category: "Makanan", section: "Makanan", prep: "5m",
  });
  await t.getDb().insert(t.schema.menuVariants).values({
    itemId: menuItemId, variantId: "reg", label: "Regular", price: 20_000,
  });
  const data: planner.MasterWorkbookData = {
    sheetNames: ["Master Bahan", "Recipe Detail", "POS Menu Register"],
    warnings: [],
    materials: [{
      key: sku, station: "Dapur", name: `Bahan M3f ${suffix}`, baseUnit: "gr",
      packQty: 1000, packPriceModel: 10_000, unitCost: 10,
      confidence: "HIGH", note: "Valid fixture", sourceUnit: "gr", row: 2,
    }],
    recipeLines: [{
      recipeId: `KT-${suffix}`, menu: menuName, station: "Dapur", materialKey: sku,
      qty: 50, unit: "gr", confidence: "HIGH", row: 2,
    }],
    posRegister: [{
      posSku: `POS-${suffix}`, name: menuName, station: "Dapur", variant: "Regular",
      price: 20_000, recipeLink: `KT-${suffix}`, row: 2,
    }],
  };
  parseWorkbook.mockReturnValue(data);
  return {
    menuItemId, sku, recipeId: `KT-${suffix}`,
    input: { buffer: Buffer.from(`m3f-${suffix}`), fileName: `safety-${suffix}.xlsx` },
  };
}

function as(role: string): GarageSession {
  return {
    user: { id: actor.id, name: actor.name, email: `${actor.id}@garage.id` },
    profile: { id: `sp-${actor.id}`, role, shiftLabel: "Pagi", deviceLabel: "Laptop", passwordResetRequired: false, outlet: { id: "o-1", code: "TST", name: "Outlet Test", timezone: "Asia/Jakarta" } },
  } as unknown as GarageSession;
}

async function call(session: GarageSession, name: string, args: Record<string, unknown>) {
  const { runToolWithConfirmation } = await import("@/lib/mcp-confirmation");
  return (await runToolWithConfirmation({ session, name, rawArgs: args, ctx, oauthClientId: null })) as any;
}

async function statuses(menuItemId: string) {
  const rows = await t.getDb().select().from(t.schema.menuRecipes).where(eq(t.schema.menuRecipes.menuItemId, menuItemId));
  return rows.map((row: { status: string }) => row.status);
}

// M3f: tool MCP Bahan & Resep — resep usulan baru aktif setelah preview → konfirmasi.
describe("M3f — tool Bahan & Resep", () => {
  it("setujui_resep_draft: preview menampilkan bahan & HPP tanpa mengaktifkan; konfirmasi mengaktifkan + HPP varian", async () => {
    const f = await fixture();
    await service.applyMasterImport(f.input, actor);
    const drafts = await call(as("Owner"), "daftar_resep_draft", { cari: "Menu M3f" });
    expect(drafts.map((row: any) => row.menuItemId)).toContain(f.menuItemId);

    const preview = await call(as("Owner"), "setujui_resep_draft", { menuId: f.menuItemId });
    expect(preview.status).toBe("PERLU_KONFIRMASI");
    expect(preview.ringkasan.bahan[0]).toContain("50 gr");
    expect(preview.ringkasan.varian[0]).toContain("HPP Rp500");
    expect(await statuses(f.menuItemId)).toEqual(["draft"]);

    const done = await call(as("Owner"), "setujui_resep_draft", { menuId: f.menuItemId, konfirmasi: preview.konfirmasi });
    expect(done.status).toBe("BERHASIL");
    expect(await statuses(f.menuItemId)).toEqual(["active"]);
    const [variant] = await t.getDb().select().from(t.schema.menuVariants).where(eq(t.schema.menuVariants.itemId, f.menuItemId));
    expect(Number(variant.baseCost)).toBe(500);
  });

  it("tolak_resep_draft (R1): diarsipkan dengan alasan; Kasir ditolak", async () => {
    const f = await fixture();
    await service.applyMasterImport(f.input, actor);
    await expect(call(as("Kasir"), "tolak_resep_draft", { menuId: f.menuItemId, alasan: "Coba" })).rejects.toBeTruthy();
    await call(as("Owner"), "tolak_resep_draft", { menuId: f.menuItemId, alasan: "Gramasi belum diuji" });
    expect(await statuses(f.menuItemId)).toEqual(["archived"]);
    await expect(call(as("Owner"), "setujui_resep_draft", { menuId: f.menuItemId })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
