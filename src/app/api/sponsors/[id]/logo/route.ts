import { fail } from "@/lib/api-response";
import { setSponsorLogo } from "@/lib/event-sponsor-service";
import { sponsorRoute } from "@/lib/event-sponsor-route";
import { MenuImageUploadError, storeMenuImage } from "@/lib/menu-image-upload";
import { requireGarageSession } from "@/lib/server-auth";

export const runtime = "nodejs";
export const maxDuration = 30;
type Ctx = { params: Promise<{ id: string }> };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Unggah logo sponsor (field `image`, JPG/PNG/WebP → webp ≤200 KB). Tidak menyentuh uang. */
export async function POST(request: Request, { params }: Ctx) {
  const session = await requireGarageSession(["Owner"]);
  if (session.response) return session.response;
  const { id } = await params;
  if (!UUID.test(id)) return fail(400, "INVALID_ID", "ID sponsor tidak valid.");
  let logoUrl: string;
  try {
    logoUrl = await storeMenuImage(request, "event-sponsor", id);
  } catch (error) {
    if (error instanceof MenuImageUploadError) return fail(error.status, error.code, error.message);
    throw error;
  }
  return sponsorRoute(() => setSponsorLogo(id, logoUrl, session.data));
}

/** Hapus logo sponsor. */
export async function DELETE(_request: Request, { params }: Ctx) {
  const session = await requireGarageSession(["Owner"]);
  if (session.response) return session.response;
  const { id } = await params;
  if (!UUID.test(id)) return fail(400, "INVALID_ID", "ID sponsor tidak valid.");
  return sponsorRoute(() => setSponsorLogo(id, null, session.data));
}
