import { readJson } from "@/lib/api-response";
import { recordWalkin, walkinSchema } from "@/lib/event-checkin-service";
import { checkinRoute } from "@/lib/event-checkin-route";
import { invalidId } from "@/lib/event-api";
import { requireStaffSession } from "@/lib/server-auth";

export const runtime = "nodejs";

/** Tamu tanpa undangan (walk-in): jumlah orang + nama opsional. Idempoten per kunci. */
export async function POST(request: Request, context: { params: Promise<{ eventId: string }> }) {
  const session = await requireStaffSession();
  if (session.response) return session.response;
  const { eventId } = await context.params;
  const bad = invalidId(eventId);
  if (bad) return bad;
  const body = await readJson(request, walkinSchema);
  if (body.error) return body.error;
  return checkinRoute(() => recordWalkin(eventId, body.data, session.data), 201);
}
