import { listCheckinEvents } from "@/lib/event-checkin-service";
import { checkinRoute } from "@/lib/event-checkin-route";
import { requireStaffSession } from "@/lib/server-auth";

export const runtime = "nodejs";

/** Event yang bisa dibuka di layar pintu (semua staf, outlet sendiri). */
export async function GET() {
  const session = await requireStaffSession();
  if (session.response) return session.response;
  return checkinRoute(() => listCheckinEvents(session.data));
}
