import { fail } from "@/lib/api-response";
import { getPublicFinance, savePublicFinance } from "@/lib/event-public-finance";
import { publicFinanceRoute } from "@/lib/event-public-finance-route";
import { requireGarageSession } from "@/lib/server-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const eventIdOf = (request: Request) => new URL(request.url).searchParams.get("eventId");

/** Owner: angka transparansi publik satu event (tanpa eventId → event master pertama). */
export async function GET(request: Request) {
  const session = await requireGarageSession(["Owner"]);
  if (session.response) return session.response;
  const eventId = eventIdOf(request);
  if (eventId && !/^[0-9a-f-]{36}$/i.test(eventId)) return fail(400, "INVALID_EVENT", "Event tidak valid.");
  return publicFinanceRoute(() => getPublicFinance(eventId, session.data));
}

/** Owner: simpan angka transparansi { enabled, data } — tampil di halaman event bila enabled. */
export async function PUT(request: Request) {
  const session = await requireGarageSession(["Owner"]);
  if (session.response) return session.response;
  const eventId = eventIdOf(request) ?? "";
  if (!/^[0-9a-f-]{36}$/i.test(eventId)) return fail(400, "INVALID_EVENT", "Pilih event.");
  const body = await request.json().catch(() => null);
  return publicFinanceRoute(() => savePublicFinance(eventId, body, session.data));
}
