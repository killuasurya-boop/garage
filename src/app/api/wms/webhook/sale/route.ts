import { z } from "zod";

import { fail, ok, readJson } from "@/lib/api-response";
import { processPosSale } from "@/lib/wms-service";
import { requirePermission } from "@/lib/server-auth";

export const runtime = "nodejs";

/**
 * Autentikasi webhook: dua jalur.
 * 1. API key (header `x-wms-webhook-secret` = env WMS_WEBHOOK_SECRET) → untuk POS
 *    eksternal/mesin yang tak punya sesi. Dibandingkan dengan panjang tetap.
 * 2. Sesi Garage ber-izin inventory:write → untuk pemanggilan in-app.
 */
function checkWebhookSecret(request: Request): boolean {
  const secret = process.env.WMS_WEBHOOK_SECRET?.trim();
  if (!secret) return false;
  const provided = request.headers.get("x-wms-webhook-secret")?.trim();
  if (!provided || provided.length !== secret.length) return false;
  let diff = 0;
  for (let i = 0; i < secret.length; i++) diff |= secret.charCodeAt(i) ^ provided.charCodeAt(i);
  return diff === 0;
}

// Webhook penjualan POS → potong bahan gudang via BOM resep WMS.
const schema = z.object({
  // ref = penanda penjualan (mis. orderId) untuk idempotensi (retry tak dobel potong).
  ref: z.string().trim().min(1).max(120).optional(),
  items: z.array(z.object({ name: z.string().trim().min(1).max(140), qty: z.number().positive() })).min(1).max(100),
});

export async function POST(request: Request) {
  // Jalur 1: API key eksternal.
  if (checkWebhookSecret(request)) {
    const parsed = await readJson(request, schema);
    if (parsed.error) return parsed.error;
    return ok(await processPosSale(parsed.data, null));
  }
  // Jalur 2: sesi ber-izin. Bila keduanya gagal → tolak.
  const session = await requirePermission("inventory:write");
  if (session.response) {
    return process.env.WMS_WEBHOOK_SECRET
      ? fail(401, "WEBHOOK_UNAUTHORIZED", "API key atau sesi ber-izin diperlukan.")
      : session.response;
  }
  const parsed = await readJson(request, schema);
  if (parsed.error) return parsed.error;
  return ok(await processPosSale(parsed.data, session.data.user.id));
}
