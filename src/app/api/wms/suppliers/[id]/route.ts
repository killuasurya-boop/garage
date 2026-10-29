import { z } from "zod";

import { fail, ok, readJson } from "@/lib/api-response";
import { archiveWmsSupplier, redactSupplierBank, updateWmsSupplier } from "@/lib/wms-service";
import { getWmsSupplierDetail } from "@/lib/wms-master-data";
import { WMS_ELEVATED_ROLES, wmsIsElevated } from "@/lib/wms-access";
import { masterActor, withMasterErrors } from "@/lib/wms-master-route";
import { requireGarageSession, requirePermission } from "@/lib/server-auth";

export const runtime = "nodejs";

const patchSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  phone: z.string().trim().max(40).optional(),
  address: z.string().trim().max(300).optional(),
  note: z.string().trim().max(200).optional(),
  picName: z.string().trim().max(120).optional(),
  areas: z.array(z.enum(["bar", "dapur", "umum", "teknik"])).max(4).optional(),
  productCategories: z.string().trim().max(200).optional(),
  paymentMethod: z.enum(["", "cash", "transfer", "tempo"]).optional(),
  paymentTermDays: z.number().int().min(0).max(365).optional(),
  bankName: z.string().trim().max(60).optional(),
  bankAccountNumber: z.string().trim().max(40).optional(),
  bankAccountName: z.string().trim().max(120).optional(),
  archived: z.literal(false).optional(), // false = pulihkan dari arsip
});

/** Detail supplier: bahan yang disuplai + riwayat harga beli per penerimaan. */
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await requirePermission("inventory:read");
  if (session.response) return session.response;
  const { id } = await context.params;
  if (!z.string().uuid().safeParse(id).success) return fail(400, "INVALID_ID", "ID supplier tidak valid.");
  const detail = await getWmsSupplierDetail(id);
  if (!detail) return fail(404, "SUPPLIER_NOT_FOUND", "Supplier tidak ditemukan.");
  return ok(wmsIsElevated(session.data.profile.role) ? detail : redactSupplierBank(detail));
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await requireGarageSession([...WMS_ELEVATED_ROLES]);
  if (session.response) return session.response;
  const { id } = await context.params;
  const parsed = await readJson(request, patchSchema);
  if (parsed.error) return parsed.error;
  return withMasterErrors(async () => {
    const row = await updateWmsSupplier(id, parsed.data, masterActor(session.data));
    if (!row) return fail(404, "SUPPLIER_NOT_FOUND", "Supplier tidak ditemukan.");
    return ok(row);
  });
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await requireGarageSession([...WMS_ELEVATED_ROLES]);
  if (session.response) return session.response;
  const { id } = await context.params;
  const res = await archiveWmsSupplier(id, masterActor(session.data));
  if (!res.ok) return fail(404, "SUPPLIER_NOT_FOUND", "Supplier tidak ditemukan.");
  return ok({ archived: true });
}
