import { buildEventIcs, icsResponse } from "@/lib/event-calendar";
import { GRAND_OPENING_SLUG, getPublishedEvent } from "@/lib/event-service";

export const dynamic = "force-dynamic";

const SITE_URL = process.env.NEXT_PUBLIC_GARAGE_PUBLIC_BASE_URL?.startsWith("https://")
  ? process.env.NEXT_PUBLIC_GARAGE_PUBLIC_BASE_URL.replace(/\/+$/, "")
  : "https://garagecoffee.id";

/** File .ics publik Grand Opening (hanya saat event Terbit). */
export async function GET() {
  const event = await getPublishedEvent(GRAND_OPENING_SLUG).catch(() => null);
  if (!event) return new Response("Not found", { status: 404 });
  return icsResponse(buildEventIcs(event, `${SITE_URL}/${GRAND_OPENING_SLUG}`), "grand-opening-garage-coffee.ics");
}
