import { z } from "zod";

import { readJson } from "@/lib/api-response";
import { setPartnerProductActive, setPartnerProductAvailability, setPartnerProductPrice } from "@/lib/partner-hub-service";
import { partnerRoute } from "@/lib/partner-hub-route";
import { requireOwnerOrManager } from "@/lib/server-auth";

export const runtime = "nodejs";

const schema = z.object({
  active: z.boolean().optional(),
  available: z.boolean().optional(),
  price: z
    .object({
      variantId: z.string().trim().min(1),
      unitCost: z.number().int().min(0),
      sellPrice: z.number().int().positive(),
      reason: z.string().trim().min(3, "Alasan perubahan harga wajib diisi.").max(300),
    })
    .optional(),
});

// Satu aksi per permintaan: setujui/nonaktifkan produk (Owner), Tersedia/Habis, atau harga baru (Owner).
export async function PATCH(request: Request, context: { params: Promise<{ linkId: string }> }) {
  const session = await requireOwnerOrManager();
  if (session.response) return session.response;
  const { linkId } = await context.params;
  const body = await readJson(request, schema);
  if (body.error) return body.error;
  const input = body.data;
  return partnerRoute(async () => {
    if (input.price) return setPartnerProductPrice(linkId, input.price, session.data);
    if (input.active !== undefined) return setPartnerProductActive(linkId, input.active, session.data);
    if (input.available !== undefined) return setPartnerProductAvailability(linkId, input.available, { garage: session.data });
    return { linkId };
  });
}
