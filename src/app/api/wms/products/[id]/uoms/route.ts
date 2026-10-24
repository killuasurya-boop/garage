import { z } from "zod";

import { fail, ok, readJson } from "@/lib/api-response";
import { WMS_ELEVATED_ROLES } from "@/lib/wms-access";
import { getPortionYield, listProductUoms, saveProductUoms } from "@/lib/wms-uom";
import { requireGarageSession, requirePermission } from "@/lib/server-auth";

export const runtime = "nodejs";

const schema = z.object({
  uoms: z
    .array(
      z.object({
        uom: z.string().trim().min(2).max(20),
        factor: z.number().positive().max(10_000_000),
        isPurchase: z.boolean().optional(),
        isCount: z.boolean().optional(),
      }),
    )
    .max(5),
});

/** Kemasan bahan + hasil porsi per kemasan dari resep aktif. */
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await requirePermission("inventory:read");
  if (session.response) return session.response;
  const { id } = await context.params;
  const [uoms, portions] = await Promise.all([listProductUoms(id), getPortionYield(id)]);
  return ok({ ...uoms, portions });
}

/** Simpan daftar kemasan (kosong = kembali ke default katalog). Owner/Manajer. */
export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await requireGarageSession([...WMS_ELEVATED_ROLES]);
  if (session.response) return session.response;
  const parsed = await readJson(request, schema);
  if (parsed.error) return parsed.error;
  const { id } = await context.params;
  try {
    return ok({ uoms: await saveProductUoms(id, parsed.data.uoms), portions: await getPortionYield(id) });
  } catch (e) {
    return fail(400, "WMS_UOM_FAILED", e instanceof Error ? e.message : "Gagal menyimpan kemasan.");
  }
}
