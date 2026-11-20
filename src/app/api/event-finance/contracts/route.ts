import { readJson } from "@/lib/api-response";
import { eventFinanceRoute } from "@/lib/event-finance-route";
import { contractSchema, createVendorContract } from "@/lib/event-finance-service";
import { requireGarageSession } from "@/lib/server-auth";

export const runtime = "nodejs";

/** Tambah kontrak vendor pada pos anggaran event (Owner). Tidak menggerakkan uang. */
export async function POST(request: Request) {
  const session = await requireGarageSession(["Owner"]);
  if (session.response) return session.response;
  const body = await readJson(request, contractSchema);
  if (body.error) return body.error;
  return eventFinanceRoute(() => createVendorContract(body.data, session.data), 201);
}
