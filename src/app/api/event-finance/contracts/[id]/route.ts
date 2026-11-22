import { readJson } from "@/lib/api-response";
import { eventFinanceRoute } from "@/lib/event-finance-route";
import { contractPatchSchema, updateVendorContract } from "@/lib/event-finance-service";
import { requireGarageSession } from "@/lib/server-auth";

export const runtime = "nodejs";

/** Ubah kontrak vendor, tandai Selesai, atau Batalkan (alasan wajib). Kontrak selesai/batal tidak bisa diubah (Owner). */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireGarageSession(["Owner"]);
  if (session.response) return session.response;
  const body = await readJson(request, contractPatchSchema);
  if (body.error) return body.error;
  const { id } = await params;
  return eventFinanceRoute(() => updateVendorContract(id, body.data, session.data));
}
