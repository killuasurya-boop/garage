import { fail } from "@/lib/api-response";
import { registrationRoute } from "@/lib/event-registration-route";
import { panitiaRegistrations } from "@/lib/event-registration-service";
import { requireGarageSession } from "@/lib/server-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Ruang Panitia: ketua/sekretaris event melihat pendaftar (tanpa kontak & nominal). Setuju/tolak tetap Owner. */
export async function GET(request: Request) {
  const session = await requireGarageSession(["Owner", "Manajer", "Kasir", "Waiter", "Panitia"]);
  if (session.response) return session.response;
  const eventId = new URL(request.url).searchParams.get("eventId") ?? "";
  if (!/^[0-9a-f-]{36}$/i.test(eventId)) return fail(400, "INVALID_EVENT", "Pilih event.");
  return registrationRoute(async () => ({ registrations: await panitiaRegistrations(eventId, session.data) }));
}
