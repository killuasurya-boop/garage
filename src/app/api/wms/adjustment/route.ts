import { z } from "zod";

import { fail, ok, readJson } from "@/lib/api-response";
import { adjustWmsStock } from "@/lib/wms-service";
import { requireGarageSession } from "@/lib/server-auth";

export const runtime = "nodejs";

// Koreksi stok manual = tindakan sensitif → hanya peran elevated + alasan wajib.
const ADJUST_ROLES = ["Owner / CEO", "Admin", "Manager Operasional"] as const;

const schema = z.object({
  productId: z.string().uuid(),
  warehouseId: z.string().uuid(),
  deltaQty: z.number().refine((v) => v !== 0, "Delta tidak boleh 0."),
  note: z.string().trim().min(3, "Alasan wajib diisi.").max(200),
});

export async function POST(request: Request) {
  const session = await requireGarageSession([...ADJUST_ROLES]);
  if (session.response) return session.response;
  const parsed = await readJson(request, schema);
  if (parsed.error) return parsed.error;
  try {
    return ok(await adjustWmsStock(parsed.data, session.data.user.id));
  } catch (e) {
    return fail(400, "ADJ_FAILED", e instanceof Error ? e.message : "Gagal koreksi stok.");
  }
}
