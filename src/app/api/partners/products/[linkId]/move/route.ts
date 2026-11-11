import { z } from "zod";

import { readJson } from "@/lib/api-response";
import { movePartnerProduct } from "@/lib/partner-hub-service";
import { partnerRoute } from "@/lib/partner-hub-route";
import { requireOwnerOrManager } from "@/lib/server-auth";

export const runtime = "nodejs";

const schema = z.object({
  toPartnerId: z.string().uuid(),
  reason: z.string().trim().min(3, "Alasan pemindahan wajib diisi.").max(300),
});

// Pindahkan produk ke mitra lain (service menolak selain Owner). Pesanan lama tetap milik mitra asal.
export async function POST(request: Request, context: { params: Promise<{ linkId: string }> }) {
  const session = await requireOwnerOrManager();
  if (session.response) return session.response;
  const { linkId } = await context.params;
  const body = await readJson(request, schema);
  if (body.error) return body.error;
  return partnerRoute(() => movePartnerProduct(linkId, body.data, session.data));
}
