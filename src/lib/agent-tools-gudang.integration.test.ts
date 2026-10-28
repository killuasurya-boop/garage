import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { GarageSession } from "@/lib/server-auth";
import { setupGarageTestDb, teardownGarageTestDb, type GarageTestDb } from "@/lib/test-helpers/garage-test-db";

// M3d: tool MCP Gudang. Kirim Minta Bahan memindah stok lewat ledger WMS, waste
// staf diputuskan Owner, PO draft → terkirim; semua aksi lewat preview → konfirmasi.

/* eslint-disable @typescript-eslint/no-explicit-any */
let t: GarageTestDb;
let wms: any;
let mainBar = "";
let outletBar = "";
let syrupId = "";
const OWNER = "user-m3d-owner";
const ctx = { authorization: "", internalOrigin: "http://127.0.0.1:1" };

function as(role: string): GarageSession {
  return {
    user: { id: OWNER, name: "Owner M3d", email: `${OWNER}@garage.id` },
    profile: { id: `sp-${OWNER}`, role, shiftLabel: "Pagi", deviceLabel: "Laptop", passwordResetRequired: false, outlet: { id: "o-1", code: "TST", name: "Outlet Test", timezone: "Asia/Jakarta" } },
  } as unknown as GarageSession;
}
const owner = () => as("Owner");

async function call(session: GarageSession, name: string, args: Record<string, unknown>) {
  const { runToolWithConfirmation } = await import("@/lib/mcp-confirmation");
  return (await runToolWithConfirmation({ session, name, rawArgs: args, ctx, oauthClientId: null })) as any;
}

async function confirmed(name: string, args: Record<string, unknown>) {
  const preview = await call(owner(), name, args);
  expect(preview.status).toBe("PERLU_KONFIRMASI");
  const done = await call(owner(), name, { ...args, konfirmasi: preview.konfirmasi });
  expect(done.status).toBe("BERHASIL");
  return { preview, done };
}

async function stock(productId: string, warehouseId: string) {
  const { and, eq } = await import("drizzle-orm");
  const [row] = await t.getDb().select().from(t.schema.wmsWarehouseStock).where(and(eq(t.schema.wmsWarehouseStock.productId, productId), eq(t.schema.wmsWarehouseStock.warehouseId, warehouseId)));
  return Number(row?.qty ?? 0);
}

beforeAll(async () => {
  t = await setupGarageTestDb();
  wms = await import("@/lib/wms-service");
  await t.getDb().insert(t.schema.user).values({ id: OWNER, name: "Owner M3d", email: `${OWNER}@garage.id` });
  const whs = await wms.listWmsWarehouses();
  mainBar = whs.find((w: any) => w.type === "main" && w.area === "bar").id;
  outletBar = whs.find((w: any) => w.type === "bar").id;
  await t.getDb().insert(t.schema.wmsCategory).values({ name: "Bar · M3d", area: "bar" }).onConflictDoNothing();
  syrupId = (await wms.createWmsProduct({ sku: "T-M3D-SYR", name: "Sirup M3d", category: "Bar · M3d", unit: "ml", packPrice: 1_000_000, packQty: 1000 })).id;
  await wms.runInTx((tx: any) =>
    wms.recordStockMovement(tx, { type: "in", productId: syrupId, warehouseId: mainBar, deltaQty: 1000, hpp: 1000, refDoc: "TEST-IN", batchNo: "M3D-1", expiredAt: new Date(Date.now() + 30 * 86_400_000) }),
  );
}, 60_000);

afterAll(async () => {
  await teardownGarageTestDb(t);
});

describe("M3d — tool Gudang", () => {
  it("kirim_minta_bahan: preview tidak memindah stok; konfirmasi memindah sesuai qty diminta", async () => {
    const mr = await import("@/lib/wms-material-request");
    const req = await mr.createMaterialRequest({ division: "bar", items: [{ productId: syrupId, qty: 300 }] }, { userId: null, name: "Barista", outletId: null });
    const list = await call(owner(), "daftar_minta_bahan", { status: "submitted" });
    expect(list.map((row: any) => row.id)).toContain(req.id);

    const preview = await call(owner(), "kirim_minta_bahan", { id: req.id });
    expect(preview.ringkasan.item[0]).toContain("kirim 300/300 ml");
    expect(await stock(syrupId, outletBar)).toBe(0);
    await call(owner(), "kirim_minta_bahan", { id: req.id, konfirmasi: preview.konfirmasi });
    expect(await stock(syrupId, mainBar)).toBe(700);
    expect(await stock(syrupId, outletBar)).toBe(300);
  });

  it("putuskan_waste: waste staf ≥ Rp50.000 menunggu; disetujui → stok dipotong", async () => {
    const waste = await import("@/lib/wms-waste");
    const row = await waste.recordWmsWaste({ warehouseId: outletBar, productId: syrupId, qty: 60, reason: "spill", note: "tumpah" }, { userId: null, name: "Barista", elevated: false });
    expect(row.status).toBe("pending_approval");
    const { preview } = await confirmed("putuskan_waste", { id: row.id, setujui: true });
    expect(preview.ringkasan).toMatchObject({ qty: 60, perkiraanNilai: "Rp60.000" });
    expect(await stock(syrupId, outletBar)).toBe(240);
    await expect(call(as("Kasir"), "putuskan_waste", { id: row.id, setujui: false, catatan: "coba" })).rejects.toBeTruthy();
  });

  it("ubah_status_po: PO draft ditandai terkirim lewat konfirmasi", async () => {
    const purchase = await import("@/lib/wms-purchase");
    const supplier = await wms.createWmsSupplier({ name: "CV M3d" });
    const po = await purchase.createPurchaseOrder({ supplierId: supplier.id, warehouseId: mainBar, items: [{ productId: syrupId, orderedQty: 500, unitPrice: 900 }] } as any);
    const { preview } = await confirmed("ubah_status_po", { id: po.id, aksi: "send" });
    expect(preview.ringkasan).toMatchObject({ total: "Rp450.000", statusSaatIni: "draft" });
    expect((await purchase.getPurchaseOrder(po.id))!.status).toBe("sent");
    expect((await call(owner(), "daftar_po", {})).map((row: any) => row.id)).toContain(po.id);
  });
});
