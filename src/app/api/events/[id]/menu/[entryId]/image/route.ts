import { fail, ok } from "@/lib/api-response";
import { eventActor, eventErrorResponse, invalidId } from "@/lib/event-api";
import { setEventMenuEntryImage } from "@/lib/event-menu-service";
import { MenuImageUploadError, storeMenuImage } from "@/lib/menu-image-upload";
import { requirePermission } from "@/lib/server-auth";

export const runtime = "nodejs";
export const maxDuration = 30;
type Context = { params: Promise<{ id: string; entryId: string }> };

/** Unggah foto paket event (webp ≤200 KB). */
export async function POST(request: Request, context: Context) {
  const session = await requirePermission("events:manage"); if (session.response) return session.response;
  const { id, entryId } = await context.params;
  const invalid = invalidId(id, entryId); if (invalid) return invalid;
  let imageUrl: string;
  try { imageUrl = await storeMenuImage(request, "event-menu", entryId); }
  catch (error) {
    if (error instanceof MenuImageUploadError) return fail(error.status, error.code, error.message);
    throw error;
  }
  try { return ok(await setEventMenuEntryImage(id, entryId, imageUrl, { ...eventActor(session.data), outletId: session.data.profile.outlet.id }), { status: 201 }); }
  catch (error) { return eventErrorResponse(error, "Gagal menyimpan foto paket."); }
}

/** Hapus foto paket → kembali ke kolase foto komponen. */
export async function DELETE(_request: Request, context: Context) {
  const session = await requirePermission("events:manage"); if (session.response) return session.response;
  const { id, entryId } = await context.params;
  const invalid = invalidId(id, entryId); if (invalid) return invalid;
  try { return ok(await setEventMenuEntryImage(id, entryId, null, { ...eventActor(session.data), outletId: session.data.profile.outlet.id })); }
  catch (error) { return eventErrorResponse(error, "Gagal menghapus foto paket."); }
}
