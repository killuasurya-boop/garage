import { fail, ok } from "@/lib/api-response";
import { eventErrorResponse } from "@/lib/event-api";
import { getPublicEventMenu } from "@/lib/event-menu-service";

export const runtime = "nodejs";
export async function GET(_request: Request, context: { params: Promise<{ slug: string }> }) {
  const { slug } = await context.params;
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || slug.length > 100) return fail(404, "EVENT_NOT_FOUND", "Event tidak ditemukan.");
  try { return ok(await getPublicEventMenu(slug), { headers: { "Cache-Control": "no-store" } }); }
  catch (error) { return eventErrorResponse(error, "Gagal memuat menu event."); }
}
