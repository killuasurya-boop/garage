import { readJson } from "@/lib/api-response";
import { eventFinanceRoute } from "@/lib/event-finance-route";
import { importPlatformBudget, importPlatformBudgetSchema } from "@/lib/event-finance-service";
import { requireGarageSession } from "@/lib/server-auth";

export const runtime = "nodejs";
export const maxDuration = 30;

/** Impor RAB event dari platform GIGS sebagai pos anggaran (rencana saja, tanpa uang bergerak). Tidak menimpa pos yang ada. */
export async function POST(request: Request) {
  const session = await requireGarageSession(["Owner"]);
  if (session.response) return session.response;
  const body = await readJson(request, importPlatformBudgetSchema);
  if (body.error) return body.error;
  return eventFinanceRoute(() => importPlatformBudget(body.data, session.data));
}
