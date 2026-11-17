import { readJson } from "@/lib/api-response";
import { eventFinanceRoute } from "@/lib/event-finance-route";
import { expensePaymentSchema, recordExpensePayment } from "@/lib/event-finance-service";
import { requireGarageSession } from "@/lib/server-auth";

export const runtime = "nodejs";

/** Catat biaya event yang sudah dibayar (Owner). Rekening → baris buku kas; uang pribadi Owner → tanpa baris kas. */
export async function POST(request: Request) {
  const session = await requireGarageSession(["Owner"]);
  if (session.response) return session.response;
  const body = await readJson(request, expensePaymentSchema);
  if (body.error) return body.error;
  return eventFinanceRoute(() => recordExpensePayment(body.data, session.data), 201);
}
