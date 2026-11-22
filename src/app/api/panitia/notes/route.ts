import { readJson } from "@/lib/api-response";
import { eventNotesSchema, saveEventNotes } from "@/lib/event-crew-notes-service";
import { lineupRoute } from "@/lib/event-lineup-route";
import { requireGarageSession } from "@/lib/server-auth";

export const runtime = "nodejs";

/** Simpan catatan panitia (rundown, kesiapan, porsi tambahan): Owner, atau Ketua/Sekretaris panitia event itu. */
export async function PUT(request: Request) {
  const session = await requireGarageSession(["Owner", "Manajer", "Kasir", "Waiter", "Panitia"]);
  if (session.response) return session.response;
  const body = await readJson(request, eventNotesSchema);
  if (body.error) return body.error;
  return lineupRoute(() => saveEventNotes(body.data, session.data));
}
