import { fail, ok } from "@/lib/api-response";
import { WMS_ELEVATED_ROLES } from "@/lib/wms-access";
import { createPurchaseOrdersFromShortages, listMaterialShortages } from "@/lib/wms-material-request";
import { requireGarageSession } from "@/lib/server-auth";

export const runtime = "nodejs";

/** Bahan yang diminta Bar/Dapur tapi kosong di gudang (belum dibuatkan PO). */
export async function GET() {
  const session = await requireGarageSession([...WMS_ELEVATED_ROLES]);
  if (session.response) return session.response;
  return ok(await listMaterialShortages());
}

/** Kekurangan → PO draft per supplier terakhir. */
export async function POST() {
  const session = await requireGarageSession([...WMS_ELEVATED_ROLES]);
  if (session.response) return session.response;
  try {
    return ok(await createPurchaseOrdersFromShortages(session.data.user.id), { status: 201 });
  } catch (e) {
    return fail(400, "MATERIAL_SHORTAGE_PO_FAILED", e instanceof Error ? e.message : "Gagal membuat PO.");
  }
}
