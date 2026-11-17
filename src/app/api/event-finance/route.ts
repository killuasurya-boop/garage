import { readJson } from "@/lib/api-response";
import { eventFinanceRoute } from "@/lib/event-finance-route";
import { budgetLineSchema, createBudgetLine, getEventFinance } from "@/lib/event-finance-service";
import { requireGarageSession } from "@/lib/server-auth";

export const runtime = "nodejs";

/** Keuangan satu event (Owner): anggaran vs realisasi, pembayaran, sponsor, penjualan menu, untung/rugi. `?eventId=`. */
export async function GET(request: Request) {
  const session = await requireGarageSession(["Owner"]);
  if (session.response) return session.response;
  const eventId = new URL(request.url).searchParams.get("eventId");
  return eventFinanceRoute(() => getEventFinance(session.data, eventId && /^[0-9a-f-]{36}$/i.test(eventId) ? eventId : null));
}

/** Tambah pos anggaran. */
export async function POST(request: Request) {
  const session = await requireGarageSession(["Owner"]);
  if (session.response) return session.response;
  const body = await readJson(request, budgetLineSchema);
  if (body.error) return body.error;
  return eventFinanceRoute(() => createBudgetLine(body.data, session.data), 201);
}
