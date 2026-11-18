import { fail } from "@/lib/api-response";
import { requirePartnerSession } from "@/lib/partner-auth";
import { setPartnerProductImage } from "@/lib/partner-hub-service";
import { partnerRoute } from "@/lib/partner-hub-route";
import { PartnerImageError, readPartnerProductImage, savePartnerProductImage } from "@/lib/partner-product-image";

export const runtime = "nodejs";
export const maxDuration = 30;

// Portal Mitra: mitra mengunggah foto produknya sendiri (partner_id dari sesi; produk mitra lain = 404).
export async function POST(request: Request, context: { params: Promise<{ linkId: string }> }) {
  const session = await requirePartnerSession(request);
  if (session.response) return session.response;
  const { linkId } = await context.params;
  let data: Buffer;
  try {
    data = await readPartnerProductImage(request);
  } catch (error) {
    if (error instanceof PartnerImageError) return fail(error.status, error.code, error.message);
    return fail(400, "IMAGE_INVALID", "Foto tidak bisa diproses.");
  }
  return partnerRoute(() => setPartnerProductImage(linkId, () => savePartnerProductImage(linkId, data), { partner: session.data }), 201);
}
