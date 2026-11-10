import { eq } from "drizzle-orm";
import { z } from "zod";

import { getDb } from "@/db";
import { wmsProduct } from "@/db/schema";
import { fail, ok, readJson } from "@/lib/api-response";
import { archiveWmsProduct, updateWmsProduct } from "@/lib/wms-service";
import { getProductUsage, listMasterAudit } from "@/lib/wms-master-data";
import { WMS_ELEVATED_ROLES } from "@/lib/wms-access";
import { masterActor, withMasterErrors } from "@/lib/wms-master-route";
import { requireGarageSession, requirePermission } from "@/lib/server-auth";

export const runtime = "nodejs";

const patchSchema = z.object({
  name: z.string().trim().min(2).max(140).optional(),
  category: z.string().trim().min(2).max(80).optional(),
  subcategory: z.string().trim().max(80).optional(),
  brand: z.string().trim().max(80).optional(),
  defaultSupplierId: z.string().uuid().nullable().optional(),
  unit: z.string().trim().min(1).max(24).optional(),
  minStock: z.number().nonnegative().max(10_000_000).optional(),
  parStock: z.number().nonnegative().max(10_000_000).optional(),
  hpp: z.number().nonnegative().max(100_000_000).optional(),
  // Harga beli per kemasan + isi kemasan (satuan stok) → HPP per satuan otomatis.
  packPrice: z.number().nonnegative().max(1_000_000_000).optional(),
  packQty: z.number().positive().max(100_000_000).optional(),
  packName: z.string().trim().max(40).optional(),
  imageUrl: z.string().trim().max(400).nullable().optional(),
  barcode: z.string().trim().max(64).nullable().optional(),
  restore: z.boolean().optional(), // true = pulihkan dari arsip
});

/** Pemakaian bahan (kunci satuan / arsip) + riwayat perubahan master. */
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await requirePermission("inventory:read");
  if (session.response) return session.response;
  const { id } = await context.params;
  if (!z.string().uuid().safeParse(id).success) return fail(400, "INVALID_ID", "ID bahan tidak valid.");
  const [prod] = await getDb().select().from(wmsProduct).where(eq(wmsProduct.id, id)).limit(1);
  if (!prod) return fail(404, "PRODUCT_NOT_FOUND", "Produk tidak ditemukan.");
  const usage = await getProductUsage(getDb(), prod);
  return ok({
    usage,
    unitLocked: usage.hasLedger || usage.onHand !== 0 || usage.activeMenus.length > 0 || usage.publishedRecipes.length > 0,
    history: await listMasterAudit(prod.sku),
  });
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await requireGarageSession([...WMS_ELEVATED_ROLES]);
  if (session.response) return session.response;
  const { id } = await context.params;
  const parsed = await readJson(request, patchSchema);
  if (parsed.error) return parsed.error;
  const { restore, ...patch } = parsed.data;
  return withMasterErrors(async () => {
    const row = await updateWmsProduct(
      id,
      { ...patch, ...(restore ? { archivedAt: null } : {}) },
      undefined,
      masterActor(session.data),
    );
    if (!row) return fail(404, "PRODUCT_NOT_FOUND", "Produk tidak ditemukan.");
    return ok(row);
  });
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  // "Hapus" = arsip (soft-delete) agar riwayat ledger/laporan tetap utuh.
  // Ditolak (409) bila bahan masih dipakai resep aktif atau masih ada stok.
  const session = await requireGarageSession([...WMS_ELEVATED_ROLES]);
  if (session.response) return session.response;
  const { id } = await context.params;
  return withMasterErrors(async () => {
    const row = await archiveWmsProduct(id, masterActor(session.data));
    if (!row) return fail(404, "PRODUCT_NOT_FOUND", "Produk tidak ditemukan.");
    return ok({ archived: true });
  });
}
