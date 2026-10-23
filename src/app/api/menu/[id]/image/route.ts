import { fail, ok } from "@/lib/api-response";
import { updateMenuProduct } from "@/lib/garage-service";
import { MenuImageUploadError, storeMenuImage } from "@/lib/menu-image-upload";
import { requireGarageSession } from "@/lib/server-auth";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await requireGarageSession(["Owner", "Manajer"]);
  if (session.response) {
    return session.response;
  }

  const { id } = await context.params;
  const safeId = id.trim();

  let publicUrl: string;
  try {
    publicUrl = await storeMenuImage(request, "menu", safeId);
  } catch (error) {
    if (error instanceof MenuImageUploadError) return fail(error.status, error.code, error.message);
    throw error;
  }

  try {
    const product = await updateMenuProduct(safeId, { imageUrl: publicUrl }, session.data);
    return ok({ imageUrl: publicUrl, product }, { status: 201 });
  } catch (error) {
    return fail(400, "MENU_IMAGE_SAVE_FAILED", error instanceof Error ? error.message : "Gagal menyimpan foto menu.");
  }
}
