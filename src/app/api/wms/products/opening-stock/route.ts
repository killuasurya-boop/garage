import { z } from "zod";

import { fail, ok, readJson } from "@/lib/api-response";
import { recordOpeningStock } from "@/lib/wms-service";
import { WMS_ELEVATED_ROLES } from "@/lib/wms-access";
import { requireGarageSession } from "@/lib/server-auth";

export const runtime = "nodejs";

const schema = z.object({
  sku: z.string().trim().min(2).max(60),
  qty: z.number().positive().max(100_000_000),
  warehouseId: z.string().uuid().nullable().optional(),
  expiredAt: z.string().date().nullable().optional(),
  /** true = tolak bila bahan sudah punya riwayat stok (dipakai Master Data; cegah stok awal dobel). */
  onlyIfEmpty: z.boolean().optional(),
});

// Stok awal bahan dari form produk/resep (Owner/Manajer). Pembelian tetap lewat Receiving.
export async function POST(request: Request) {
  const session = await requireGarageSession([...WMS_ELEVATED_ROLES]);
  if (session.response) return session.response;
  const parsed = await readJson(request, schema);
  if (parsed.error) return parsed.error;
  try {
    const { expiredAt, ...rest } = parsed.data;
    return ok(await recordOpeningStock({ ...rest, expiredAt: expiredAt ? new Date(`${expiredAt}T23:59:59+07:00`) : null }, session.data.user.id), { status: 201 });
  } catch (e) {
    return fail(400, "OPENING_STOCK_FAILED", e instanceof Error ? e.message : "Gagal mencatat stok awal.");
  }
}
