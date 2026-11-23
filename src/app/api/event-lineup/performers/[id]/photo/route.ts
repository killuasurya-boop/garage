import { fail } from "@/lib/api-response";
import { lineupRoute } from "@/lib/event-lineup-route";
import { setPerformerPhoto } from "@/lib/event-lineup-service";
import { MenuImageUploadError, storeMenuImage } from "@/lib/menu-image-upload";
import { requireGarageSession } from "@/lib/server-auth";

export const runtime = "nodejs";
export const maxDuration = 30;
type Ctx = { params: Promise<{ id: string }> };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Unggah foto penampil (field `image`, JPG/PNG/WebP → webp ≤200 KB). Jadi latar kartu lineup halaman event GIGS. */
export async function POST(request: Request, { params }: Ctx) {
  const session = await requireGarageSession(["Owner"]);
  if (session.response) return session.response;
  const { id } = await params;
  if (!UUID.test(id)) return fail(400, "INVALID_ID", "ID penampil tidak valid.");
  let photoUrl: string;
  try {
    photoUrl = await storeMenuImage(request, "event-lineup", `${id}-foto`);
  } catch (error) {
    if (error instanceof MenuImageUploadError) return fail(error.status, error.code, error.message);
    throw error;
  }
  return lineupRoute(() => setPerformerPhoto(id, photoUrl, session.data), 201);
}

/** Hapus foto unggahan → kartu kembali memakai foto umum halaman event. */
export async function DELETE(_request: Request, { params }: Ctx) {
  const session = await requireGarageSession(["Owner"]);
  if (session.response) return session.response;
  const { id } = await params;
  if (!UUID.test(id)) return fail(400, "INVALID_ID", "ID penampil tidak valid.");
  return lineupRoute(() => setPerformerPhoto(id, null, session.data));
}
