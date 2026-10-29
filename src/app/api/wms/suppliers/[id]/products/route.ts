import { z } from "zod";

import { fail, ok, readJson } from "@/lib/api-response";
import { WMS_ELEVATED_ROLES } from "@/lib/wms-access";
import { listSupplierProducts, removeSupplierProduct, upsertSupplierProduct } from "@/lib/wms-procurement";
import { procActor } from "@/lib/wms-procurement-route";
import { withMasterErrors } from "@/lib/wms-master-route";
import { requireGarageSession, requirePermission } from "@/lib/server-auth";

export const runtime = "nodejs";

const uuid = z.string().uuid();

/** Bahan yang disediakan supplier + harga referensi + peran utama/alternatif. */
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await requirePermission("inventory:read");
  if (session.response) return session.response;
  const { id } = await context.params;
  if (!uuid.safeParse(id).success) return fail(400, "INVALID_ID", "ID supplier tidak valid.");
  const rows = await listSupplierProducts(id);
  return ok(rows.map((r) => ({ ...r.link, refPrice: Number(r.link.refPrice), sku: r.sku, name: r.name, unit: r.unit, category: r.category })));
}

const putSchema = z.object({
  productId: uuid,
  refPrice: z.number().nonnegative().max(100_000_000), // Rp per satuan dasar
  role: z.enum(["primary", "alternative"]),
});

export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await requireGarageSession([...WMS_ELEVATED_ROLES]);
  if (session.response) return session.response;
  const { id } = await context.params;
  if (!uuid.safeParse(id).success) return fail(400, "INVALID_ID", "ID supplier tidak valid.");
  const parsed = await readJson(request, putSchema);
  if (parsed.error) return parsed.error;
  return withMasterErrors(async () => ok(await upsertSupplierProduct({ supplierId: id, ...parsed.data }, procActor(session.data))));
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await requireGarageSession([...WMS_ELEVATED_ROLES]);
  if (session.response) return session.response;
  const { id } = await context.params;
  const productId = new URL(request.url).searchParams.get("product") ?? "";
  if (!uuid.safeParse(id).success || !uuid.safeParse(productId).success) return fail(400, "INVALID_ID", "ID tidak valid.");
  await removeSupplierProduct(id, productId, procActor(session.data));
  return ok({ removed: true });
}
