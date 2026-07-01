import { z } from "zod";

import { ok, readJson } from "@/lib/api-response";
import { processPosSale } from "@/lib/wms-service";
import { requirePermission } from "@/lib/server-auth";

export const runtime = "nodejs";

// Webhook penjualan POS → potong bahan gudang via BOM resep WMS.
const schema = z.object({
  // ref = penanda penjualan (mis. orderId) untuk idempotensi (retry tak dobel potong).
  ref: z.string().trim().min(1).max(120).optional(),
  items: z.array(z.object({ name: z.string().trim().min(1).max(140), qty: z.number().positive() })).min(1).max(100),
});

export async function POST(request: Request) {
  const session = await requirePermission("inventory:write");
  if (session.response) return session.response;
  const parsed = await readJson(request, schema);
  if (parsed.error) return parsed.error;
  return ok(await processPosSale(parsed.data, session.data.user.id));
}
