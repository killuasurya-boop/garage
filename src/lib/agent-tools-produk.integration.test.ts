import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { Role } from "@/lib/garage-data";
import type { GarageSession } from "@/lib/server-auth";
import { seedGarageBasics, setupGarageTestDb, teardownGarageTestDb, type GarageTestDb } from "@/lib/test-helpers/garage-test-db";

// M3c: tool MCP Produk & Harga. Harga diubah per varian (hanya kolom harga),
// dengan proteksi harga basi; aksi produk lewat bulkProductAction (audit per produk).

/* eslint-disable @typescript-eslint/no-explicit-any */
let t: GarageTestDb;
let outletId = "";
const KASIR = "user-m3c-kasir";
const OWNER = "user-m3c-owner";
const ctx = { authorization: "", internalOrigin: "http://127.0.0.1:1" };

function as(userId: string, role: Role): GarageSession {
  return {
    user: { id: userId, name: `Nama ${userId}`, email: `${userId}@garage.id` },
    profile: {
      id: `sp-${userId}`,
      role,
      shiftLabel: "Pagi",
      deviceLabel: "Kasir-1",
      passwordResetRequired: false,
      outlet: { id: outletId, code: "TST", name: "Outlet Test", timezone: "Asia/Jakarta" },
    },
  } as unknown as GarageSession;
}
const kasir = () => as(KASIR, "Kasir");
const owner = () => as(OWNER, "Owner");

async function call(session: GarageSession, name: string, args: Record<string, unknown>) {
  const { runToolWithConfirmation } = await import("@/lib/mcp-confirmation");
  return (await runToolWithConfirmation({ session, name, rawArgs: args, ctx, oauthClientId: null })) as any;
}

/** Preview → konfirmasi → receipt. Memastikan preview belum mengubah apa pun. */
async function confirmed(name: string, args: Record<string, unknown>, beforeExecute?: (preview: any) => Promise<void>) {
  const preview = await call(owner(), name, args);
  expect(preview.status).toBe("PERLU_KONFIRMASI");
  expect(preview.dijalankan).toBe(false);
  await beforeExecute?.(preview);
  const done = await call(owner(), name, { ...args, konfirmasi: preview.konfirmasi });
  expect(done.status).toBe("BERHASIL");
  expect(done.receipt.tool).toBe(name);
  return { preview, done };
}

beforeAll(async () => {
  t = await setupGarageTestDb();
  ({ outletId } = await seedGarageBasics(t, { userId: KASIR }));
  const d = t.getDb();
  await d.insert(t.schema.user).values({ id: OWNER, name: "Owner M3c", email: `${OWNER}@garage.id` });
  await d.insert(t.schema.staffProfiles).values([
    { userId: KASIR, outletId, role: "Kasir", status: "active" },
    { userId: OWNER, outletId, role: "Owner", status: "active" },
  ]).onConflictDoNothing();
  await d.insert(t.schema.menuItems).values({ id: "itm-m3c", name: "Latte M3c", category: "Coffee", section: "Coffee", prep: "1m" });
  await d.insert(t.schema.menuVariants).values([
    { itemId: "itm-m3c", variantId: "cold", label: "Cold", price: 25_000, baseCost: 10_000, sku: "LAT-C" },
    { itemId: "itm-m3c", variantId: "hot", label: "Hot", price: 23_000, sku: "LAT-H" },
  ]);
}, 90_000);

afterAll(async () => {
  if (t) await teardownGarageTestDb(t);
});

async function variants() {
  const { eq } = await import("drizzle-orm");
  return t.getDb().select().from(t.schema.menuVariants).where(eq(t.schema.menuVariants.itemId, "itm-m3c")).orderBy(t.schema.menuVariants.variantId);
}

describe("M3c — tool Produk & Harga", () => {
  it("ubah_harga_varian: hanya harga varian itu berubah; SKU, HPP & varian lain tetap; tercatat di audit", async () => {
    const { preview } = await confirmed("ubah_harga_varian", { menuId: "itm-m3c", variantId: "cold", hargaLama: 25_000, hargaBaru: 27_000, alasan: "Harga susu naik" });
    expect(preview.ringkasan).toMatchObject({ hargaSaatIni: "Rp25.000", hargaBaru: "Rp27.000", perubahanPersen: 8, marginBaru: "63%" });
    const [cold, hot] = await variants();
    expect(cold).toMatchObject({ price: 27_000, baseCost: 10_000, sku: "LAT-C" });
    expect(hot).toMatchObject({ price: 23_000, sku: "LAT-H" });
    const { eq } = await import("drizzle-orm");
    const logs = await t.getDb().select().from(t.schema.auditLogs).where(eq(t.schema.auditLogs.action, "Menu variant price updated"));
    expect(logs.at(-1)?.metadata).toMatchObject({ before: { price: 25_000 }, after: { price: 27_000 }, reason: "Harga susu naik" });
  });

  it("harga basi ditolak (STALE_PRICE); Kasir ditolak", async () => {
    const preview = await call(owner(), "ubah_harga_varian", { menuId: "itm-m3c", variantId: "cold", hargaLama: 25_000, hargaBaru: 30_000, alasan: "Uji basi" });
    expect(preview.ringkasan.catatan).toContain("akan ditolak");
    await expect(call(owner(), "ubah_harga_varian", { menuId: "itm-m3c", variantId: "cold", hargaLama: 25_000, hargaBaru: 30_000, alasan: "Uji basi", konfirmasi: preview.konfirmasi })).rejects.toMatchObject({
      code: "STALE_PRICE",
    });
    expect((await variants())[0].price).toBe(27_000);
    await expect(call(kasir(), "ubah_harga_varian", { menuId: "itm-m3c", variantId: "cold", hargaLama: 27_000, hargaBaru: 1, alasan: "Iseng" })).rejects.toBeTruthy();
  });

  it("aksi_produk: tandai habis lalu arsipkan, lewat konfirmasi", async () => {
    await confirmed("aksi_produk", { menuIds: ["itm-m3c"], aksi: "stock", nilai: "sold_out" });
    const { preview } = await confirmed("aksi_produk", { menuIds: ["itm-m3c", "tidak-ada"], aksi: "archive" });
    expect(preview.ringkasan).toMatchObject({ jumlahProduk: 1, tidakDitemukan: ["tidak-ada"] });
    const { eq } = await import("drizzle-orm");
    const [item] = await t.getDb().select().from(t.schema.menuItems).where(eq(t.schema.menuItems.id, "itm-m3c"));
    expect(item).toMatchObject({ stock: "sold_out", status: "archived" });
    expect(Array.isArray(await call(owner(), "daftar_kategori_produk", {}))).toBe(true);
  });
});
