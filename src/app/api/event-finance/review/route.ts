import { readJson } from "@/lib/api-response";
import { eventFinanceRoute } from "@/lib/event-finance-route";
import { eventReviewSchema, saveEventReview } from "@/lib/event-finance-service";
import { requireGarageSession } from "@/lib/server-auth";

export const runtime = "nodejs";

/** Simpan evaluasi pasca-event (Owner): nilai 1–5, yang berhasil, kendala, insiden, perbaikan berikutnya. */
export async function PUT(request: Request) {
  const session = await requireGarageSession(["Owner"]);
  if (session.response) return session.response;
  const body = await readJson(request, eventReviewSchema);
  if (body.error) return body.error;
  return eventFinanceRoute(() => saveEventReview(body.data, session.data));
}
