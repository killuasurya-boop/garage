import { fail, ok } from "@/lib/api-response";
import { WMS_ELEVATED_ROLES } from "@/lib/wms-access";
import { createPurchaseOrdersFromSuggestions, getReorderSuggestions } from "@/lib/wms-purchase";
import { requireGarageSession } from "@/lib/server-auth";

export const runtime = "nodejs";

/** Saran isi ulang per ruang (transfer dari gudang utama dulu, sisanya beli). */
export async function GET() {
  const session = await requireGarageSession([...WMS_ELEVATED_ROLES]);
  if (session.response) return session.response;
  return ok(await getReorderSuggestions());
}

/** Buat PO draft per supplier dari bagian "beli" saran reorder. */
export async function POST() {
  const session = await requireGarageSession([...WMS_ELEVATED_ROLES]);
  if (session.response) return session.response;
  try {
    return ok(await createPurchaseOrdersFromSuggestions(session.data.user.id), { status: 201 });
  } catch (e) {
    return fail(400, "WMS_REORDER_PO_FAILED", e instanceof Error ? e.message : "Gagal membuat PO.");
  }
}
