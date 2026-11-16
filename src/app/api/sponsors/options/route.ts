import { sponsorEventOptions } from "@/lib/event-sponsor-service";
import { sponsorRoute } from "@/lib/event-sponsor-route";
import { requireGarageSession } from "@/lib/server-auth";

export const runtime = "nodejs";

/** Event Garage OS yang bisa ditautkan ke sponsor (opsional). */
export async function GET() {
  const session = await requireGarageSession(["Owner"]);
  if (session.response) return session.response;
  return sponsorRoute(() => sponsorEventOptions(session.data));
}
