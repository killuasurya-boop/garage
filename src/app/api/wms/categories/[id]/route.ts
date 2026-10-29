import { z } from "zod";

import { fail, ok, readJson } from "@/lib/api-response";
import { archiveWmsCategory, updateWmsCategory } from "@/lib/wms-service";
import { WMS_ELEVATED_ROLES } from "@/lib/wms-access";
import { masterActor, withMasterErrors } from "@/lib/wms-master-route";
import { requireGarageSession } from "@/lib/server-auth";

export const runtime = "nodejs";

const patchSchema = z.object({
  name: z.string().trim().min(2).max(80).optional(),
  area: z.enum(["bar", "dapur", "umum"]).optional(),
  archived: z.literal(false).optional(), // false = pulihkan dari arsip
});

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await requireGarageSession([...WMS_ELEVATED_ROLES]);
  if (session.response) return session.response;
  const { id } = await context.params;
  const parsed = await readJson(request, patchSchema);
  if (parsed.error) return parsed.error;
  return withMasterErrors(async () => {
    const row = await updateWmsCategory(id, parsed.data, masterActor(session.data));
    if (!row) return fail(404, "CATEGORY_NOT_FOUND", "Kategori tidak ditemukan.");
    return ok(row);
  });
}

/** "Hapus" = arsipkan. Kategori tidak pernah dihapus permanen (jejak area bahan lama tetap ada). */
export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await requireGarageSession([...WMS_ELEVATED_ROLES]);
  if (session.response) return session.response;
  const { id } = await context.params;
  const res = await archiveWmsCategory(id, masterActor(session.data));
  if (res.ok) return ok({ archived: true });
  if (res.reason === "not_found") return fail(404, "CATEGORY_NOT_FOUND", "Kategori tidak ditemukan.");
  return fail(409, "CATEGORY_IN_USE", `Kategori masih dipakai ${res.count} bahan aktif. Pindahkan bahan itu ke kategori lain dulu.`);
}
