import { searchCheckinGuests } from "@/lib/event-checkin-service";
import { checkinRoute } from "@/lib/event-checkin-route";
import { invalidId } from "@/lib/event-api";
import { requireStaffSession } from "@/lib/server-auth";

export const runtime = "nodejs";

/** Cari tamu tanpa QR (nama / nomor HP). Nomor HP tidak dikirim balik. */
export async function GET(request: Request, context: { params: Promise<{ eventId: string }> }) {
  const session = await requireStaffSession();
  if (session.response) return session.response;
  const { eventId } = await context.params;
  const bad = invalidId(eventId);
  if (bad) return bad;
  const q = new URL(request.url).searchParams.get("q") ?? "";
  return checkinRoute(() => searchCheckinGuests(eventId, q.slice(0, 80), session.data));
}
