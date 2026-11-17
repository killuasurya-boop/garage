import { readJson } from "@/lib/api-response";
import { eventFinanceRoute } from "@/lib/event-finance-route";
import { budgetLinePatchSchema, updateBudgetLine } from "@/lib/event-finance-service";
import { requireGarageSession } from "@/lib/server-auth";

export const runtime = "nodejs";

/** Ubah / arsipkan pos anggaran event (Owner). */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireGarageSession(["Owner"]);
  if (session.response) return session.response;
  const body = await readJson(request, budgetLinePatchSchema);
  if (body.error) return body.error;
  const { id } = await params;
  return eventFinanceRoute(() => updateBudgetLine(id, body.data, session.data));
}
