import { eventDayRoute } from "@/lib/event-day-route";
import { searchCheckinGuests } from "@/lib/event-day-service";
import { requireGarageSession } from "@/lib/server-auth";

export const runtime = "nodejs";

/** Meja pintu: cari tamu undangan dari nama / nomor HP (`?eventId=&q=`). Nomor HP tidak dikirim balik. Staf mana pun. */
export async function GET(request: Request) {
  const session = await requireGarageSession(["Owner", "Manajer", "Kasir", "Waiter", "Panitia"]);
  if (session.response) return session.response;
  const params = new URL(request.url).searchParams;
  const eventId = params.get("eventId") ?? "";
  if (!/^[0-9a-f-]{36}$/i.test(eventId)) return eventDayRoute(async () => []);
  return eventDayRoute(() => searchCheckinGuests(eventId, (params.get("q") ?? "").slice(0, 80), session.data));
}
