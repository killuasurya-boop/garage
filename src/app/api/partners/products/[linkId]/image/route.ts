import { fail } from "@/lib/api-response";
import { setPartnerProductImage } from "@/lib/partner-hub-service";
import { partnerRoute } from "@/lib/partner-hub-route";
import { PartnerImageError, readPartnerProductImage, savePartnerProductImage } from "@/lib/partner-product-image";
import { requireOwnerOrManager } from "@/lib/server-auth";

export const runtime = "nodejs";
export const maxDuration = 30;

// Garage OS (Owner/Manajer): unggah / ganti / hapus foto produk mitra — juga foto yang diunggah mitra.
// Logika kompres/simpan sama dengan Portal Mitra; setiap perubahan tercatat sebagai event `product_photo`.
export async function POST(request: Request, context: { params: Promise<{ linkId: string }> }) {
  const session = await requireOwnerOrManager();
  if (session.response) return session.response;
  const { linkId } = await context.params;
  let data: Buffer;
  try {
    data = await readPartnerProductImage(request);
  } catch (error) {
    if (error instanceof PartnerImageError) return fail(error.status, error.code, error.message);
    return fail(400, "IMAGE_INVALID", "Foto tidak bisa diproses.");
  }
  return partnerRoute(() => setPartnerProductImage(linkId, () => savePartnerProductImage(linkId, data), { garage: session.data }), 201);
}

export async function DELETE(_request: Request, context: { params: Promise<{ linkId: string }> }) {
  const session = await requireOwnerOrManager();
  if (session.response) return session.response;
  const { linkId } = await context.params;
  return partnerRoute(() => setPartnerProductImage(linkId, async () => null, { garage: session.data }));
}
