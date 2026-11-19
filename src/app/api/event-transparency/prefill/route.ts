import { fail } from "@/lib/api-response";
import { prefillPublicFinance } from "@/lib/event-public-finance";
import { publicFinanceRoute } from "@/lib/event-public-finance-route";
import { requireGarageSession } from "@/lib/server-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Owner: angka yang sekarang tampil di platform sebagai isian awal (belum disimpan). */
export async function GET(request: Request) {
  const session = await requireGarageSession(["Owner"]);
  if (session.response) return session.response;
  const eventId = new URL(request.url).searchParams.get("eventId") ?? "";
  if (!/^[0-9a-f-]{36}$/i.test(eventId)) return fail(400, "INVALID_EVENT", "Pilih event.");
  return publicFinanceRoute(() => prefillPublicFinance(eventId, session.data));
}
