import { z } from "zod";

import { fail, ok, readJson } from "@/lib/api-response";
import { archiveWmsProduct, updateWmsProduct } from "@/lib/wms-service";
import { WMS_ELEVATED_ROLES } from "@/lib/wms-access";
import { requireGarageSession } from "@/lib/server-auth";

export const runtime = "nodejs";

const patchSchema = z.object({
  name: z.string().trim().min(2).max(140).optional(),
  category: z.string().trim().min(2).max(80).optional(),
  unit: z.string().trim().min(1).max(24).optional(),
  minStock: z.number().nonnegative().max(10_000_000).optional(),
  hpp: z.number().nonnegative().max(100_000_000).optional(),
  imageUrl: z.string().trim().max(400).nullable().optional(),
  barcode: z.string().trim().max(64).nullable().optional(),
  restore: z.boolean().optional(), // true = pulihkan dari arsip
});

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await requireGarageSession([...WMS_ELEVATED_ROLES]);
  if (session.response) return session.response;
  const { id } = await context.params;
  const parsed = await readJson(request, patchSchema);
  if (parsed.error) return parsed.error;
  const { restore, ...patch } = parsed.data;
  const row = await updateWmsProduct(id, {
    ...patch,
    ...(restore ? { archivedAt: null } : {}),
  });
  if (!row) return fail(404, "PRODUCT_NOT_FOUND", "Produk tidak ditemukan.");
  return ok(row);
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  // "Hapus" = arsip (soft-delete) agar riwayat ledger/laporan tetap utuh.
  const session = await requireGarageSession([...WMS_ELEVATED_ROLES]);
  if (session.response) return session.response;
  const { id } = await context.params;
  const row = await archiveWmsProduct(id);
  if (!row) return fail(404, "PRODUCT_NOT_FOUND", "Produk tidak ditemukan.");
  return ok({ archived: true });
}
