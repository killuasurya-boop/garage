import { readJson } from "@/lib/api-response";
import { checkInGuest, checkinSchema, getCheckinBoard } from "@/lib/event-checkin-service";
import { checkinRoute } from "@/lib/event-checkin-route";
import { invalidId } from "@/lib/event-api";
import { requireStaffSession } from "@/lib/server-auth";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ eventId: string }> };

/** Papan pintu: rekap hadir vs RSVP + daftar check-in terakhir. */
export async function GET(_request: Request, context: Ctx) {
  const session = await requireStaffSession();
  if (session.response) return session.response;
  const { eventId } = await context.params;
  const bad = invalidId(eventId);
  if (bad) return bad;
  return checkinRoute(() => getCheckinBoard(eventId, session.data));
}

/** Catat tamu undangan masuk (QR atau pilih nama). Satu undangan hanya sekali. */
export async function POST(request: Request, context: Ctx) {
  const session = await requireStaffSession();
  if (session.response) return session.response;
  const { eventId } = await context.params;
  const bad = invalidId(eventId);
  if (bad) return bad;
  const body = await readJson(request, checkinSchema);
  if (body.error) return body.error;
  return checkinRoute(() => checkInGuest(eventId, body.data, session.data), 201);
}
